import {
  Money,
  pairCurrencies,
  type Currency,
  type Pair,
  type PublicPrice,
  type Side,
} from '@northbook/shared';
import { AppError } from '../errors.js';
import type { PricedBook } from './depth.js';
import { enumerateRoutes } from './routes.js';

function bestTopRate(books: readonly PricedBook[], from: Currency, to: Currency) {
  const candidates = enumerateRoutes(books, from, to).map((route) => {
    const rate = route.reduce((product, leg) => {
      const fee = new Money(leg.feeRate);
      if (fee.lt(0) || fee.gte(1)) throw new AppError('price_unavailable', 'Waiting for price updates.');
      const level = leg.side === 'SELL' ? leg.book.bids[0] : leg.book.asks[0];
      if (!level) throw new AppError('price_unavailable', 'Waiting for price updates.');
      const price = new Money(level.price).mul(
        leg.side === 'SELL' ? new Money(1).minus(fee) : new Money(1).plus(fee),
      );
      return product.mul(leg.side === 'SELL' ? price : new Money(1).div(price));
    }, new Money(1));
    return {
      rate,
      receivedAt: Math.min(...route.map((leg) => leg.book.receivedAt)),
      replayed: route.some((leg) => leg.book.replayed),
    };
  });
  if (!candidates.length) throw new AppError('price_unavailable', 'Waiting for price updates.');
  return candidates.reduce((best, candidate) => (candidate.rate.gt(best.rate) ? candidate : best));
}
export function mid(books: readonly PricedBook[], base: Currency, quote: Currency) {
  const bid = bestTopRate(books, base, quote);
  const inverseAsk = bestTopRate(books, quote, base);
  return {
    price: bid.rate.plus(new Money(1).div(inverseAsk.rate)).div(2),
    receivedAt: Math.min(bid.receivedAt, inverseAsk.receivedAt),
    replayed: bid.replayed || inverseAsk.replayed,
  };
}

// Public prices deliberately use best top-of-book rates, not an amount-dependent
// depth walk. Their midpoint and one reference spread are identical for all viewers.
export function indicativePrice(
  books: readonly PricedBook[],
  pair: Pair,
  side: Side,
  config: { spreadBps: string; minimumTradeCad: string },
): PublicPrice {
  const { base, quote } = pairCurrencies(pair);
  const market = mid(books, base, quote);
  const cad =
    quote === 'CAD'
      ? { price: new Money(1), receivedAt: market.receivedAt, replayed: false }
      : mid(books, 'USD', 'CAD');
  const spread = new Money(config.spreadBps).div(10000);
  if (spread.lt(0) || spread.gte(1)) throw new AppError('price_unavailable', 'Waiting for price updates.');
  const factor = side === 'BUY' ? new Money(1).plus(spread) : new Money(1).minus(spread);
  const unitPrice = market.price.mul(factor).toDecimalPlaces(18).toFixed();
  if (new Money(unitPrice).lte(0)) throw new AppError('price_unavailable', 'Waiting for price updates.');
  return {
    pair,
    side,
    unitPrice,
    indicative: true,
    updatedAt: new Date(Math.min(market.receivedAt, cad.receivedAt)).toISOString(),
    replayed: market.replayed || cad.replayed,
    cadPerQuote: cad.price.toDecimalPlaces(18).toFixed(),
    minimumTradeCad: config.minimumTradeCad,
  };
}
