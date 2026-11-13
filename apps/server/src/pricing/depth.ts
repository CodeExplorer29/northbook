import {
  Money,
  bookSideFor,
  decimalStringSchema,
  positiveDecimal,
  type FixedCurrency,
  type QuoteRequest,
  type Side,
} from '@northbook/shared';
import { AppError } from '../errors.js';
import { normaliseBook, type OrderBook, type VenueId } from './venue.js';

export interface PricedBook {
  book: OrderBook;
  feeRate: string;
}
export interface DepthRequest {
  side: Side;
  fixed: FixedCurrency;
  amount: string;
}
export interface MarketFill {
  venue: VenueId;
  market: string;
  side: Side;
  baseAmount: string;
  quoteAmount: string;
  marketPrice: string;
  feeRate: string;
  levelsUsed: number;
  receivedAt: number;
  replayed: boolean;
}

export function walkDepth(source: OrderBook, request: DepthRequest, feeRate: string): MarketFill {
  const book = normaliseBook(source);
  const amount = positiveDecimal(request.amount);
  const fee = new Money(decimalStringSchema.parse(feeRate));
  if (fee.gte(1)) throw new AppError('validation_failed', 'Venue fee must be less than 100%.');
  const factor = request.side === 'BUY' ? new Money(1).plus(fee) : new Money(1).minus(fee);
  let remaining = amount;
  let base = new Money(0);
  let quote = new Money(0);
  let levelsUsed = 0;
  for (const level of book[bookSideFor(request.side)]) {
    if (remaining.isZero()) break;
    const price = new Money(level.price).mul(factor);
    const capacity = new Money(level.size);
    if (request.fixed === 'base') {
      const take = Money.min(remaining, capacity);
      base = base.plus(take);
      quote = quote.plus(take.mul(price));
      remaining = remaining.minus(take);
    } else {
      const available = capacity.mul(price);
      const take = Money.min(remaining, available);
      base = base.plus(take.eq(available) ? capacity : take.div(price));
      quote = quote.plus(take);
      remaining = remaining.minus(take);
    }
    levelsUsed++;
  }
  if (remaining.gt(0))
    throw new AppError('insufficient_liquidity', 'No route has enough order book depth for this amount.');
  // No currency rounding here: subsequent legs and spread calculations consume
  // full precision, and only the final client amount is rounded.
  return {
    venue: book.venue,
    market: book.market.symbol,
    side: request.side,
    baseAmount: base.toFixed(),
    quoteAmount: quote.toFixed(),
    marketPrice: quote.div(base).toFixed(),
    feeRate,
    levelsUsed,
    receivedAt: book.receivedAt,
    replayed: book.replayed,
  };
}

export function bestFill<T extends Pick<MarketFill, 'baseAmount' | 'quoteAmount'>>(
  fills: readonly T[],
  request: DepthRequest,
): T {
  if (!fills.length)
    throw new AppError('insufficient_liquidity', 'No route has enough order book depth for this amount.');
  const computed = request.fixed === 'base' ? 'quoteAmount' : 'baseAmount';
  const smallerWins = request.fixed === 'base' ? request.side === 'BUY' : request.side === 'SELL';
  return fills.reduce((best, candidate) => {
    const comparison = new Money(candidate[computed]).cmp(best[computed]);
    return comparison * (smallerWins ? 1 : -1) < 0 ? candidate : best;
  });
}

export function priceDirectBooks(books: readonly PricedBook[], request: QuoteRequest): MarketFill {
  const candidates = books.filter(({ book }) => book.market.symbol === request.pair);
  if (!candidates.length)
    throw new AppError('price_unavailable', 'No market data is available for this pair.');
  const fills: MarketFill[] = [];
  for (const { book, feeRate } of candidates) {
    try {
      fills.push(walkDepth(book, request, feeRate));
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'insufficient_liquidity') throw error;
    }
  }
  return bestFill(fills, request);
}
