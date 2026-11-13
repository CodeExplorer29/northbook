import { blotterSchema, Money } from '@northbook/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { readBlotter } from './blotter.js';
import { seedIfEmpty } from './db/seed.js';
import { createLogger } from './logging.js';
import { testDatabase } from './test-database.js';
let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => {
  fixture = await testDatabase();
  await seedIfEmpty(fixture.owner);
  app = buildApp(fixture.database, createLogger({ write() {} }));
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});
it('derives UTC summaries from event dates and net ledger postings without mixing currencies', async () => {
  const data = blotterSchema.parse(
    JSON.parse(JSON.stringify(await readBlotter(fixture.database, new Date('2026-11-12T23:59:59Z')))),
  );
  expect(data.trades).toHaveLength(7);
  expect(data.quotes).toHaveLength(9);
  expect(data.summary).toMatchObject({ inProgress: 3, settledToday: 2, awaitingFunds: 1 });
  expect(data.summary.revenue.map((item) => item.currency).sort()).toEqual(['CAD', 'USD']);
  const actual = await fixture.database.pool
    .query(`SELECT e.currency, sum(CASE WHEN e.direction='credit' THEN e.amount ELSE -e.amount END)::text amount
    FROM ledger_entries e JOIN accounts a ON a.id=e.account_id JOIN ledger_transactions l ON l.id=e.transaction_id
    JOIN trade_events v ON v.id=l.source_event_id WHERE a.type='spread_revenue' AND v.created_at >= '2026-11-12T00:00:00Z' AND v.created_at < '2026-11-13T00:00:00Z' GROUP BY e.currency`);
  for (const row of actual.rows)
    expect(
      new Money(data.summary.revenue.find((item) => item.currency === row.currency)!.amount).eq(row.amount),
    ).toBe(true);
  const tomorrow = await readBlotter(fixture.database, new Date('2026-11-13T00:00:00Z'));
  expect(tomorrow.summary).toMatchObject({ settledToday: 0, revenue: [] });
  const yesterday = await readBlotter(fixture.database, new Date('2026-11-11T23:59:59Z'));
  expect(yesterday.summary.revenue.find((item) => item.currency === 'USD')?.amount).toMatch(/^0(?:\.0+)?$/);
  expect(data.quotes.find((quote) => quote.id === 'NB-Q-000342')).toMatchObject({
    organisation: { id: 'maple' },
    tradeId: 'NB-T-000128',
    route: { legs: expect.arrayContaining([expect.objectContaining({ venue: 'kraken' })]) },
  });
});
it('refuses visitors and clients and returns private route data only to staff', async () => {
  expect((await app.inject({ url: '/api/staff/blotter' })).statusCode).toBe(401);
  for (const userId of ['maple-trader', 'staff']) {
    const login = await app.inject({ method: 'POST', url: '/api/demo/persona', payload: { userId } });
    const cookie = (login.headers['set-cookie'] as string).split(';')[0]!;
    const result = await app.inject({ url: '/api/staff/blotter', headers: { cookie } });
    expect(result.statusCode).toBe(userId === 'staff' ? 200 : 403);
    if (userId === 'staff') expect(blotterSchema.parse(result.json()).quotes).toHaveLength(9);
  }
});
