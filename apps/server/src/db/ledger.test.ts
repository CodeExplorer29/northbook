import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { seedIdentity } from './seed.js';
import { accounts, quotes, tradeEvents, trades } from './schema.js';
import { testDatabase } from '../test-database.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
  await fixture.database.db.insert(accounts).values([
    { id: 'client-cad', type: 'client_payable', currency: 'CAD', organisationId: 'maple' },
    { id: 'bank-cad', type: 'desk_bank', currency: 'CAD' },
    { id: 'wallet-eth', type: 'desk_wallet', currency: 'ETH' },
  ]);
});
afterAll(async () => {
  await fixture?.close();
});

// Low-level fixtures intentionally exercise database constraints independently
// of the domain posting templates.
async function source() {
  const [quote] = await fixture.database.db
    .insert(quotes)
    .values({
      organisationId: 'maple',
      userId: 'maple-trader',
      pair: 'ETH/CAD',
      side: 'SELL',
      fixed: 'base',
      requestedAmount: '50',
      baseAmount: '50',
      quoteAmount: '207892.32',
      clientPrice: '4157.8464',
      marketPrice: '4172.45',
      spreadBps: '35',
      route: {},
      expiresAt: new Date(Date.now() + 60000),
    })
    .returning();
  const [trade] = await fixture.database.db
    .insert(trades)
    .values({
      quoteId: quote!.id,
      organisationId: 'maple',
      pair: 'ETH/CAD',
      side: 'SELL',
      baseAmount: '50',
      quoteAmount: '207892.32',
      clientPrice: '4157.8464',
    })
    .returning();
  const [event] = await fixture.database.db
    .insert(tradeEvents)
    .values({
      tradeId: trade!.id,
      action: 'booked',
      toState: 'awaiting_client_funds',
      actorId: 'maple-trader',
      simulated: false,
    })
    .returning();
  return { tradeId: trade!.id, eventId: event!.id };
}

async function post(entries: { account: string; currency: string; direction: string; amount: string }[]) {
  const event = await source();
  const id = randomUUID();
  const client = await fixture.database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO ledger_transactions(id,source_event_id,trade_id) VALUES ($1,$2,$3)', [
      id,
      event.eventId,
      event.tradeId,
    ]);
    for (const entry of entries) {
      await client.query(
        'INSERT INTO ledger_entries(transaction_id,account_id,currency,direction,amount) VALUES ($1,$2,$3,$4,$5)',
        [id, entry.account, entry.currency, entry.direction, entry.amount],
      );
    }
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

it('rejects unbalanced postings, including matching numbers in different currencies, at commit', async () => {
  await expect(
    post([
      { account: 'client-cad', currency: 'CAD', direction: 'debit', amount: '10' },
      { account: 'bank-cad', currency: 'CAD', direction: 'credit', amount: '9' },
    ]),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    post([
      { account: 'client-cad', currency: 'CAD', direction: 'debit', amount: '10' },
      { account: 'wallet-eth', currency: 'ETH', direction: 'credit', amount: '10' },
    ]),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(post([])).rejects.toMatchObject({ code: '23514' });
  expect((await fixture.database.pool.query('SELECT count(*) FROM ledger_transactions')).rows[0].count).toBe(
    '0',
  );
  expect((await fixture.database.pool.query('SELECT count(*) FROM ledger_entries')).rows[0].count).toBe('0');
});

it('allows a balanced posting and rejects UPDATE/DELETE even when the owner tries', async () => {
  const id = await post([
    { account: 'client-cad', currency: 'CAD', direction: 'debit', amount: '10' },
    { account: 'bank-cad', currency: 'CAD', direction: 'credit', amount: '10' },
  ]);
  for (const database of [fixture.database, fixture.owner]) {
    await expect(
      database.pool.query('UPDATE ledger_entries SET amount = 11 WHERE transaction_id=$1', [id]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      database.pool.query('DELETE FROM ledger_transactions WHERE id=$1', [id]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      database.pool.query("UPDATE accounts SET currency='ETH' WHERE id='client-cad'"),
    ).rejects.toMatchObject({ code: '42501' });
  }
  await expect(
    fixture.database.pool.query(
      "INSERT INTO ledger_entries(transaction_id,account_id,currency,direction,amount) VALUES ($1,'client-cad','CAD','debit',1)",
      [id],
    ),
  ).rejects.toMatchObject({ code: '23514' });
});

it('rejects amounts outside currency precision before they can be posted', async () => {
  await expect(
    post([
      { account: 'client-cad', currency: 'CAD', direction: 'debit', amount: '0.001' },
      { account: 'bank-cad', currency: 'CAD', direction: 'credit', amount: '0.001' },
    ]),
  ).rejects.toMatchObject({ code: '23514' });
});
