import { Money } from '@northbook/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { ledgerEntries, ledgerTransactions, tradeEvents } from './db/schema.js';
import { seedIdentity } from './db/seed.js';
import { accountBalances, checkLedger } from './ledger-views.js';
import { createLogger } from './logging.js';
import { acceptQuote } from './quoting.js';
import { issueTestQuote as issueQuote } from './test-pricing.js';
import { applyTradeEvent } from './settlement.js';
import { testDatabase } from './test-database.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
  app = buildApp(fixture.database, createLogger({ write() {} }));
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});
async function book(side: 'BUY' | 'SELL') {
  return fixture.database.db.transaction(async (tx) => {
    const actor = { userId: 'maple-trader', organisationId: 'maple' };
    const quote = await issueQuote(
      tx,
      {
        pair: side === 'BUY' ? 'BTC/CAD' : 'ETH/CAD',
        side,
        fixed: 'base',
        amount: side === 'BUY' ? '2' : '50',
      },
      actor,
    );
    return acceptQuote(tx, quote.id, actor);
  });
}
async function settle(side: 'BUY' | 'SELL') {
  const trade = await book(side);
  for (const action of ['funds_received', 'payout_sent', 'payout_confirmed'] as const) {
    await fixture.database.db.transaction((tx) => applyTradeEvent(tx, trade.id, { action }, 'staff'));
  }
  return trade;
}

it('derives exact balances and passes integrity after both directions settle and a booking is cancelled', async () => {
  await settle('BUY');
  await settle('SELL');
  const cancelled = await book('SELL');
  await fixture.database.db.transaction((tx) =>
    applyTradeEvent(tx, cancelled.id, { action: 'cancel', reason: 'Client request' }, 'staff'),
  );
  expect(await checkLedger(fixture.database)).toEqual({ ok: true, discrepancies: [] });
  const balances = await accountBalances(fixture.database);
  expect(
    balances.filter((row) => row.type.startsWith('client_')).every((row) => new Money(row.balance).isZero()),
  ).toBe(true);
  const revenues = balances.filter((row) => row.type === 'spread_revenue');
  expect(revenues).toHaveLength(1);
  expect(new Money(revenues[0]!.balance).toFixed()).toBe('-1396.91');
  for (const currency of new Set(balances.map((row) => row.currency))) {
    expect(
      balances
        .filter((row) => row.currency === currency)
        .reduce((sum, row) => sum.plus(row.balance), new Money(0))
        .toFixed(),
    ).toBe('0');
  }
});

it('reports an unbalanced corrupted posting and an otherwise balanced open obligation', async () => {
  const trade = await settle('SELL');
  const [funding] = await fixture.database.db
    .select({ id: ledgerEntries.id, amount: ledgerEntries.amount, accountId: ledgerEntries.accountId })
    .from(ledgerEntries)
    .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
    .innerJoin(tradeEvents, eq(tradeEvents.id, ledgerTransactions.sourceEventId))
    .where(eq(ledgerTransactions.tradeId, trade.id));
  // Owner-only corruption of this disposable fixture proves the checker is
  // independent of the write protections. The running demo is never touched.
  await fixture.owner.pool.query('ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_immutable');
  try {
    await fixture.owner.pool.query('UPDATE ledger_entries SET amount=amount+1 WHERE id=$1', [funding!.id]);
    const broken = await checkLedger(fixture.database);
    expect(broken.ok).toBe(false);
    expect(broken.discrepancies).toContainEqual(
      expect.objectContaining({ kind: 'unbalanced_transaction', tradeId: trade.id }),
    );
    await fixture.owner.pool.query('UPDATE ledger_entries SET amount=$1 WHERE id=$2', [
      funding!.amount,
      funding!.id,
    ]);
    // Move the funding credit to the position account: still balanced per
    // currency, but this settled trade's receivable no longer clears.
    const changed = await fixture.owner.pool.query(
      `UPDATE ledger_entries e SET account_id='trading_position:desk:ETH'
      FROM ledger_transactions p, trade_events v WHERE e.transaction_id=p.id AND p.source_event_id=v.id
      AND p.trade_id=$1 AND v.action='funds_received' AND e.account_id='client_receivable:maple:ETH' RETURNING e.id`,
      [trade.id],
    );
    expect(changed.rowCount).toBe(1);
    const obligation = await checkLedger(fixture.database);
    expect(obligation.discrepancies).toEqual([
      expect.objectContaining({ kind: 'open_client_obligation', tradeId: trade.id, currency: 'ETH' }),
    ]);
    await fixture.owner.pool.query(
      "UPDATE ledger_entries SET account_id='client_receivable:maple:ETH' WHERE id=$1",
      [changed.rows[0].id],
    );
  } finally {
    await fixture.owner.pool.query('ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_immutable');
  }
  expect((await checkLedger(fixture.database)).ok).toBe(true);
});

