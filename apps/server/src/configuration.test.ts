import {
  configurationSchema,
  configurationUpdate,
  configurationUpdateSchema,
  quoteResponseSchema,
} from '@northbook/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { seedIfEmpty } from './db/seed.js';
import { createLogger } from './logging.js';
import { testDatabase } from './test-database.js';
import { testBooks } from './test-pricing.js';
import { PricingService, type AdapterFactory } from './pricing/service.js';
let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
let service: PricingService;
let staff: { cookie: string }, client: { cookie: string };
const factory: AdapterFactory = async (id, feeRate) => {
  let running = false;
  return {
    id,
    markets: testBooks().map(({ book }) => book.market),
    takerFee: () => feeRate,
    async start() {
      running = true;
    },
    async stop() {
      running = false;
    },
    books: () => (running ? testBooks().map(({ book }) => ({ ...book, venue: id })) : []),
    health: () => ({
      venue: id,
      status: running ? 'connected' : 'disconnected',
      lastUpdate: Date.now(),
      replayed: true,
    }),
  };
};
beforeAll(async () => {
  fixture = await testDatabase();
  await seedIfEmpty(fixture.owner);
  service = new PricingService(fixture.database, 'replay', factory);
  await service.start();
  app = buildApp(fixture.database, createLogger({ write() {} }), { pricing: service });
  const login = async (userId: string) => ({
    cookie: (
      (await app.inject({ method: 'POST', url: '/api/demo/persona', payload: { userId } })).headers[
        'set-cookie'
      ] as string
    ).split(';')[0]!,
  });
  staff = await login('staff');
  client = await login('maple-trader');
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});
async function current() {
  return configurationSchema.parse((await app.inject({ url: '/api/staff/config', headers: staff })).json());
}
const put = (payload: unknown, headers = staff) =>
  app.inject({ method: 'PUT', url: '/api/staff/config', headers, payload: payload as object });
async function quote() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/quotes',
    headers: { ...client, 'idempotency-key': randomUUID() },
    payload: { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' },
  });
  expect(response.statusCode).toBe(201);
  return quoteResponseSchema.parse(response.json());
}
it('refuses invalid and incomplete configurations atomically and protects the staff boundary', async () => {
  const before = await current();
  const input = configurationUpdate(before);
  expect((await app.inject({ url: '/api/staff/config' })).statusCode).toBe(401);
  expect((await app.inject({ url: '/api/staff/config', headers: client })).statusCode).toBe(403);
  expect((await put(input, client)).statusCode).toBe(403);
  const invalid: unknown[] = [
    { ...input, spreadBands: input.spreadBands.map((row, i) => (i ? row : { ...row, bps: '-1' })) },
    { ...input, settings: { ...input.settings, referenceSpreadBps: 'abc' } },
    { ...input, settings: { ...input.settings, quoteLifetimeSeconds: 4 } },
    { ...input, settings: { ...input.settings, minimumTradeCad: '10000.001' } },
    {
      ...input,
      organisations: input.organisations.map((row, i) => (i ? row : { ...row, maxTradeSize: '1' })),
    },
    { ...input, spreadBands: Array.from({ length: 6 }, () => input.spreadBands[0]) },
    { ...input, venues: input.venues.slice(1) },
    { ...input, organisations: input.organisations.slice(1) },
    { ...input, organisations: input.organisations.map((row) => ({ ...row, kybState: 'approved' })) },
  ];
  for (const payload of invalid) {
    expect((await put(payload)).statusCode).toBe(400);
    expect(await current()).toEqual(before);
  }
  expect(() =>
    configurationUpdateSchema.safeParse({
      ...input,
      settings: { ...input.settings, minimumTradeCad: 'oops' },
    }),
  ).not.toThrow();
});
it('changes lifetime and pricing only for new quotes, retaining the existing firm quote exactly', async () => {
  const first = await quote();
  const input = configurationUpdate(await current());
  input.settings.quoteLifetimeSeconds = 30;
  input.spreadBands = input.spreadBands.map((row) => ({ ...row, bps: '100' }));
  expect((await put(input)).statusCode).toBe(200);
  const second = await quote();
  expect(Date.parse(first.expiresAt) - Date.parse(first.createdAt)).toBe(15000);
  expect(Date.parse(second.expiresAt) - Date.parse(second.createdAt)).toBe(30000);
  expect(second.receiveAmount).not.toBe(first.receiveAmount);
  expect((await app.inject({ url: `/api/quotes/${first.id}`, headers: client })).json()).toEqual(first);
});
it('detects concurrent edits, and disables venues in the live pricing module', async () => {
  const initial = configurationUpdate(await current());
  const other = { ...initial, settings: { ...initial.settings, quoteLifetimeSeconds: 45 } };
  const first = { ...initial, settings: { ...initial.settings, quoteLifetimeSeconds: 60 } };
  const results = await Promise.all([put(other), put(first)]);
  expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  expect(results.find((result) => result.statusCode === 409)!.json().error.code).toBe(
    'configuration_conflict',
  );
  const disable = configurationUpdate(await current());
  disable.venues = disable.venues.map((row) => ({ ...row, enabled: row.id === 'coinbase' }));
  expect((await put(disable)).statusCode).toBe(200);
  expect(service.freshBooks().every(({ book }) => book.venue === 'coinbase')).toBe(true);
  expect(service.freshBooks().length).toBeGreaterThan(0);
  const health = (await app.inject({ url: '/api/staff/venues', headers: staff })).json();
  expect(health).toContainEqual(
    expect.objectContaining({ id: 'kraken', status: 'disabled', enabled: false }),
  );
  expect((await quote()).replayed).toBe(true);
});
