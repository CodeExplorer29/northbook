import { sql } from 'drizzle-orm';
import { AppError } from '../errors.js';
import { createDatabase, type Database } from './client.js';
import { seedDemo } from './seed.js';

export async function resetDemo(owner: Database) {
  await owner.db.transaction(async (tx) => {
    const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(724531, 1) AS acquired`);
    if (lock.rows[0]?.acquired !== true)
      throw new AppError('reset_in_progress', 'A demo reset is already running. Try again shortly.');
    // One owner transaction; ordinary request connections cannot truncate the ledger.
    await tx.execute(sql`TRUNCATE ledger_entries, ledger_transactions, accounts, trade_events, trades, quotes,
      idempotency_keys, kyb_applications, users, organisations, spread_bands, settings, venues`);
    await seedDemo(tx);
  });
}

// Privileged credentials are held only by this narrow operation, never by the
// application query layer. Open and release its connection for each reset.
export const resetWithOwner = (connectionString: string) => async () => {
  const owner = createDatabase(connectionString);
  try {
    await resetDemo(owner);
  } finally {
    await owner.pool.end();
  }
};
