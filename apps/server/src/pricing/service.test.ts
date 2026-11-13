import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { venues } from '../db/schema.js';
import { seedIdentity } from '../db/seed.js';
import { createLogger } from '../logging.js';
import { testDatabase } from '../test-database.js';
import { adapterFactory, PricingService, pricingMode, type AdapterFactory } from './service.js';
import type { OrderBook, VenueAdapter, VenueId, VenueListener } from './venue.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let service: PricingService;
let app: ReturnType<typeof buildApp>;
const data = new Map<VenueId, OrderBook[]>();
const stopped: VenueId[] = [];
const request = { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' } as const;
function book(venue: VenueId, receivedAt: number): OrderBook {
  return {
    venue,
    market: { symbol: 'ETH/CAD', base: 'ETH', quote: 'CAD' },
    receivedAt,
    replayed: true,
    bids: [{ price: venue === 'kraken' ? '4200' : '4100', size: '100' }],
    asks: [{ price: '4300', size: '100' }],
  };
}
const factory: AdapterFactory = async (id, feeRate) => {
  let running = false;
  return {
    id,
    markets: [book(id, 0).market],
    takerFee: () => feeRate,
    async start(listener: VenueListener) {
      running = true;
      for (const item of data.get(id) ?? []) listener({ type: 'book', book: item });
    },
    async stop() {
      running = false;
      stopped.push(id);
    },
    books: () => (running ? (data.get(id) ?? []) : []),
    health: () => ({
      venue: id,
      status: running ? 'connected' : 'disconnected',
      lastUpdate: data.get(id)?.[0]?.receivedAt ?? null,
      replayed: true,
    }),
  };
};
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
  await fixture.database.db.update(venues).set({ enabled: false }).where(eq(venues.id, 'binance'));
  service = new PricingService(fixture.database, 'replay', factory);
  await service.start();
  app = buildApp(fixture.database, createLogger({ write() {} }), { pricing: service });
});
beforeEach(async () => {
  data.set('kraken', [book('kraken', Date.now())]);
  data.set('coinbase', [book('coinbase', Date.now())]);
  await fixture.database.db.update(venues).set({ enabled: true }).where(eq(venues.id, 'kraken'));
  await service.refreshConfiguration();
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});

it('excludes one stale venue and refuses a price when all venues are stale', () => {
  expect(service.price(request).legs[0]!.venue).toBe('kraken');
  expect(service.health().find((venue) => venue.id === 'kraken')).toMatchObject({
    markets: 1,
    readyMarkets: 1,
  });
  data.set('kraken', [book('kraken', Date.now() - 6000)]);
  expect(service.price(request).legs[0]!.venue).toBe('coinbase');
  expect(service.health().find((venue) => venue.id === 'kraken')).toMatchObject({
    status: 'stale',
    markets: 1,
    readyMarkets: 0,
  });
  data.set('coinbase', [book('coinbase', Date.now() - 6000)]);
  expect(() => service.price(request)).toThrow(expect.objectContaining({ code: 'price_unavailable' }));
});

it('honours an external database disable through the poll within five seconds and can re-enable', async () => {
  expect(service.price(request).legs[0]!.venue).toBe('kraken');
  await fixture.database.db.update(venues).set({ enabled: false }).where(eq(venues.id, 'kraken'));
  await vi.waitFor(
    () => expect(service.health().find((venue) => venue.id === 'kraken')!.status).toBe('disabled'),
    { timeout: 4500, interval: 50 },
  );
  expect(service.price(request).legs[0]!.venue).toBe('coinbase');
  expect(stopped).toContain('kraken');
  await fixture.database.db.update(venues).set({ enabled: true }).where(eq(venues.id, 'kraken'));
  await service.refreshConfiguration();
  expect(service.price(request).legs[0]!.venue).toBe('kraken');
});

it('fails closed when configuration polling has not succeeded for five seconds', () => {
  expect(service.freshBooks(Date.now() + 5001)).toEqual([]);
});

it('restricts venue controls to staff and reports replay health without public fee disclosure', async () => {
  expect((await app.inject({ url: '/api/staff/venues' })).statusCode).toBe(401);
  for (const userId of ['maple-trader', 'staff']) {
    const persona = await app.inject({ method: 'POST', url: '/api/demo/persona', payload: { userId } });
    const headers = { cookie: (persona.headers['set-cookie'] as string).split(';')[0]! };
    const change = await app.inject({
      method: 'PUT',
      url: '/api/staff/venues/kraken',
      headers,
      payload: { enabled: false },
    });
    expect(change.statusCode).toBe(userId === 'staff' ? 200 : 403);
    if (userId === 'staff') {
      expect((await app.inject({ url: '/api/staff/venues', headers })).json()).toContainEqual(
        expect.objectContaining({ id: 'kraken', status: 'disabled', readyMarkets: 0, replayed: true }),
      );
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/staff/venues/kraken',
            headers,
            payload: { enabled: true, feeRate: '0' },
          })
        ).statusCode,
      ).toBe(400);
    }
  }
  const health = (await app.inject({ url: '/api/healthz' })).json();
  expect(health.pricingMode).toBe('replay');
  expect(JSON.stringify(health)).not.toContain('feeRate');
});

it('selects replay explicitly and produces all three venues without opening a network connection', async () => {
  expect(pricingMode(undefined)).toBe('replay');
  expect(pricingMode('live')).toBe('live');
  expect(() => pricingMode('unknown')).toThrow();
  vi.stubGlobal(
    'WebSocket',
    class {
      constructor() {
        throw new Error('Network forbidden in replay test');
      }
    },
  );
  const fetch = vi.fn(() => {
    throw new Error('Network forbidden in replay test');
  });
  vi.stubGlobal('fetch', fetch);
  const adapters: VenueAdapter[] = [];
  try {
    const seen = new Set<VenueId>();
    for (const id of ['kraken', 'coinbase', 'binance'] as const) {
      const adapter = await adapterFactory('replay')(id, '0.001');
      adapters.push(adapter);
      await adapter.start((event) => {
        if (event.type === 'book') {
          expect(event.book.replayed).toBe(true);
          seen.add(id);
        }
      });
    }
    await vi.waitFor(() => expect(seen.size).toBe(3), { timeout: 5000 });
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await Promise.all(adapters.map((adapter) => adapter.stop()));
    vi.unstubAllGlobals();
  }
});

it('refreshes reset configuration in a new transaction after an old poll fails', async () => {
  await fixture.database.db.update(venues).set({ enabled: false }).where(eq(venues.id, 'kraken'));
  let rejectPoll: (error: Error) => void = () => {};
  const transaction = vi.spyOn(fixture.database.db, 'transaction').mockImplementationOnce(
    () =>
      new Promise<never>((_resolve, reject) => {
        rejectPoll = reject;
      }),
  );
  try {
    const oldPoll = service.refreshConfiguration().catch(() => {});
    const fresh = service.refreshAfterReset();
    rejectPoll(new Error('Pricing settings are missing from the pre-reset snapshot.'));
    await oldPoll;
    await fresh;
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(service.health().find((venue) => venue.id === 'kraken')!.status).toBe('disabled');
  } finally {
    transaction.mockRestore();
  }
});
