import { Money, pairCurrencies, type Currency, type QuoteRequest, type Side } from '@northbook/shared';
import { AppError } from '../errors.js';
import { bestFill, walkDepth, type DepthRequest, type MarketFill, type PricedBook } from './depth.js';

export interface RouteLeg extends PricedBook {
  from: Currency;
  to: Currency;
  side: Side;
}
export interface RoutePrice {
  baseAmount: string;
  quoteAmount: string;
  marketPrice: string;
  path: Currency[];
  legs: MarketFill[];
  replayed: boolean;
}
const bridges: readonly Currency[] = ['USD', 'USDT', 'USDC'];

export function enumerateRoutes(books: readonly PricedBook[], from: Currency, to: Currency): RouteLeg[][] {
  const edges: RouteLeg[] = [...books]
    .sort((a, b) =>
      `${a.book.venue}:${a.book.market.symbol}`.localeCompare(`${b.book.venue}:${b.book.market.symbol}`),
    )
    .flatMap((source) => [
      { ...source, from: source.book.market.base, to: source.book.market.quote, side: 'SELL' as const },
      { ...source, from: source.book.market.quote, to: source.book.market.base, side: 'BUY' as const },
    ]);
  const routes = edges.filter((edge) => edge.from === from && edge.to === to).map((edge) => [edge]);
  for (const bridge of bridges) {
    if (bridge === from || bridge === to) continue;
    const first = edges.filter((edge) => edge.from === from && edge.to === bridge);
    const second = edges.filter((edge) => edge.from === bridge && edge.to === to);
    for (const a of first) for (const b of second) routes.push([a, b]);
  }
  return routes;
}

export function priceRoute(route: readonly RouteLeg[], request: DepthRequest): RoutePrice {
  const fixedInput = request.side === 'SELL' ? request.fixed === 'base' : request.fixed === 'quote';
  const legs: MarketFill[] = [];
  let amount = request.amount;
  if (fixedInput) {
    for (const leg of route) {
      const fill = walkDepth(
        leg.book,
        { side: leg.side, fixed: leg.side === 'SELL' ? 'base' : 'quote', amount },
        leg.feeRate,
      );
      legs.push(fill);
      amount = leg.side === 'SELL' ? fill.quoteAmount : fill.baseAmount;
    }
  } else {
    // Solve backwards when the required output is fixed; each earlier leg must
    // produce exactly what the next leg needs, including that next leg's fees.
    for (const leg of [...route].reverse()) {
      const fill = walkDepth(
        leg.book,
        { side: leg.side, fixed: leg.side === 'SELL' ? 'quote' : 'base', amount },
        leg.feeRate,
      );
      legs.unshift(fill);
      amount = leg.side === 'SELL' ? fill.baseAmount : fill.quoteAmount;
    }
  }
  if (!route.length) throw new AppError('price_unavailable', 'No route is available.');
  const baseAmount = request.fixed === 'base' ? request.amount : amount;
  const quoteAmount = request.fixed === 'quote' ? request.amount : amount;
  return {
    baseAmount,
    quoteAmount,
    marketPrice: new Money(quoteAmount).div(baseAmount).toFixed(),
    path: [route[0]!.from, ...route.map((leg) => leg.to)],
    legs,
    replayed: legs.some((leg) => leg.replayed),
  };
}

export function selectRoute(books: readonly PricedBook[], request: QuoteRequest): RoutePrice {
  const { base, quote } = pairCurrencies(request.pair);
  return priceCurrencyPair(books, base, quote, request);
}

export function priceCurrencyPair(
  books: readonly PricedBook[],
  base: Currency,
  quote: Currency,
  request: DepthRequest,
): RoutePrice {
  const routes = enumerateRoutes(
    books,
    request.side === 'SELL' ? base : quote,
    request.side === 'SELL' ? quote : base,
  );
  if (!routes.length) throw new AppError('price_unavailable', 'No market route is available for this pair.');
  const prices: RoutePrice[] = [];
  for (const route of routes) {
    try {
      prices.push(priceRoute(route, request));
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'insufficient_liquidity') throw error;
    }
  }
  return bestFill(prices, request);
}
