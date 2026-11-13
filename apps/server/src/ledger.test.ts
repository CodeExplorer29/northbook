import { readFile } from 'node:fs/promises';
import { Money } from '@northbook/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { seedIdentity } from './db/seed.js';
import { accounts, ledgerEntries, ledgerTransactions, quotes, tradeEvents, trades } from './db/schema.js';
import { postTradeEvent } from './ledger.js';
import { acceptQuote } from './quoting.js';
import { issueTestQuote as issueQuote } from './test-pricing.js';
import { applyTradeEvent } from './settlement.js';
import { testDatabase } from './test-database.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
const actor = { userId: 'maple-trader', organisationId: 'maple' };
const input = { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' } as const;
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
});
afterAll(async () => {
  await fixture?.close();
});
const book = () =>
  fixture.database.db.transaction(async (tx) => {
    const quote = await issueQuote(tx, input, actor);
    return acceptQuote(tx, quote.id, actor);
  });
async function entries(tradeId: string) {
  return fixture.database.db
    .select({
      transactionId: ledgerTransactions.id,
      action: tradeEvents.action,
      type: accounts.type,
      currency: ledgerEntries.currency,
      direction: ledgerEntries.direction,
      amount: ledgerEntries.amount,
      accountId: accounts.id,
    })
    .from(ledgerEntries)
    .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
    .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
    .innerJoin(tradeEvents, eq(tradeEvents.id, ledgerTransactions.sourceEventId))
    .where(eq(ledgerTransactions.tradeId, tradeId));
}

it('posts the historical ETH booking, funding and payout exactly as the approved sample data', async () => {
  const sample = JSON.parse(
    await readFile(new URL('../../../docs/design/05-sample-data.json', import.meta.url), 'utf8'),
  ) as {
    ledger: { entries: { account: string; debit: string; credit: string; currency: string }[] }[];
  };
  const asOf = new Date('2026-11-12T14:42:01Z');
  const trade = await fixture.database.db.transaction(async (tx) => {
    const quote = await issueQuote(tx, input, actor, {
      asOf,
      suppliedPrice: {
        marketPrice: '4172.45',
        clientPrice: '4157.85',
        spreadBps: '35',
        route: { mode: 'historical' },
      },
    });
    return acceptQuote(tx, quote.id, actor, { asOf: new Date('2026-11-12T14:42:07Z') });
  });
  await fixture.database.db.transaction((tx) =>
    applyTradeEvent(tx, trade.id, { action: 'funds_received' }, 'staff', {
      asOf: new Date('2026-11-12T14:58:31Z'),
    }),
  );
  await fixture.database.db.transaction((tx) =>
    applyTradeEvent(tx, trade.id, { action: 'payout_sent' }, 'staff', {
      asOf: new Date('2026-11-12T15:03:12Z'),
    }),
  );
  const rows = await entries(trade.id);
  const labels = {
    client_receivable: 'Client receivable · Maple Ridge',
    client_payable: 'Client payable · Maple Ridge',
    trading_position: 'Trading position',
    spread_revenue: 'Spread revenue',
    desk_bank: 'Desk bank',
    desk_wallet: 'Desk wallet',
  };
  for (const [index, action] of ['booked', 'funds_received', 'payout_sent'].entries()) {
    const actual = rows
      .filter((row) => row.action === action)
      .map((row) =>
        [labels[row.type], row.currency, row.direction, new Money(row.amount).toFixed()].join('|'),
      )
      .sort();
    const expected = sample.ledger[index]!.entries.map((row) =>
      [
        row.account,
        row.currency,
        row.debit ? 'debit' : 'credit',
        new Money((row.debit || row.credit).replaceAll(',', '')).toFixed(),
      ].join('|'),
    ).sort();
    expect(actual).toEqual(expected);
  }
});

it('replays a source event once and cancels by reversing the original posting exactly', async () => {
  const trade = await book();
  const [event] = await fixture.database.db
    .select()
    .from(tradeEvents)
    .where(eq(tradeEvents.tradeId, trade.id));
  await fixture.database.db.transaction((tx) => postTradeEvent(tx, trade, event!));
  expect(
    await fixture.database.db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.tradeId, trade.id)),
  ).toHaveLength(1);
  await fixture.database.db.transaction((tx) =>
    applyTradeEvent(tx, trade.id, { action: 'cancel', reason: 'Client request' }, 'staff'),
  );
  await fixture.database.db.transaction((tx) =>
    applyTradeEvent(tx, trade.id, { action: 'cancel', reason: 'Repeated' }, 'staff'),
  );
  const postings = await fixture.database.db
    .select()
    .from(ledgerTransactions)
    .where(eq(ledgerTransactions.tradeId, trade.id));
  expect(postings).toHaveLength(2);
  const reversal = postings.find((posting) => posting.reversesTransactionId);
  expect(postings.some((posting) => posting.id === reversal?.reversesTransactionId)).toBe(true);
  const rows = await entries(trade.id);
  for (const account of new Set(rows.map((row) => row.accountId))) {
    expect(
      rows
        .filter((row) => row.accountId === account)
        .reduce(
          (sum, row) => sum.plus(new Money(row.amount).mul(row.direction === 'debit' ? 1 : -1)),
          new Money(0),
        )
        .toFixed(),
    ).toBe('0');
  }
});

it('rolls back both booking and settlement if their ledger write fails', async () => {
  const fundedCandidate = await book();
  const quote = await fixture.database.db.transaction((tx) => issueQuote(tx, input, actor));
  await fixture.owner.pool.query(`CREATE FUNCTION fail_test_posting() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Injected posting failure'; END; $$;
    CREATE TRIGGER fail_test_posting BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION fail_test_posting();`);
  try {
    await expect(fixture.database.db.transaction((tx) => acceptQuote(tx, quote.id, actor))).rejects.toThrow();
    await expect(
      fixture.database.db.transaction((tx) =>
        applyTradeEvent(tx, fundedCandidate.id, { action: 'funds_received' }, 'staff'),
      ),
    ).rejects.toThrow();
  } finally {
    await fixture.owner.pool.query(
      'DROP TRIGGER fail_test_posting ON ledger_entries; DROP FUNCTION fail_test_posting();',
    );
  }
  expect((await fixture.database.db.select().from(quotes).where(eq(quotes.id, quote.id)))[0]!.status).toBe(
    'active',
  );
  expect(await fixture.database.db.select().from(trades).where(eq(trades.quoteId, quote.id))).toEqual([]);
  expect(
    (await fixture.database.db.select().from(trades).where(eq(trades.id, fundedCandidate.id)))[0]!.state,
  ).toBe('awaiting_client_funds');
  expect(
    await fixture.database.db.select().from(tradeEvents).where(eq(tradeEvents.tradeId, fundedCandidate.id)),
  ).toHaveLength(1);
  expect(
    await fixture.database.db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.tradeId, fundedCandidate.id)),
  ).toHaveLength(1);
});
