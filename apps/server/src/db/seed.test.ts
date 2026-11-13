import { Money, staffTradeDetailSchema } from '@northbook/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDatabase } from '../test-database.js';
import { seedIfEmpty } from './seed.js';
import { resetDemo } from './reset.js';
import { kybApplications, organisations, quotes, settings, trades, venues } from './schema.js';
import { checkLedger } from '../ledger-views.js';
import { staffTradeDetail } from '../staff-trading-view.js';
import { issueTestQuote } from '../test-pricing.js';
import { readSample, sampleNumber } from './sample-data.js';
import { buildApp } from '../app.js';
import { createLogger } from '../logging.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  fixture = await testDatabase();
  await seedIfEmpty(fixture.owner);
});
afterAll(async () => {
  await fixture?.close();
});

it('reproduces every historical amount and state through the real posting code', async () => {
  const sample = await readSample();
  const seeded = await fixture.database.db.select().from(trades);
  expect(seeded).toHaveLength(7);
  expect(seeded.filter((trade) => !['settled', 'cancelled'].includes(trade.state))).toHaveLength(3);
  expect(
    seeded.filter(
      (trade) => trade.state === 'settled' && trade.createdAt.toISOString().startsWith('2026-11-12'),
    ),
  ).toHaveLength(2);
  const states: Record<string, string> = {
    'Awaiting client funds': 'awaiting_client_funds',
    'Funds received': 'funds_received',
    'Payout sent': 'payout_sent',
    Settled: 'settled',
    Cancelled: 'cancelled',
  };
  for (const sampleTrade of sample.blotterTrades) {
    const trade = seeded.find((row) => row.id === sampleTrade.id)!;
    expect(trade.state).toBe(states[sampleTrade.status]);
    expect(new Money(trade.baseAmount).eq(sampleNumber(sampleTrade.base))).toBe(true);
    expect(new Money(trade.quoteAmount).eq(sampleNumber(sampleTrade.quote))).toBe(true);
    expect(
      staffTradeDetailSchema.safeParse(
        JSON.parse(JSON.stringify(await staffTradeDetail(fixture.database, trade.id))),
      ).success,
    ).toBe(true);
  }
  const revenue = await fixture.database.pool.query(
    "SELECT amount::text FROM ledger_entries e JOIN accounts a ON a.id=e.account_id JOIN ledger_transactions t ON t.id=e.transaction_id WHERE t.trade_id='NB-T-000128' AND a.type='spread_revenue'",
  );
  expect(new Money(revenue.rows[0].amount).toFixed(2)).toBe('730.00');
  const cedar = (
    await fixture.database.db
      .select()
      .from(kybApplications)
      .where(eq(kybApplications.organisationId, 'cedar'))
  )[0]!;
  expect(cedar).toMatchObject({
    ...sample.kybApplication.business,
    state: 'draft',
    beneficialOwners: [
      { name: 'Tomás Reyes', ownership: '60' },
      { name: 'Ingrid Sørensen', ownership: '40' },
    ],
  });
  expect(await checkLedger(fixture.database)).toEqual({ ok: true, discrepancies: [] });
  expect(await seedIfEmpty(fixture.owner)).toBe(false);
});

it('restores all application data and configuration and advances live identifiers past the samples', async () => {
  await fixture.database.db.update(settings).set({ quoteLifetimeSeconds: 90 });
  await fixture.database.db.update(venues).set({ enabled: false });
  await fixture.database.db
    .update(organisations)
    .set({ tier: 'Changed', maxTradeSize: '1' })
    .where(eq(organisations.id, 'cedar'));
  await resetDemo(fixture.owner);
  expect((await fixture.database.db.select().from(settings))[0]!.quoteLifetimeSeconds).toBe(15);
  expect((await fixture.database.db.select().from(venues)).every((venue) => venue.enabled)).toBe(true);
  expect(
    (await fixture.database.db.select().from(organisations).where(eq(organisations.id, 'cedar')))[0]!.tier,
  ).toBe('Standard');
  const live = await fixture.database.db.transaction((tx) =>
    issueTestQuote(
      tx,
      { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' },
      { organisationId: 'maple', userId: 'maple-trader' },
    ),
  );
  expect(live.id).toBe('NB-Q-000343');
  await resetDemo(fixture.owner);
  expect(await fixture.database.db.select().from(quotes).where(eq(quotes.id, live.id))).toEqual([]);
  expect(await checkLedger(fixture.database)).toEqual({ ok: true, discrepancies: [] });
  await expect(resetDemo(fixture.database)).rejects.toThrow();
});

it('rolls back a failed reset including rows and sequence restarts', async () => {
  await fixture.database.db.update(settings).set({ quoteLifetimeSeconds: 42 });
  await fixture.owner.pool
    .query(`CREATE FUNCTION fail_seed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected seed failure'; END; $$;
    CREATE TRIGGER fail_seed BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION fail_seed();`);
  try {
    await expect(resetDemo(fixture.owner)).rejects.toThrow();
  } finally {
    await fixture.owner.pool.query('DROP TRIGGER fail_seed ON ledger_entries; DROP FUNCTION fail_seed();');
  }
  expect((await fixture.database.db.select().from(settings))[0]!.quoteLifetimeSeconds).toBe(42);
  expect(await fixture.database.db.select().from(trades)).toHaveLength(7);
  expect(await checkLedger(fixture.database)).toEqual({ ok: true, discrepancies: [] });
});

it('has no reset route unless one is enabled', async () => {
  // Not closed: closing an app ends the shared fixture pool.
  const app = buildApp(fixture.database, createLogger({ write() {} }));
  expect((await app.inject({ method: 'POST', url: '/api/demo/reset', payload: {} })).statusCode).toBe(404);
});

it('refuses an overlapping reset and exposes only the fixed reset operation over HTTP', async () => {
  const blocker = await fixture.owner.pool.connect();
  await blocker.query('BEGIN');
  await blocker.query('SELECT pg_advisory_xact_lock(724531, 1)');
  const app = buildApp(fixture.database, createLogger({ write() {} }), {
    reset: () => resetDemo(fixture.owner),
  });
  try {
    expect(
      (await app.inject({ method: 'POST', url: '/api/demo/reset', payload: {} })).json().error.code,
    ).toBe('reset_in_progress');
    await blocker.query('ROLLBACK');
    expect(
      (await app.inject({ method: 'POST', url: '/api/demo/reset', payload: { asOf: '2020-01-01' } }))
        .statusCode,
    ).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/demo/reset', payload: {} })).json()).toEqual({
      reset: true,
    });
    expect(await checkLedger(fixture.database)).toEqual({ ok: true, discrepancies: [] });
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    await app.close();
  }
});
