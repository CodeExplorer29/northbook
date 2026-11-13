import { expect, it } from 'vitest';
import { priceDirectBooks, walkDepth } from './depth.js';
import type { OrderBook } from './venue.js';

const book: OrderBook = {
  venue: 'kraken',
  market: { symbol: 'ETH/CAD', base: 'ETH', quote: 'CAD' },
  receivedAt: 1,
  replayed: false,
  asks: [
    { price: '100', size: '1' },
    { price: '120', size: '9' },
  ],
  bids: [
    { price: '99', size: '1' },
    { price: '90', size: '9' },
  ],
};

it('walks asks for BUY and bids for SELL with fees in the correct direction and partial levels', () => {
  expect(walkDepth(book, { side: 'BUY', fixed: 'base', amount: '2.5' }, '0.01')).toMatchObject({
    baseAmount: '2.5',
    quoteAmount: '282.8',
    marketPrice: '113.12',
    levelsUsed: 2,
  });
  expect(walkDepth(book, { side: 'SELL', fixed: 'base', amount: '2' }, '0.01')).toMatchObject({
    baseAmount: '2',
    quoteAmount: '187.11',
    marketPrice: '93.555',
    levelsUsed: 2,
  });
});

it('fills exact quote notionals including fees for BUY and SELL without premature currency rounding', () => {
  expect(walkDepth(book, { side: 'BUY', fixed: 'quote', amount: '282.8' }, '0.01')).toMatchObject({
    baseAmount: '2.5',
    quoteAmount: '282.8',
    levelsUsed: 2,
  });
  expect(walkDepth(book, { side: 'SELL', fixed: 'quote', amount: '187.11' }, '0.01')).toMatchObject({
    baseAmount: '2',
    quoteAmount: '187.11',
    levelsUsed: 2,
  });
  const fractional = { ...book, asks: [{ price: '3', size: '1' }], bids: [{ price: '2', size: '1' }] };
  const result = walkDepth(fractional, { side: 'BUY', fixed: 'quote', amount: '1' }, '0');
  expect(result.quoteAmount).toBe('1');
  expect(result.baseAmount.startsWith('0.333333333333333333333333333333')).toBe(true);
});

it('chooses a deeper venue over better top of book for both sides and fixed currencies', () => {
  const shallow = {
    ...book,
    asks: [
      { price: '100', size: '1' },
      { price: '150', size: '99' },
    ],
    bids: [
      { price: '99', size: '1' },
      { price: '80', size: '99' },
    ],
  };
  const deep = {
    ...book,
    venue: 'coinbase' as const,
    asks: [{ price: '101', size: '100' }],
    bids: [{ price: '98', size: '100' }],
  };
  for (const side of ['BUY', 'SELL'] as const)
    for (const fixed of ['base', 'quote'] as const) {
      const chosen = priceDirectBooks(
        [
          { book: shallow, feeRate: '0.001' },
          { book: deep, feeRate: '0.002' },
        ],
        { pair: 'ETH/CAD', side, fixed, amount: fixed === 'base' ? '10' : '1000' },
      );
      expect(chosen.venue).toBe('coinbase');
    }
});

it('refuses insufficient depth in all directions, and distinguishes an unavailable market', () => {
  for (const side of ['BUY', 'SELL'] as const)
    for (const fixed of ['base', 'quote'] as const) {
      expect(() =>
        priceDirectBooks([{ book, feeRate: '0.01' }], { pair: 'ETH/CAD', side, fixed, amount: '100000' }),
      ).toThrow(expect.objectContaining({ code: 'insufficient_liquidity' }));
    }
  expect(() =>
    priceDirectBooks([{ book, feeRate: '0' }], { pair: 'BTC/CAD', side: 'BUY', fixed: 'base', amount: '1' }),
  ).toThrow(expect.objectContaining({ code: 'price_unavailable' }));
});

it('prices D14 BUY market cost before the desk spread', () => {
  const btc = {
    ...book,
    market: { symbol: 'BTC/CAD', base: 'BTC' as const, quote: 'CAD' as const },
    asks: [{ price: '95000', size: '10' }],
  };
  expect(walkDepth(btc, { side: 'BUY', fixed: 'base', amount: '2' }, '0.0026')).toMatchObject({
    quoteAmount: '190494',
    marketPrice: '95247',
  });
  expect(walkDepth(btc, { side: 'BUY', fixed: 'quote', amount: '190494' }, '0.0026')).toMatchObject({
    baseAmount: '2',
    quoteAmount: '190494',
  });
});

it('compares fees as well as book prices and fills an exact depth boundary', () => {
  const expensive = { ...book, asks: [{ price: '100', size: '10' }] };
  const cheaper = { ...book, venue: 'coinbase' as const, asks: [{ price: '101', size: '10' }] };
  const result = priceDirectBooks(
    [
      { book: expensive, feeRate: '0.02' },
      { book: cheaper, feeRate: '0' },
    ],
    { pair: 'ETH/CAD', side: 'BUY', fixed: 'base', amount: '10' },
  );
  expect(result).toMatchObject({ venue: 'coinbase', baseAmount: '10', quoteAmount: '1010' });
});
