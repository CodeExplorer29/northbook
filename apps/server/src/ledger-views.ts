import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  accountBalanceSchema,
  ledgerCheckSchema,
  type AccountBalance,
  type Currency,
  type LedgerDiscrepancy,
} from '@northbook/shared';
import type { Database } from './db/client.js';

// Balances are always derived, with debit-positive signs, never cached counters.
export async function accountBalances(database: Database): Promise<AccountBalance[]> {
  const result = await database.db.execute(sql`
    SELECT a.id AS "accountId", a.type, a.currency, a.organisation_id AS "organisationId",
      coalesce(sum(e.amount) FILTER (WHERE e.direction = 'debit'), 0)::text AS debits,
      coalesce(sum(e.amount) FILTER (WHERE e.direction = 'credit'), 0)::text AS credits,
      coalesce(sum(CASE e.direction WHEN 'debit' THEN e.amount ELSE -e.amount END), 0)::text AS balance
    FROM accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id
    GROUP BY a.id ORDER BY a.id`);
  return result.rows as unknown as AccountBalance[];
}

export async function checkLedger(database: Database) {
  // All checks see one committed snapshot, including while settlement is active.
  return database.db.transaction(
    async (tx) => {
      const discrepancies: LedgerDiscrepancy[] = [];
      const postings = await tx.execute(sql`
      SELECT t.id AS "transactionId", t.trade_id AS "tradeId", e.currency,
        count(e.id)::int AS entries,
        coalesce(sum(CASE e.direction WHEN 'debit' THEN e.amount ELSE -e.amount END), 0)::text AS difference
      FROM ledger_transactions t LEFT JOIN ledger_entries e ON e.transaction_id = t.id
      GROUP BY t.id, e.currency
      HAVING count(e.id) = 0 OR sum(CASE e.direction WHEN 'debit' THEN e.amount ELSE -e.amount END) <> 0`);
      for (const row of postings.rows as {
        transactionId: string;
        tradeId: string;
        currency: Currency | null;
        entries: number;
        difference: string;
      }[]) {
        discrepancies.push({
          kind: row.entries === 0 ? 'empty_transaction' : 'unbalanced_transaction',
          transactionId: row.transactionId,
          tradeId: row.tradeId,
          ...(row.currency ? { currency: row.currency } : {}),
          difference: row.difference,
        });
      }
      const events = await tx.execute(sql`
      SELECT e.id AS "sourceEventId", e.trade_id AS "tradeId", t.id AS "transactionId"
      FROM trade_events e LEFT JOIN ledger_transactions t ON t.source_event_id = e.id
      WHERE (e.action IN ('booked','funds_received','payout_sent','cancel') AND t.id IS NULL)
         OR (e.action = 'payout_confirmed' AND t.id IS NOT NULL)`);
      for (const row of events.rows as {
        sourceEventId: string;
        tradeId: string;
        transactionId: string | null;
      }[]) {
        discrepancies.push({
          kind: row.transactionId ? 'unexpected_posting' : 'missing_posting',
          sourceEventId: row.sourceEventId,
          tradeId: row.tradeId,
          ...(row.transactionId ? { transactionId: row.transactionId } : {}),
        });
      }
      const obligations = await tx.execute(sql`
      SELECT t.id AS "tradeId", a.id AS "accountId", e.currency,
        sum(CASE e.direction WHEN 'debit' THEN e.amount ELSE -e.amount END)::text AS difference
      FROM trades t JOIN ledger_transactions p ON p.trade_id = t.id
      JOIN ledger_entries e ON e.transaction_id = p.id JOIN accounts a ON a.id = e.account_id
      WHERE t.state IN ('settled','cancelled') AND a.type IN ('client_receivable','client_payable')
      GROUP BY t.id, a.id, e.currency
      HAVING sum(CASE e.direction WHEN 'debit' THEN e.amount ELSE -e.amount END) <> 0`);
      for (const row of obligations.rows as {
        tradeId: string;
        accountId: string;
        currency: Currency;
        difference: string;
      }[]) {
        discrepancies.push({ kind: 'open_client_obligation', ...row });
      }
      return { ok: discrepancies.length === 0, discrepancies };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

export function registerLedgerViews(app: FastifyInstance, database: Database) {
  app.get('/api/staff/ledger/balances', { config: { access: 'staff' } }, async () =>
    accountBalanceSchema.array().parse(await accountBalances(database)),
  );
  app.get('/api/staff/ledger/check', { config: { access: 'staff' } }, async () =>
    ledgerCheckSchema.parse(await checkLedger(database)),
  );
}
