import { randomUUID } from 'node:crypto';
import { Money, quoteResponseSchema, type QuoteRequest } from '@northbook/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { ledgerEntries, ledgerTransactions, quotes, settings, spreadBands } from '../db/schema.js';
import { seedIdentity } from '../db/seed.js';
import { createLogger } from '../logging.js';
import { acceptQuote, issueQuote } from '../quoting.js';
import { testDatabase } from '../test-database.js';
import { testBooks, testMarketData } from '../test-pricing.js';
import { guardClientPrice } from './firm.js';
import type { PricedBook } from './depth.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
const actor = { userId: 'maple-trader', organisationId: 'maple' };
const input = { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' } as const;
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
  app = buildApp(fixture.database, createLogger({ write() {} }), { pricing: testMarketData });
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});
const issue = (request: QuoteRequest = input, organisationId = 'maple', books: PricedBook[] = testBooks()) =>
  fixture.database.db.transaction((tx) =>
    issueQuote(tx, request, { organisationId, userId: `${organisationId}-trader` }, { books }),
  );

it('reproduces both D14 worked examples from depth, fee and spread configuration', async () => {
  const sell = await issue();
  expect(new Money(sell.quoteAmount).toFixed(2)).toBe('207892.32');
  expect(new Money(sell.baseAmount).toFixed()).toBe('50');
  expect(new Money(sell.clientPrice).toFixed()).toBe('4157.8464');
  const buy = await issue({ pair: 'BTC/CAD', side: 'BUY', fixed: 'base', amount: '2' });
  expect(new Money(buy.marketPrice).toFixed()).toBe('95247');
  expect(new Money(buy.quoteAmount).toFixed(2)).toBe('191160.73');
  expect(new Money(buy.baseAmount).toFixed()).toBe('2');
  expect(buy.route).toMatchObject({
    mode: 'replay',
    marketQuoteAmount: '190494.00',
    legs: [expect.objectContaining({ feeRate: '0.0026' })],
  });
});

it('applies tier and size-band spreads, including the exact 100k and 500k boundaries', async () => {
  const better = await issue();
  const standard = await issue(input, 'harbourline');
  expect(new Money(better.spreadBps).toFixed()).toBe('35');
  expect(new Money(standard.spreadBps).toFixed()).toBe('50');
  expect(new Money(better.quoteAmount).gt(standard.quoteAmount)).toBe(true);
  const stable: PricedBook = {
    feeRate: '0',
    book: {
      venue: 'kraken',
      market: { symbol: 'USDC/CAD', base: 'USDC', quote: 'CAD' },
      receivedAt: Date.now(),
      replayed: true,
      bids: [{ price: '1', size: '3000000' }],
      asks: [{ price: '1', size: '3000000' }],
    },
  };
  for (const [amount, bps] of [
    ['99999.99', '45'],
    ['100000', '35'],
    ['500000', '35'],
    ['500000.01', '25'],
  ]) {
    const quote = await issue({ pair: 'USDC/CAD', side: 'SELL', fixed: 'quote', amount: amount! }, 'maple', [
      stable,
    ]);
    expect(new Money(quote.spreadBps).toFixed()).toBe(bps);
    expect(new Money(quote.quoteAmount).eq(amount!)).toBe(true);
  }
});

it('refuses below-minimum, above-maximum, missing prices and a client-better-than-market price without inserting quotes', async () => {
  const before = await fixture.database.db.select({ id: quotes.id }).from(quotes);
  await expect(issue({ ...input, amount: '1' })).rejects.toMatchObject({
    code: 'below_minimum',
    message: expect.stringContaining('10000 CAD'),
  });
  await expect(issue({ ...input, fixed: 'quote', amount: '2000001' })).rejects.toMatchObject({
    code: 'above_maximum',
  });
  await expect(issue(input, 'maple', [])).rejects.toMatchObject({ code: 'price_unavailable' });
  await expect(
    fixture.database.db.transaction((tx) =>
      issueQuote(tx, input, actor, {
        suppliedPrice: {
          marketPrice: '4172.45',
          clientPrice: '5000',
          spreadBps: '0',
          route: {},
        },
      }),
    ),
  ).rejects.toMatchObject({ code: 'price_unavailable' });
  expect(() => guardClientPrice('BUY', '1', '99', '100')).toThrow(
    expect.objectContaining({ code: 'price_unavailable' }),
  );
  expect(await fixture.database.db.select({ id: quotes.id }).from(quotes)).toEqual(before);
});

