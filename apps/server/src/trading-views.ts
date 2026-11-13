import { pairCurrencies, pairSchema, type QuoteState } from '@northbook/shared';
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from './db/client.js';
import { quotes, tradeEvents, trades } from './db/schema.js';
import { requireOrganisation } from './auth.js';
import { AppError } from './errors.js';
import { staffTradeDetail } from './staff-trading-view.js';

export function clientQuote(quote: typeof quotes.$inferSelect & { tradeId?: string | null }) {
  const { base, quote: currency } = pairCurrencies(pairSchema.parse(quote.pair));
  const buying = quote.side === 'BUY';
  return {
    ...(quote.tradeId ? { tradeId: quote.tradeId } : {}),
    id: quote.id,
    pair: quote.pair,
    side: quote.side,
    fixed: quote.fixed,
    requestedAmount: quote.requestedAmount,
    baseAmount: quote.baseAmount,
    quoteAmount: quote.quoteAmount,
    clientPrice: quote.clientPrice,
    payCurrency: buying ? currency : base,
    payAmount: buying ? quote.quoteAmount : quote.baseAmount,
    receiveCurrency: buying ? base : currency,
    receiveAmount: buying ? quote.baseAmount : quote.quoteAmount,
    status: quote.status,
    createdAt: quote.createdAt,
    expiresAt: quote.expiresAt,
    replayed: quote.route.mode === 'replay',
  };
}

export function registerTradingViews(app: FastifyInstance, database: Database) {
  const quoteColumns = {
    ...getTableColumns(quotes),
    tradeId: trades.id,
    status: sql<QuoteState>`CASE WHEN ${quotes.status} = 'active' AND ${quotes.expiresAt} <= now() THEN 'expired' ELSE ${quotes.status}::text END`,
  };
  for (const staff of [false, true]) {
    const prefix = staff ? '/api/staff' : '/api';
    const config = { access: staff ? ('staff' as const) : ('client' as const) };
    const quoteScope = (request: FastifyRequest) =>
      staff ? undefined : eq(quotes.organisationId, requireOrganisation(request));
    const tradeScope = (request: FastifyRequest) =>
      staff ? undefined : eq(trades.organisationId, requireOrganisation(request));
    app.get(`${prefix}/quotes`, { config }, async (request) => {
      const rows = await database.db
        .select(quoteColumns)
        .from(quotes)
        .leftJoin(trades, eq(trades.quoteId, quotes.id))
        .where(quoteScope(request))
        .orderBy(desc(quotes.createdAt));
      return rows.map((row) => (staff ? row : clientQuote(row)));
    });
    app.get<{ Params: { id: string } }>(`${prefix}/quotes/:id`, { config }, async (request) => {
      const [row] = await database.db
        .select(quoteColumns)
        .from(quotes)
        .leftJoin(trades, eq(trades.quoteId, quotes.id))
        .where(and(eq(quotes.id, request.params.id), quoteScope(request)));
      if (!row) throw new AppError('not_found', 'Quote not found.');
      return staff ? row : clientQuote(row);
    });
    app.get(`${prefix}/trades`, { config }, async (request) =>
      database.db.select().from(trades).where(tradeScope(request)).orderBy(desc(trades.createdAt)),
    );
    app.get<{ Params: { id: string } }>(`${prefix}/trades/:id`, { config }, async (request) => {
      if (staff) return staffTradeDetail(database, request.params.id);
      const [row] = await database.db
        .select()
        .from(trades)
        .where(and(eq(trades.id, request.params.id), tradeScope(request)));
      if (!row) throw new AppError('not_found', 'Trade not found.');
      const events = await database.db
        .select()
        .from(tradeEvents)
        .where(eq(tradeEvents.tradeId, row.id))
        .orderBy(tradeEvents.createdAt);
      return { ...row, events };
    });
  }
}
