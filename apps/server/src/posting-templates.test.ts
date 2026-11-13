import { Money, pairSchema, quoteAmounts } from '@northbook/shared';
import fc from 'fast-check';
import { expect, it } from 'vitest';
import {
  bookingEntries,
  fundingEntries,
  payoutEntries,
  reversalEntries,
  type PostingEntry,
} from './posting-templates.js';

function expectBalanced(entries: PostingEntry[]) {
  const totals = new Map<string, InstanceType<typeof Money>>();
  for (const item of entries) {
    expect(new Money(item.amount).gt(0)).toBe(true);
    totals.set(
      item.currency,
      (totals.get(item.currency) ?? new Money(0)).plus(
        new Money(item.amount).mul(item.direction === 'debit' ? 1 : -1),
      ),
    );
  }
  expect([...totals.values()].every((amount) => amount.isZero())).toBe(true);
}

it('every booking, funding, payout and cancellation template balances across both sides and fixed amounts', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...pairSchema.options),
      fc.constantFrom('BUY' as const, 'SELL' as const),
      fc.constantFrom('base' as const, 'quote' as const),
      fc.integer({ min: 1, max: 10000000 }),
      fc.integer({ min: 1, max: 100000000 }),
      fc.integer({ min: 0, max: 500 }),
      (pair, side, fixed, amount, price, bps) => {
        const marketPrice = new Money(price).div(100).toFixed();
        const clientPrice = new Money(marketPrice)
          .mul(new Money(1).plus(new Money(bps).div(10000).mul(side === 'BUY' ? 1 : -1)))
          .toFixed();
        const amounts = quoteAmounts({ pair, side, fixed, amount: String(amount), price: clientPrice });
        const trade = { pair, side, marketPrice, ...amounts };
        const booking = bookingEntries(trade);
        for (const posting of [
          booking,
          fundingEntries(trade),
          payoutEntries(trade),
          reversalEntries(booking),
        ])
          expectBalanced(posting);
        expectBalanced([...booking, ...reversalEntries(booking)]);
        const closed = [...booking, ...fundingEntries(trade), ...payoutEntries(trade)];
        for (const type of ['client_receivable', 'client_payable']) {
          expectBalanced(closed.filter((item) => item.type === type));
        }
      },
    ),
    { numRuns: 2000, seed: 42142 },
  );
});