it('makes balances and integrity available only to staff', async () => {
  for (const endpoint of ['/api/staff/ledger/check', '/api/staff/ledger/balances']) {
    expect((await app.inject({ url: endpoint })).statusCode).toBe(401);
    for (const userId of ['maple-trader', 'staff']) {
      const persona = await app.inject({ method: 'POST', url: '/api/demo/persona', payload: { userId } });
      const cookie = (persona.headers['set-cookie'] as string).split(';')[0]!;
      const response = await app.inject({ url: endpoint, headers: { cookie } });
      expect(response.statusCode).toBe(userId === 'staff' ? 200 : 403);
      if (userId === 'staff' && endpoint.endsWith('/check'))
        expect(response.json()).toEqual({ ok: true, discrepancies: [] });
    }
  }
});

it('returns an atomic staff detail with private pricing and every event group, without exposing it to clients', async () => {
  const { staffTradeDetailSchema, tradeDetailSchema } = await import('@northbook/shared');
  const trade = await book('SELL');
  const staff = await app.inject({ method: 'POST', url: '/api/demo/persona', payload: { userId: 'staff' } });
  const client = await app.inject({
    method: 'POST',
    url: '/api/demo/persona',
    payload: { userId: 'maple-trader' },
  });
  const staffCookie = (staff.headers['set-cookie'] as string).split(';')[0]!;
  const clientCookie = (client.headers['set-cookie'] as string).split(';')[0]!;
  for (const [action, groups, postings] of [
    [null, 1, 5],
    ['funds_received', 2, 7],
    ['payout_sent', 3, 9],
    ['payout_confirmed', 4, 9],
  ] as const) {
    if (action)
      await fixture.database.db.transaction((tx) => applyTradeEvent(tx, trade.id, { action }, 'staff'));
    const response = await app.inject({
      url: `/api/staff/trades/${trade.id}`,
      headers: { cookie: staffCookie },
    });
    expect(response.statusCode).toBe(200);
    const detail = staffTradeDetailSchema.parse(response.json());
    expect(detail.organisation.id).toBe('maple');
    expect(detail.pricing.route.legs!.length).toBeGreaterThan(0);
    expect(detail.ledger).toHaveLength(groups);
    expect(detail.ledger.flatMap((group) => group.entries)).toHaveLength(postings);
    for (const group of detail.ledger)
      for (const currency of new Set(group.entries.map((entry) => entry.currency))) {
        expect(
          group.entries
            .filter((entry) => entry.currency === currency)
            .reduce(
              (sum, entry) =>
                entry.direction === 'debit' ? sum.plus(entry.amount) : sum.minus(entry.amount),
              new Money(0),
            )
            .isZero(),
        ).toBe(true);
      }
    if (action === 'payout_confirmed')
      expect(detail.ledger.at(-1)).toMatchObject({ transactionId: null, entries: [] });
  }
  expect(
    (await app.inject({ url: `/api/staff/trades/${trade.id}`, headers: { cookie: clientCookie } }))
      .statusCode,
  ).toBe(403);
  const visible = (
    await app.inject({ url: `/api/trades/${trade.id}`, headers: { cookie: clientCookie } })
  ).json();
  expect(tradeDetailSchema.safeParse(visible).success).toBe(true);
  expect(visible).not.toHaveProperty('pricing');
  expect(visible).not.toHaveProperty('ledger');
  const cancelled = await book('BUY');
  await fixture.database.db.transaction((tx) =>
    applyTradeEvent(tx, cancelled.id, { action: 'cancel', reason: 'Client request' }, 'staff'),
  );
  const result = staffTradeDetailSchema.parse(
    (await app.inject({ url: `/api/staff/trades/${cancelled.id}`, headers: { cookie: staffCookie } })).json(),
  );
  expect(result.ledger[1]!.reversesTransactionId).toBe(result.ledger[0]!.transactionId);
  expect(result.ledger[1]!.event.reason).toBe('Client request');
});
