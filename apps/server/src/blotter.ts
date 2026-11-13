import { type QuoteState } from '@northbook/shared';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
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
import { clientQuote } from './trading-views.js';

// The clock override is internal to deterministic historical tests, never HTTP.
export async function readBlotter(database: Database, asOf?: Date) {
  return database.db.transaction(
    async (tx) => {
      const clock = await tx.execute<{ at: Date }>(
        sql`SELECT COALESCE(${asOf ?? null}::timestamptz, now()) AS at`,
      );
      const at = new Date(clock.rows[0]!.at);
      const start = new Date(`${at.toISOString().slice(0, 10)}T00:00:00Z`),
        end = new Date(start.getTime() + 86400000);
      const tradeRows = await tx
        .select({ trade: trades, organisation: organisations })
        .from(trades)
        .innerJoin(organisations, eq(organisations.id, trades.organisationId))
        .orderBy(desc(trades.createdAt));
      const quoteRows = await tx
        .select({ quote: quotes, organisation: organisations, tradeId: trades.id })
        .from(quotes)
        .innerJoin(organisations, eq(organisations.id, quotes.organisationId))
        .leftJoin(trades, eq(trades.quoteId, quotes.id))
        .orderBy(desc(quotes.createdAt));
      const settled = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(tradeEvents)
        .where(
          and(
            eq(tradeEvents.action, 'payout_confirmed'),
            gte(tradeEvents.createdAt, start),
            lt(tradeEvents.createdAt, end),
          ),
        );
      const revenue = await tx
        .select({
          currency: ledgerEntries.currency,
          amount: sql<string>`sum(CASE WHEN ${ledgerEntries.direction} = 'credit' THEN ${ledgerEntries.amount} ELSE -${ledgerEntries.amount} END)::text`,
        })
        .from(ledgerEntries)
        .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
        .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
        .innerJoin(tradeEvents, eq(tradeEvents.id, ledgerTransactions.sourceEventId))
        .where(
          and(
            eq(accounts.type, 'spread_revenue'),
            gte(tradeEvents.createdAt, start),
            lt(tradeEvents.createdAt, end),
          ),
        )
        .groupBy(ledgerEntries.currency)
        .orderBy(ledgerEntries.currency);
      return {
        asOf: at.toISOString(),
        trades: tradeRows.map(({ trade, organisation }) => ({ ...trade, organisation })),
        quotes: quoteRows.map(({ quote, organisation, tradeId }) => ({
          ...clientQuote({
            ...quote,
            tradeId,
            status: (quote.status === 'active' && quote.expiresAt <= at
              ? 'expired'
              : quote.status) as QuoteState,
          }),
          organisation,
          marketPrice: quote.marketPrice,
          spreadBps: quote.spreadBps,
          route: quote.route,
        })),
        summary: {
          inProgress: tradeRows.filter(({ trade }) => !['settled', 'cancelled'].includes(trade.state)).length,
          awaitingFunds: tradeRows.filter(({ trade }) => trade.state === 'awaiting_client_funds').length,
          settledToday: settled[0]!.count,
          revenue,
        },
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
