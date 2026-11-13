import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { seedIdentity } from './db/seed.js';
import { ledgerTransactions, tradeEvents } from './db/schema.js';
import { createLogger } from './logging.js';
import { acceptQuote } from './quoting.js';
import { issueTestQuote as issueQuote } from './test-pricing.js';
import { testDatabase } from './test-database.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
let cookie: string;
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
  app = buildApp(fixture.database, createLogger({ write() {} }));
  const response = await app.inject({
    method: 'POST',
    url: '/api/demo/persona',
    payload: { userId: 'staff' },
  });
  cookie = (response.headers['set-cookie'] as string).split(';')[0]!;
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});
const book = () =>
  fixture.database.db.transaction(async (tx) => {
    const actor = { userId: 'maple-trader', organisationId: 'maple' };
    const quote = await issueQuote(tx, { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' }, actor);
    return acceptQuote(tx, quote.id, actor);
  });
const action = (id: string, payload: object, key = randomUUID()) =>
  app.inject({
    method: 'POST',
    url: `/api/staff/trades/${id}/events`,
    payload,
    headers: { cookie, 'idempotency-key': key },
  });

it('settles through the normal path, recording one simulated event per action and actor', async () => {
  const trade = await book();
  const invalid = await action(trade.id, { action: 'payout_sent' });
  expect(invalid.statusCode).toBe(409);
  expect(invalid.json().error.code).toBe('invalid_transition');
  const parallel = await Promise.all(
    Array.from({ length: 10 }, () => action(trade.id, { action: 'funds_received' })),
  );
  expect(
    parallel.every((response) => response.statusCode === 200 && response.json().state === 'funds_received'),
  ).toBe(true);
  const key = randomUUID();
  const payout = await action(trade.id, { action: 'payout_sent' }, key);
  expect(payout.json().state).toBe('payout_sent');
  expect((await action(trade.id, { action: 'payout_sent' }, key)).json()).toEqual(payout.json());
  expect((await action(trade.id, { action: 'payout_confirmed' })).json().state).toBe('settled');
  expect((await action(trade.id, { action: 'funds_received' })).json().state).toBe('settled');
  const events = await fixture.database.db
    .select()
    .from(tradeEvents)
    .where(eq(tradeEvents.tradeId, trade.id));
  expect(events).toHaveLength(4);
  expect(
    await fixture.database.db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.tradeId, trade.id)),
  ).toHaveLength(3);
  expect(events.filter((event) => event.simulated)).toHaveLength(3);
  expect(events.filter((event) => event.simulated).every((event) => event.actorId === 'staff')).toBe(true);
  expect((await action(trade.id, { action: 'cancel', reason: 'Too late' })).statusCode).toBe(409);
});

it('requires a nonblank reason and cancels only before funds arrive', async () => {
  const trade = await book();
  for (const payload of [{ action: 'cancel' }, { action: 'cancel', reason: '   ' }]) {
    const response = await action(trade.id, payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_failed');
  }
  const response = await action(trade.id, { action: 'cancel', reason: 'Client requested cancellation.' });
  expect(response.json()).toMatchObject({
    state: 'cancelled',
    cancellationReason: 'Client requested cancellation.',
  });
  const repeat = await action(trade.id, {
    action: 'cancel',
    reason: 'Different reason must not replace the original.',
  });
  expect(repeat.json().cancellationReason).toBe('Client requested cancellation.');
  expect(
    await fixture.database.db.select().from(tradeEvents).where(eq(tradeEvents.tradeId, trade.id)),
  ).toHaveLength(2);
  expect((await action(trade.id, { action: 'funds_received' })).statusCode).toBe(409);
  const funded = await book();
  await action(funded.id, { action: 'funds_received' });
  expect(
    (await action(funded.id, { action: 'cancel', reason: 'Not permitted after funding' })).statusCode,
  ).toBe(409);
});
