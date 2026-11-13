import { eq, asc, inArray } from 'drizzle-orm';
import type { Database } from './db/client.js';
import {
  accounts,
  ledgerEntries,
  ledgerTransactions,
  organisations,
  quotes,
  tradeEvents,
  trades,
} from './db/schema.js';
import { AppError } from './errors.js';

export async function staffTradeDetail(database: Database, id: string) {
  return database.db.transaction(
    async (tx) => {
      const [record] = await tx
        .select({ trade: trades, organisation: organisations, quote: quotes })
        .from(trades)
        .innerJoin(organisations, eq(organisations.id, trades.organisationId))
        .innerJoin(quotes, eq(quotes.id, trades.quoteId))
        .where(eq(trades.id, id));
      if (!record) throw new AppError('not_found', 'Trade not found.');
      const events = await tx
        .select()
        .from(tradeEvents)
        .where(eq(tradeEvents.tradeId, id))
        .orderBy(asc(tradeEvents.createdAt));
      const transactions = await tx
        .select()
        .from(ledgerTransactions)
        .where(eq(ledgerTransactions.tradeId, id));
      const entries = transactions.length
        ? await tx
            .select({
              id: ledgerEntries.id,
              transactionId: ledgerEntries.transactionId,
              accountId: accounts.id,
              accountType: accounts.type,
              organisationId: accounts.organisationId,
              currency: ledgerEntries.currency,
              direction: ledgerEntries.direction,
              amount: ledgerEntries.amount,
            })
            .from(ledgerEntries)
            .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
            .where(
              inArray(
                ledgerEntries.transactionId,
                transactions.map((transaction) => transaction.id),
              ),
            )
            .orderBy(ledgerEntries.currency, accounts.type, ledgerEntries.id)
        : [];
      return {
        ...record.trade,
        events,
        organisation: record.organisation,
        pricing: {
          marketPrice: record.quote.marketPrice,
          spreadBps: record.quote.spreadBps,
          route: record.quote.route,
        },
        ledger: events.map((event) => {
          const transaction = transactions.find((item) => item.sourceEventId === event.id);
          return {
            event,
            transactionId: transaction?.id ?? null,
            reversesTransactionId: transaction?.reversesTransactionId ?? null,
            entries: entries
              .filter((entry) => entry.transactionId === transaction?.id)
              .map((entry) => ({
                id: entry.id,
                accountId: entry.accountId,
                accountType: entry.accountType,
                organisationId: entry.organisationId,
                currency: entry.currency,
                direction: entry.direction,
                amount: entry.amount,
              })),
          };
        }),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
