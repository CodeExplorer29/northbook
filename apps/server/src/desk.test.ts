import { deskSchema, Money } from '@northbook/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { seedIfEmpty } from './db/seed.js';
import { readDesk } from './desk.js';
import { createLogger } from './logging.js';
import { testDatabase } from './test-database.js';
import { testBooks, testMarketData } from './test-pricing.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => {
  fixture = await testDatabase();
  await seedIfEmpty(fixture.owner);
  app = buildApp(fixture.database, createLogger({ write() {} }), { pricing: testMarketData });
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});

it('derives the desk position and spread revenue from ledger postings', async () => {
  const desk = deskSchema.parse(await readDesk(fixture.database, testBooks()));
  const ledger = await fixture.database.pool.query(`
    SELECT a.type, e.currency, sum(CASE WHEN e.direction='credit' THEN e.amount ELSE -e.amount END)::text AS amount
    FROM ledger_entries e JOIN accounts a ON a.id = e.account_id
    WHERE a.type IN ('trading_position','spread_revenue') GROUP BY a.type, e.currency`);
  for (const row of ledger.rows as { type: string; currency: string; amount: string }[]) {
    const shown =
      row.type === 'trading_position'
        ? desk.positions.find((item) => item.currency === row.currency)?.quantity
        : desk.revenue.find((item) => item.currency === row.currency)?.total;
    expect(new Money(shown!).eq(row.amount)).toBe(true);
  }
  expect(desk.positions.length).toBeGreaterThan(1);
  // Client rows add up to the desk total in each currency.
  for (const item of desk.revenue) {
    const byClient = desk.clients
      .filter((client) => client.currency === item.currency)
      .reduce((sum, client) => sum.plus(client.revenue), new Money(0));
    expect(byClient.eq(item.total)).toBe(true);
  }
});

it('values the position in CAD at current prices and reports nothing it cannot price', async () => {
  const desk = await readDesk(fixture.database, testBooks());
  const cad = desk.positions.find((item) => item.currency === 'CAD')!;
  expect(cad.priceCad).toBe('1');
  expect(new Money(cad.valueCad!).eq(new Money(cad.quantity).toDecimalPlaces(2))).toBe(true);
  const eth = desk.positions.find((item) => item.currency === 'ETH')!;
  expect(new Money(eth.valueCad!).eq(new Money(eth.quantity).mul('4172.45').toDecimalPlaces(2))).toBe(true);
  const unpriced = await readDesk(fixture.database, []);
  expect(unpriced.positions.find((item) => item.currency === 'ETH')).toMatchObject({
    priceCad: null,
    valueCad: null,
  });
  expect(unpriced.unrealisedCad).toBeNull();
  expect(
    new Money(unpriced.positions.find((item) => item.currency === 'CAD')!.quantity).eq(cad.quantity),
  ).toBe(true);
});

it('is available to staff only', async () => {
  expect((await app.inject({ url: '/api/staff/desk' })).statusCode).toBe(401);
  for (const userId of ['maple-trader', 'staff']) {
    const login = await app.inject({ method: 'POST', url: '/api/demo/persona', payload: { userId } });
    const cookie = (login.headers['set-cookie'] as string).split(';')[0]!;
    const result = await app.inject({ url: '/api/staff/desk', headers: { cookie } });
    expect(result.statusCode).toBe(userId === 'staff' ? 200 : 403);
    if (userId === 'staff') expect(deskSchema.parse(result.json()).revenue.length).toBeGreaterThan(0);
  }
});
