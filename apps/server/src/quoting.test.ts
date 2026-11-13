import { randomUUID } from 'node:crypto';
import { quoteResponseSchema, tradeResponseSchema } from '@northbook/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { seedIdentity } from './db/seed.js';
import { ledgerTransactions, quotes, tradeEvents, trades } from './db/schema.js';
import { createLogger } from './logging.js';
import { acceptQuote } from './quoting.js';
import { issueTestQuote as issueQuote, testMarketData } from './test-pricing.js';
import { testDatabase } from './test-database.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
let cookie: string;
const input = { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' } as const;
const actor = { userId: 'maple-trader', organisationId: 'maple' };
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
  app = buildApp(fixture.database, createLogger({ write() {} }), { pricing: testMarketData });
  const response = await app.inject({
    method: 'POST',
    url: '/api/demo/persona',
    payload: { userId: actor.userId },
  });
  cookie = (response.headers['set-cookie'] as string).split(';')[0]!;
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});
const post = (url: string, payload: object = {}, key = randomUUID(), extraHeaders = {}) =>
  app.inject({
    method: 'POST',
    url,
    payload,
    headers: { cookie, 'idempotency-key': key, ...extraHeaders },
  });

it('20 concurrent acceptances create exactly one trade and booking event at the quoted amounts', async () => {
  const key = randomUUID();
  const issued = await post('/api/quotes', input, key);
  expect(issued.statusCode).toBe(201);
  const quote = quoteResponseSchema.parse(issued.json());
  expect((await post('/api/quotes', input, key)).json()).toEqual(issued.json());
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => post(`/api/quotes/${quote.id}/accept`)),
  );
  expect(responses.map((response) => response.statusCode)).toEqual(Array(20).fill(200));
  const booked = responses.map((response) => tradeResponseSchema.parse(response.json()));
  expect(new Set(booked.map((trade) => trade.id)).size).toBe(1);
  expect(booked[0]).toMatchObject({
    baseAmount: quote.baseAmount,
    quoteAmount: quote.quoteAmount,
    clientPrice: quote.clientPrice,
  });
  const rows = await fixture.database.db.select().from(trades).where(eq(trades.quoteId, quote.id));
  expect(rows).toHaveLength(1);
  expect(
    await fixture.database.db.select().from(tradeEvents).where(eq(tradeEvents.tradeId, rows[0]!.id)),
  ).toHaveLength(1);
  expect(
    await fixture.database.db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.tradeId, rows[0]!.id)),
  ).toHaveLength(1);
});

it('refuses late acceptance by database time and reports expired at read time', async () => {
  const quote = await fixture.database.db.transaction((tx) =>
    issueQuote(tx, input, actor, { asOf: new Date('2026-01-01T00:00:00Z') }),
  );
  const response = await post(`/api/quotes/${quote.id}/accept`);
  expect(response.statusCode).toBe(410);
  expect(response.json().error.code).toBe('quote_expired');
  expect(await fixture.database.db.select().from(trades).where(eq(trades.quoteId, quote.id))).toEqual([]);
  const read = await app.inject({ url: `/api/quotes/${quote.id}`, headers: { cookie } });
  expect(read.json().status).toBe('expired');
});

it('keeps the supplied clock internal and refuses HTTP clock/price overrides', async () => {
  const asOf = new Date('2026-01-02T00:00:00Z');
  const quote = await fixture.database.db.transaction((tx) => issueQuote(tx, input, actor, { asOf }));
  for (const url of [
    `/api/quotes/${quote.id}/accept?asOf=${asOf.toISOString()}`,
    `/api/quotes/${quote.id}/accept?clock=2026-01-01`,
  ]) {
    const response = await post(url);
    expect(response.statusCode).toBe(400);
  }
  expect((await post(`/api/quotes/${quote.id}/accept`, { asOf: asOf.toISOString() })).statusCode).toBe(400);
  expect(
    (await post(`/api/quotes/${quote.id}/accept`, {}, randomUUID(), { 'x-as-of': asOf.toISOString() }))
      .statusCode,
  ).toBe(410);
  expect((await post('/api/quotes', { ...input, suppliedPrice: '1' })).statusCode).toBe(400);
  // The same historical quote can be accepted by the internal seed/test seam.
  const trade = await fixture.database.db.transaction((tx) =>
    acceptQuote(tx, quote.id, actor, { asOf: new Date(asOf.getTime() + 1000) }),
  );
  expect(trade.quoteId).toBe(quote.id);
});

it('treats the expiry boundary as expired and rolls back a failed booking atomically', async () => {
  const quote = await fixture.database.db.transaction((tx) => issueQuote(tx, input, actor));
  await expect(
    fixture.database.db.transaction((tx) => acceptQuote(tx, quote.id, actor, { asOf: quote.expiresAt })),
  ).rejects.toMatchObject({ code: 'quote_expired' });
  await expect(
    fixture.database.db.transaction((tx) => acceptQuote(tx, quote.id, { ...actor, userId: 'missing-user' })),
  ).rejects.toThrow();
  const [unchanged] = await fixture.database.db.select().from(quotes).where(eq(quotes.id, quote.id));
  expect(unchanged!.status).toBe('active');
  expect(await fixture.database.db.select().from(trades).where(eq(trades.quoteId, quote.id))).toEqual([]);
});
