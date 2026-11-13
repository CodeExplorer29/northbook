import { Money, type Currency } from '@northbook/shared';
import { expect, it } from 'vitest';
import type { PricedBook } from './depth.js';
import { enumerateRoutes, selectRoute } from './routes.js';
import type { VenueId } from './venue.js';

function source(
  venue: VenueId,
  base: Currency,
  quote: Currency,
  bid: string,
  ask: string,
  size = '1000000',
  feeRate = '0',
): PricedBook {
  return {
    feeRate,
    book: {
      venue,
      market: { symbol: `${base}/${quote}`, base, quote },
      bids: [{ price: bid, size }],
      asks: [{ price: ask, size }],
      receivedAt: 1,
      replayed: true,
    },
  };
}
const direct = source('kraken', 'ETH', 'CAD', '4100', '4300');
const ethUsd = source('coinbase', 'ETH', 'USD', '3000', '3010');
const cadUsd = source('kraken', 'CAD', 'USD', '0.71', '0.72');

it('a synthetic route beats direct pricing with an inverted CAD/USD leg in all four request combinations', () => {
  for (const side of ['BUY', 'SELL'] as const)
    for (const fixed of ['base', 'quote'] as const) {
      const request = { pair: 'ETH/CAD' as const, side, fixed, amount: fixed === 'base' ? '10' : '43000' };
      const result = selectRoute([direct, ethUsd, cadUsd], request);
      const comparison = selectRoute([direct], request);
      expect(result.legs).toHaveLength(2);
      expect(result.legs.map((leg) => leg.side)).toEqual(['SELL', 'BUY']);
      expect(result.path).toEqual(side === 'SELL' ? ['ETH', 'USD', 'CAD'] : ['CAD', 'USD', 'ETH']);
      expect(result[fixed === 'base' ? 'baseAmount' : 'quoteAmount']).toBe(request.amount);
      const computed = fixed === 'base' ? 'quoteAmount' : 'baseAmount';
      const smallerWins = fixed === 'base' ? side === 'BUY' : side === 'SELL';
      expect(new Money(result[computed]).cmp(comparison[computed])).toBe(smallerWins ? -1 : 1);
      if (side === 'SELL' && fixed === 'base')
        expect(result.quoteAmount).toBe(new Money(30000).div('0.72').toFixed());
      if (side === 'BUY' && fixed === 'base')
        expect(result.quoteAmount).toBe(new Money(30100).div('0.71').toFixed());
    }
});

it('applies fees on each leg and reports the actual markets, amounts and path', () => {
  const first = source('binance', 'ETH', 'USDT', '3000', '3010', '1000000', '0.001');
  const second = source('kraken', 'USDT', 'CAD', '1.395', '1.4', '1000000', '0.002');
  const result = selectRoute([first, second], { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' });
  const expected = new Money('3000').mul('0.999').mul('1.395').mul('0.998');
  expect(result.marketPrice).toBe(expected.toFixed());
  expect(result.quoteAmount).toBe(expected.mul(50).toFixed());
  expect(result.legs.map((leg) => [leg.venue, leg.market, leg.side, leg.feeRate])).toEqual([
    ['binance', 'ETH/USDT', 'SELL', '0.001'],
    ['kraken', 'USDT/CAD', 'SELL', '0.002'],
  ]);
  expect(result.legs[0]!.quoteAmount).toBe(result.legs[1]!.baseAmount);
  expect(result.replayed).toBe(true);
});

it('falls back to a direct route when a synthetic leg lacks liquidity and otherwise fails safely', () => {
  const thin = source('kraken', 'CAD', 'USD', '0.71', '0.72', '1');
  const request = { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' } as const;
  expect(selectRoute([direct, ethUsd, thin], request).legs).toHaveLength(1);
  expect(() => selectRoute([ethUsd, thin], request)).toThrow(
    expect.objectContaining({ code: 'insufficient_liquidity' }),
  );
  expect(() => selectRoute([ethUsd], request)).toThrow(
    expect.objectContaining({ code: 'price_unavailable' }),
  );
});

it('enumerates direct and exactly two-leg bridge routes without a third leg or currency loops', () => {
  const books = [
    direct,
    ethUsd,
    cadUsd,
    source('binance', 'ETH', 'USDT', '3000', '3010'),
    source('kraken', 'USDT', 'CAD', '1.39', '1.4'),
    source('coinbase', 'ETH', 'USDC', '3000', '3010'),
    source('kraken', 'USDC', 'CAD', '1.39', '1.4'),
  ];
  const routes = enumerateRoutes(books, 'ETH', 'CAD');
  expect(routes).toHaveLength(4);
  expect(routes.map((route) => route.map((leg) => leg.to).join('/')).sort()).toEqual([
    'CAD',
    'USD/CAD',
    'USDC/CAD',
    'USDT/CAD',
  ]);
  expect(enumerateRoutes([ethUsd], 'ETH', 'USD')).toHaveLength(1);
});

it('carries an unrounded repeating intermediate amount through an inverted first leg', () => {
  const result = selectRoute(
    [source('kraken', 'USD', 'USDC', '2', '3'), source('coinbase', 'USD', 'CAD', '1.4', '1.5')],
    { pair: 'USDC/CAD', side: 'SELL', fixed: 'base', amount: '10000' },
  );
  expect(result.legs.map((leg) => leg.side)).toEqual(['BUY', 'SELL']);
  expect(result.quoteAmount).toBe(new Money('10000').div(3).mul('1.4').toFixed());
});
