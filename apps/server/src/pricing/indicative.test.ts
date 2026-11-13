import { expect, it } from 'vitest';
import { indicativePrice } from './indicative.js';
import type { PricedBook } from './depth.js';

const books: PricedBook[] = [
  {
    feeRate: '0',
    book: {
      venue: 'kraken',
      market: { symbol: 'ETH/CAD', base: 'ETH', quote: 'CAD' },
      bids: [
        { price: '4000', size: '0.01' },
        { price: '3900', size: '1000' },
      ],
      asks: [
        { price: '4200', size: '0.01' },
        { price: '4300', size: '1000' },
      ],
      receivedAt: 1000,
      replayed: true,
    },
  },
];
const config = { spreadBps: '50', minimumTradeCad: '10000' };
it('uses one top-of-book midpoint with directional reference spread, not depth or tier', () => {
  expect(indicativePrice(books, 'ETH/CAD', 'SELL', config)).toMatchObject({
    unitPrice: '4079.5',
    indicative: true,
    cadPerQuote: '1',
    replayed: true,
    updatedAt: '1970-01-01T00:00:01.000Z',
  });
  expect(indicativePrice(books, 'ETH/CAD', 'BUY', config).unitPrice).toBe('4120.5');
  const deeper = structuredClone(books);
  deeper[0]!.book.bids[0]!.size = '1000000';
  expect(indicativePrice(deeper, 'ETH/CAD', 'SELL', config).unitPrice).toBe('4079.5');
  expect(() => indicativePrice([], 'ETH/CAD', 'SELL', config)).toThrow(
    expect.objectContaining({ code: 'price_unavailable' }),
  );
});
it('compares synthetic/inverted top rates including venue fees and reports the oldest contributing time', () => {
  const synthetic: PricedBook[] = [
    {
      feeRate: '0.001',
      book: {
        venue: 'coinbase',
        market: { symbol: 'ETH/USD', base: 'ETH', quote: 'USD' },
        bids: [{ price: '3000', size: '100' }],
        asks: [{ price: '3020', size: '100' }],
        receivedAt: 2000,
        replayed: false,
      },
    },
    {
      feeRate: '0',
      book: {
        venue: 'kraken',
        market: { symbol: 'CAD/USD', base: 'CAD', quote: 'USD' },
        bids: [{ price: '0.71', size: '10000' }],
        asks: [{ price: '0.72', size: '10000' }],
        receivedAt: 1000,
        replayed: true,
      },
    },
  ];
  const result = indicativePrice(synthetic, 'ETH/CAD', 'SELL', { ...config, spreadBps: '0' });
  expect(result.unitPrice).toBe('4210.137323943661971831');
  expect(result.updatedAt).toBe('1970-01-01T00:00:01.000Z');
  expect(result.replayed).toBe(true);
  const usd = indicativePrice(synthetic, 'ETH/USD', 'SELL', config);
  expect(usd.cadPerQuote).toBe('1.398669796557120501');
});
