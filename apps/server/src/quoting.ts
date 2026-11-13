import { quoteAmounts, type QuoteRequest } from '@northbook/shared';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { Transaction } from './db/client.js';
import { organisations, quotes, tradeEvents, trades } from './db/schema.js';
import { AppError } from './errors.js';
import { postTradeEvent } from './ledger.js';
import { firmPrice, guardClientPrice } from './pricing/firm.js';
import type { PricedBook } from './pricing/depth.js';

export interface QuoteActor {
  userId: string;
  organisationId: string;
}
export interface PriceSnapshot {
  marketPrice: string;
  clientPrice: string;
  spreadBps: string;
  route: Record<string, unknown>;
}
// Internal-only inputs: HTTP handlers never forward these options from a request.
export interface QuoteOptions {
  id?: string;
  asOf?: Date;
  suppliedPrice?: PriceSnapshot;
  lifetimeSeconds?: number;
  books?: readonly PricedBook[];
}
export const databaseClock = (asOf?: Date) =>
  sql`COALESCE(${asOf?.toISOString() ?? null}::timestamptz, now())`;

export async function issueQuote(
  tx: Transaction,
  input: QuoteRequest,
  actor: QuoteActor,
  options: QuoteOptions = {},
) {
  const [organisation] = await tx
    .select()
    .from(organisations)
    .where(eq(organisations.id, actor.organisationId));
  if (!organisation) throw new AppError('not_found', 'Organisation not found.');
  if (organisation.kybState !== 'approved')
    throw new AppError('kyb_not_approved', 'Verification is required before requesting a firm quote.');
  const result = options.suppliedPrice
    ? {
        snapshot: options.suppliedPrice,
        amounts: quoteAmounts({ ...input, price: options.suppliedPrice.clientPrice }),
        lifetimeSeconds: options.lifetimeSeconds ?? 15,
      }
    : await firmPrice(tx, input, organisation, options.books ?? []);
  const { snapshot, amounts } = result;
  guardClientPrice(input.side, amounts.baseAmount, amounts.quoteAmount, snapshot.marketPrice);
  // Wire timestamps are millisecond ISO strings; persist that same precision so
  // the advertised expiry and the guarded database boundary are identical.
  const clock = sql`date_trunc('milliseconds', ${databaseClock(options.asOf)})`;
  const [quote] = await tx
    .insert(quotes)
    .values({
      ...(options.id ? { id: options.id } : {}),
      organisationId: actor.organisationId,
      userId: actor.userId,
      pair: input.pair,
      side: input.side,
      fixed: input.fixed,
      requestedAmount: input.amount,
      baseAmount: amounts.baseAmount,
      quoteAmount: amounts.quoteAmount,
      clientPrice: amounts.unitPrice,
      marketPrice: snapshot.marketPrice,
      spreadBps: snapshot.spreadBps,
      route: snapshot.route,
      createdAt: clock,
      expiresAt: sql`${clock} + ${options.lifetimeSeconds ?? result.lifetimeSeconds} * interval '1 second'`,
    })
    .returning();
  return quote!;
}

export async function acceptQuote(
  tx: Transaction,
  quoteId: string,
  actor: QuoteActor,
  options: Pick<QuoteOptions, 'asOf' | 'id'> = {},
) {
  const scope = and(eq(quotes.id, quoteId), eq(quotes.organisationId, actor.organisationId));
  const [quote] = await tx
    .update(quotes)
    .set({ status: 'accepted' })
    .where(and(scope, eq(quotes.status, 'active'), gt(quotes.expiresAt, databaseClock(options.asOf))))
    .returning();
  if (!quote) {
    const [existing] = await tx.select().from(quotes).where(scope);
    if (!existing) throw new AppError('not_found', 'Quote not found.');
    if (existing.status === 'accepted') {
      const [trade] = await tx.select().from(trades).where(eq(trades.quoteId, existing.id));
      if (!trade) throw new Error('Accepted quote is missing its trade.');
      return trade;
    }
    throw new AppError(
      'quote_expired',
      'This quote expired before we received your acceptance. No trade was made.',
    );
  }
  const [trade] = await tx
    .insert(trades)
    .values({
      ...(options.id ? { id: options.id } : {}),
      quoteId: quote.id,
      organisationId: quote.organisationId,
      pair: quote.pair,
      side: quote.side,
      baseAmount: quote.baseAmount,
      quoteAmount: quote.quoteAmount,
      clientPrice: quote.clientPrice,
      createdAt: databaseClock(options.asOf),
    })
    .returning();
  const [event] = await tx
    .insert(tradeEvents)
    .values({
      tradeId: trade!.id,
      action: 'booked',
      toState: 'awaiting_client_funds',
      actorId: actor.userId,
      simulated: false,
      createdAt: databaseClock(options.asOf),
    })
    .returning();
  await postTradeEvent(tx, trade!, event!);
  return trade!;
}
