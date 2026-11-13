import {
  tradeEventRequestSchema,
  tradeMachine,
  transition,
  TransitionError,
  type TradeEventRequest,
} from '@northbook/shared';
import { and, eq } from 'drizzle-orm';
import type { Transaction } from './db/client.js';
import { tradeEvents, trades, users } from './db/schema.js';
import { AppError } from './errors.js';
import { databaseClock } from './quoting.js';
import { postTradeEvent } from './ledger.js';

export async function applyTradeEvent(
  tx: Transaction,
  tradeId: string,
  input: TradeEventRequest,
  actorId: string,
  options: { asOf?: Date } = {},
) {
  const event = tradeEventRequestSchema.parse(input);
  const [actor] = await tx.select().from(users).where(eq(users.id, actorId));
  if (actor?.role !== 'staff') throw new AppError('forbidden', 'Only staff can simulate settlement.');
  const [trade] = await tx.select().from(trades).where(eq(trades.id, tradeId)).for('update');
  if (!trade) throw new AppError('not_found', 'Trade not found.');
  const history = await tx
    .select({ action: tradeEvents.action })
    .from(tradeEvents)
    .where(eq(tradeEvents.tradeId, trade.id));
  let next;
  try {
    next = transition(
      tradeMachine,
      trade.state,
      event.action,
      'staff',
      history.map((item) => item.action),
    );
  } catch (error) {
    if (error instanceof TransitionError) throw new AppError(error.code, error.message);
    throw error;
  }
  if (!next.changed) return trade;
  const [updated] = await tx
    .update(trades)
    .set({
      state: next.state,
      ...(event.action === 'cancel' ? { cancellationReason: event.reason! } : {}),
    })
    .where(and(eq(trades.id, trade.id), eq(trades.state, trade.state)))
    .returning();
  if (!updated) throw new AppError('invalid_transition', 'Trade state changed. Please retry.');
  const [recorded] = await tx
    .insert(tradeEvents)
    .values({
      tradeId: trade.id,
      action: event.action,
      fromState: trade.state,
      toState: next.state,
      actorId,
      simulated: true,
      reason: event.reason ?? null,
      createdAt: databaseClock(options.asOf),
    })
    .returning();
  await postTradeEvent(tx, updated, recorded!);
  return updated;
}
