import {
  Money,
  pairCurrencies,
  roundAmount,
  type AccountType,
  type Currency,
  type Pair,
  type Side,
} from '@northbook/shared';

export interface PostingEntry {
  type: AccountType;
  currency: Currency;
  direction: 'debit' | 'credit';
  amount: string;
}
export interface PostingAmounts {
  pair: Pair;
  side: Side;
  baseAmount: string;
  quoteAmount: string;
  marketPrice: string;
  marketQuoteAmount?: string;
}
const entry = (
  type: AccountType,
  currency: Currency,
  direction: PostingEntry['direction'],
  amount: string,
): PostingEntry => ({ type, currency, direction, amount });
const custody = (currency: Currency) =>
  currency === 'CAD' || currency === 'USD' ? 'desk_bank' : 'desk_wallet';

export function bookingEntries(trade: PostingAmounts): PostingEntry[] {
  const { base, quote } = pairCurrencies(trade.pair);
  const buy = trade.side === 'BUY';
  // Client amounts are already locked. Only the desk's market notional is rounded.
  const market =
    trade.marketQuoteAmount ??
    roundAmount(new Money(trade.baseAmount).mul(trade.marketPrice), quote, buy ? 'up' : 'down');
  const revenue = buy
    ? new Money(trade.quoteAmount).minus(market)
    : new Money(market).minus(trade.quoteAmount);
  if (revenue.lt(0)) throw new Error('Client price is better than the market price.');
  const entries = buy
    ? [
        entry('client_receivable', quote, 'debit', trade.quoteAmount),
        entry('trading_position', quote, 'credit', market),
        entry('spread_revenue', quote, 'credit', revenue.toFixed()),
        entry('trading_position', base, 'debit', trade.baseAmount),
        entry('client_payable', base, 'credit', trade.baseAmount),
      ]
    : [
        entry('client_receivable', base, 'debit', trade.baseAmount),
        entry('trading_position', base, 'credit', trade.baseAmount),
        entry('trading_position', quote, 'debit', market),
        entry('client_payable', quote, 'credit', trade.quoteAmount),
        entry('spread_revenue', quote, 'credit', revenue.toFixed()),
      ];
  return entries.filter((item) => !new Money(item.amount).isZero());
}

export function fundingEntries(trade: PostingAmounts): PostingEntry[] {
  const { base, quote } = pairCurrencies(trade.pair);
  const currency = trade.side === 'BUY' ? quote : base;
  const amount = trade.side === 'BUY' ? trade.quoteAmount : trade.baseAmount;
  return [
    entry(custody(currency), currency, 'debit', amount),
    entry('client_receivable', currency, 'credit', amount),
  ];
}

export function payoutEntries(trade: PostingAmounts): PostingEntry[] {
  const { base, quote } = pairCurrencies(trade.pair);
  const currency = trade.side === 'BUY' ? base : quote;
  const amount = trade.side === 'BUY' ? trade.baseAmount : trade.quoteAmount;
  return [
    entry('client_payable', currency, 'debit', amount),
    entry(custody(currency), currency, 'credit', amount),
  ];
}

export function reversalEntries<T extends { direction: 'debit' | 'credit' }>(original: readonly T[]): T[] {
  return original.map((item) => ({ ...item, direction: item.direction === 'debit' ? 'credit' : 'debit' }));
}