it('values USD requests in CAD for limits and prices fixed-quote requests with the spread inside the budget', async () => {
  await expect(issue({ pair: 'ETH/USD', side: 'BUY', fixed: 'quote', amount: '7100' })).rejects.toMatchObject(
    { code: 'below_minimum' },
  );
  const valid = await issue({ pair: 'ETH/USD', side: 'BUY', fixed: 'quote', amount: '10000' });
  expect(new Money(valid.quoteAmount).toFixed()).toBe('10000');
  expect(valid.route.notionalCad).toBe('14000');
  await expect(
    issue({ pair: 'ETH/USD', side: 'BUY', fixed: 'quote', amount: '400000' }, 'harbourline'),
  ).rejects.toMatchObject({ code: 'above_maximum' });
  const buy = await issue({ pair: 'BTC/CAD', side: 'BUY', fixed: 'quote', amount: '191160.73' });
  expect(new Money(buy.baseAmount).toFixed()).toBe('2.00000001');
  expect(new Money(buy.quoteAmount).toFixed()).toBe('191160.73');
});

it('stores a private route snapshot and keeps already issued quotes stable after configuration changes', async () => {
  const persona = await app.inject({
    method: 'POST',
    url: '/api/demo/persona',
    payload: { userId: actor.userId },
  });
  const headers = {
    cookie: (persona.headers['set-cookie'] as string).split(';')[0]!,
    'idempotency-key': randomUUID(),
  };
  const response = await app.inject({ method: 'POST', url: '/api/quotes', payload: input, headers });
  expect(response.statusCode).toBe(201);
  const quote = quoteResponseSchema.parse(response.json());
  for (const privateField of ['route', 'spread', 'marketPrice', 'kraken', 'coinbase', 'binance'])
    expect(response.body).not.toContain(privateField);
  expect(quote.replayed).toBe(true);
  const [stored] = await fixture.database.db.select().from(quotes).where(eq(quotes.id, quote.id));
  expect(stored!.route).toMatchObject({
    path: ['ETH', 'CAD'],
    legs: [expect.objectContaining({ venue: 'kraken' })],
  });
  await fixture.database.db
    .update(settings)
    .set({ quoteLifetimeSeconds: 30 })
    .where(eq(settings.id, 'default'));
  try {
    const next = await issue();
    expect(next.expiresAt.getTime() - next.createdAt.getTime()).toBe(30000);
    const current = await app.inject({ url: `/api/quotes/${quote.id}`, headers });
    expect(current.json()).toEqual(response.json());
    const accepted = await fixture.database.db.transaction((tx) => acceptQuote(tx, quote.id, actor));
    expect(accepted.quoteAmount).toBe(stored!.quoteAmount);
  } finally {
    await fixture.database.db.update(settings).set({ quoteLifetimeSeconds: 15 });
  }
});

it('posts zero-spread fixed-quote trades without manufacturing revenue from price storage rounding', async () => {
  await fixture.database.db.update(spreadBands).set({ bps: '0' }).where(eq(spreadBands.tier, 'Tier 1'));
  try {
    for (const side of ['BUY', 'SELL'] as const) {
      const quote = await issue({ pair: 'BTC/CAD', side, fixed: 'quote', amount: '100000' });
      const trade = await fixture.database.db.transaction((tx) => acceptQuote(tx, quote.id, actor));
      const entries = await fixture.database.db
        .select()
        .from(ledgerEntries)
        .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
        .where(eq(ledgerTransactions.tradeId, trade.id));
      expect(entries).toHaveLength(4);
    }
  } finally {
    for (const [band, bps] of ['45', '35', '25'].entries()) {
      await fixture.database.pool.query('UPDATE spread_bands SET bps=$1 WHERE tier=$2 AND band=$3', [
        bps,
        'Tier 1',
        band,
      ]);
    }
  }
});
