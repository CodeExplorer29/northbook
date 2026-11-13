import { pairSchema } from '@northbook/shared';
import { and, eq } from 'drizzle-orm';
import type { Transaction } from './db/client.js';
import { accounts, ledgerEntries, ledgerTransactions, quotes, tradeEvents, trades } from './db/schema.js';
import { bookingEntries, fundingEntries, payoutEntries, reversalEntries } from './posting-templates.js';

// Called inside the transaction that inserts the event and changes the trade.
// Confirmation has no financial movement; payout_sent already discharged it.
export async function postTradeEvent(
  tx: Transaction,
  trade: typeof trades.$inferSelect,
  event: typeof tradeEvents.$inferSelect,
) {
  if (event.action === 'payout_confirmed') return null;
  let reversesTransactionId: string | undefined;
  let entries: Pick<typeof ledgerEntries.$inferInsert, 'accountId' | 'currency' | 'direction' | 'amount'>[];
  if (event.action === 'cancel') {
    const [original] = await tx
      .select({ id: ledgerTransactions.id })
      .from(ledgerTransactions)
      .innerJoin(tradeEvents, eq(tradeEvents.id, ledgerTransactions.sourceEventId))
      .where(and(eq(ledgerTransactions.tradeId, trade.id), eq(tradeEvents.action, 'booked')));
    if (!original) throw new Error('Cancellation is missing its booking posting.');
    reversesTransactionId = original.id;
    const originalEntries = await tx
      .select({
        accountId: ledgerEntries.accountId,
        currency: ledgerEntries.currency,
        direction: ledgerEntries.direction,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, original.id));
    entries = reversalEntries(originalEntries);
  } else {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, trade.quoteId));
    if (!quote) throw new Error('Trade is missing its quote.');
    const amounts = {
      ...trade,
      pair: pairSchema.parse(trade.pair),
      marketPrice: quote.marketPrice,
      ...(typeof quote.route.marketQuoteAmount === 'string'
        ? { marketQuoteAmount: quote.route.marketQuoteAmount }
        : {}),
    };
    const template =
      event.action === 'booked'
        ? bookingEntries(amounts)
        : event.action === 'funds_received'
          ? fundingEntries(amounts)
          : event.action === 'payout_sent'
            ? payoutEntries(amounts)
            : undefined;
    if (!template) throw new Error('No posting template for trade event.');
    const identities = template.map((item) => {
      const organisationId = item.type.startsWith('client_') ? trade.organisationId : null;
      return {
        id: `${item.type}:${organisationId ?? 'desk'}:${item.currency}`,
        type: item.type,
        currency: item.currency,
        organisationId,
      };
    });
    // Stable order avoids lock cycles when concurrent trades share desk accounts.
    await tx
      .insert(accounts)
      .values([...identities].sort((a, b) => a.id.localeCompare(b.id)))
      .onConflictDoNothing();
    entries = template.map((item, index) => ({
      accountId: identities[index]!.id,
      currency: item.currency,
      direction: item.direction,
      amount: item.amount,
    }));
  }
  const [posting] = await tx
    .insert(ledgerTransactions)
    .values({
      sourceEventId: event.id,
      tradeId: trade.id,
      reversesTransactionId,
      createdAt: event.createdAt,
    })
    .onConflictDoNothing({ target: ledgerTransactions.sourceEventId })
    .returning();
  if (!posting) {
    const [existing] = await tx
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.sourceEventId, event.id));
    return existing!;
  }
  await tx.insert(ledgerEntries).values(entries.map((item) => ({ ...item, transactionId: posting.id })));
  return posting;
}
