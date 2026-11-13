import { describe, expect, it } from 'vitest';
import { bookSideFor, pairSchema, quoteAmounts, quoteRequestSchema, roundAmount } from './money.js';

describe('money conventions', () => {
  it('rounds computed amounts up and down without binary floating point', () => {
    expect(roundAmount('1.000000000000000001', 'CAD', 'up')).toBe('1.01');
    expect(roundAmount('1.009999999999999999', 'CAD', 'down')).toBe('1.00');
    expect(roundAmount('9007199254740993.011', 'CAD', 'up')).toBe('9007199254740993.02');
    expect(roundAmount('1.0000000000000000011', 'ETH', 'up')).toBe('1.000000000000000002');
    expect(roundAmount('1.000000009', 'BTC', 'down')).toBe('1.00000000');
    expect(roundAmount('1.0000001', 'USDC', 'up')).toBe('1.000001');
  });

  it.each([
    {
      side: 'BUY',
      fixed: 'base',
      amount: '2',
      price: '95580.3645',
      baseAmount: '2',
      quoteAmount: '191160.73',
      payCurrency: 'CAD',
    },
    {
      side: 'SELL',
      fixed: 'base',
      amount: '50',
      price: '4157.846425',
      baseAmount: '50',
      quoteAmount: '207892.32',
      payCurrency: 'BTC',
    },
    {
      side: 'BUY',
      fixed: 'quote',
      amount: '1.00',
      price: '3',
      baseAmount: '0.33333333',
      quoteAmount: '1.00',
      payCurrency: 'CAD',
    },
    {
      side: 'SELL',
      fixed: 'quote',
      amount: '1.00',
      price: '3',
      baseAmount: '0.33333334',
      quoteAmount: '1.00',
      payCurrency: 'BTC',
    },
  ] as const)('preserves the fixed amount and rounds $side / fixed $fixed towards the desk', (example) => {
    const result = quoteAmounts({ pair: 'BTC/CAD', ...example });
    expect(result).toMatchObject({
      baseAmount: example.baseAmount,
      quoteAmount: example.quoteAmount,
      payCurrency: example.payCurrency,
    });
    expect(result.payAmount).toBe(example.side === 'BUY' ? example.quoteAmount : example.baseAmount);
    expect(result.receiveAmount).toBe(example.side === 'BUY' ? example.baseAmount : example.quoteAmount);
  });

  it('implements both worked examples without rounding the unit price before the amount', () => {
    expect(
      quoteAmounts({ pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50', price: '4157.846425' }),
    ).toMatchObject({
      payAmount: '50',
      receiveAmount: '207892.32',
      unitPrice: '4157.8464',
    });
    expect(
      quoteAmounts({ pair: 'BTC/CAD', side: 'BUY', fixed: 'base', amount: '2', price: '95580.3645' })
        .payAmount,
    ).toBe('191160.73');
  });

  it('validates eight pairs, direction and exact precision on the fixed amount', () => {
    expect(pairSchema.options).toHaveLength(8);
    expect(pairSchema.safeParse('CAD/ETH').success).toBe(false);
    expect(bookSideFor('BUY')).toBe('asks');
    expect(bookSideFor('SELL')).toBe('bids');
    for (const amount of ['0', '-1', 'NaN', 'invalid', '1e3', '1.001']) {
      expect(
        quoteRequestSchema.safeParse({ pair: 'ETH/CAD', side: 'BUY', fixed: 'quote', amount }).success,
      ).toBe(false);
    }
    expect(
      quoteRequestSchema.safeParse({
        pair: 'ETH/CAD',
        side: 'BUY',
        fixed: 'base',
        amount: '0.000000000000000001',
      }).success,
    ).toBe(true);
  });
});
