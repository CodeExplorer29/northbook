import { Decimal } from 'decimal.js';
import { z } from 'zod';

// Never use binary floating point for amounts. Extra precision is retained until
// the final currency rounding; display prices are informational only.
export const Money = Decimal.clone({ precision: 120, rounding: Decimal.ROUND_HALF_UP });
export const currencySchema = z.enum(['BTC', 'ETH', 'USDC', 'USDT', 'CAD', 'USD']);
export type Currency = z.infer<typeof currencySchema>;
export const currencyPrecision: Record<Currency, number> = {
  BTC: 8,
  ETH: 18,
  USDC: 6,
  USDT: 6,
  CAD: 2,
  USD: 2,
};
export const displayPrecision: Record<Currency, number> = { ...currencyPrecision, ETH: 8 };
export const pairSchema = z.enum([
  'BTC/CAD',
  'BTC/USD',
  'ETH/CAD',
  'ETH/USD',
  'USDC/CAD',
  'USDC/USD',
  'USDT/CAD',
  'USDT/USD',
]);
export type Pair = z.infer<typeof pairSchema>;
export const sideSchema = z.enum(['BUY', 'SELL']);
export type Side = z.infer<typeof sideSchema>;
export const fixedCurrencySchema = z.enum(['base', 'quote']);
export type FixedCurrency = z.infer<typeof fixedCurrencySchema>;
export const decimalStringSchema = z
  .string()
  .max(80)
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/);
export const positiveAmountSchema = decimalStringSchema.refine((amount) => {
  if (!decimalStringSchema.safeParse(amount).success) return false;
  return new Money(amount).gt(0);
}, 'Amount must be positive.');

export function pairCurrencies(pair: Pair): { base: Currency; quote: Currency } {
  const [base, quote] = pairSchema.parse(pair).split('/');
  return { base: currencySchema.parse(base), quote: currencySchema.parse(quote) };
}

export function roundAmount(amount: string | Decimal, currency: Currency, direction: 'up' | 'down'): string {
  const value = new Money(amount);
  if (!value.isFinite() || value.lt(0)) throw new Error('Amount must be finite and nonnegative.');
  return value.toFixed(
    currencyPrecision[currency],
    direction === 'up' ? Decimal.ROUND_CEIL : Decimal.ROUND_FLOOR,
  );
}

export function bookSideFor(side: Side): 'asks' | 'bids' {
  return side === 'BUY' ? 'asks' : 'bids';
}

export const quoteRequestSchema = z
  .strictObject({
    pair: pairSchema,
    side: sideSchema,
    fixed: fixedCurrencySchema,
    amount: positiveAmountSchema,
  })
  .superRefine((request, context) => {
    if (!positiveAmountSchema.safeParse(request.amount).success) return;
    const currencies = pairCurrencies(request.pair);
    const amount = new Money(request.amount);
    if (amount.decimalPlaces() > currencyPrecision[currencies[request.fixed]] || amount.gte('1e36')) {
      context.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Amount exceeds currency precision or supported size.',
      });
    }
  });
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

// Internal route calculations may carry more digits than an external request.
export function positiveDecimal(value: string) {
  const amount = new Money(value);
  if (!amount.isFinite() || amount.lte(0)) throw new Error('Amount must be finite and positive.');
  return amount;
}

export function quoteAmounts(input: QuoteRequest & { price: string }) {
  const request = quoteRequestSchema.parse({
    pair: input.pair,
    side: input.side,
    fixed: input.fixed,
    amount: input.amount,
  });
  const price = positiveDecimal(input.price);
  const { base, quote } = pairCurrencies(request.pair);
  const fixed = new Money(request.amount);
  const baseAmount =
    request.fixed === 'base'
      ? request.amount
      : roundAmount(fixed.div(price), base, request.side === 'BUY' ? 'down' : 'up');
  const quoteAmount =
    request.fixed === 'quote'
      ? request.amount
      : roundAmount(fixed.mul(price), quote, request.side === 'BUY' ? 'up' : 'down');
  if (new Money(baseAmount).isZero() || new Money(quoteAmount).isZero()) {
    throw new Error('Amount rounds to zero.');
  }
  const buying = request.side === 'BUY';
  return {
    baseAmount,
    quoteAmount,
    payCurrency: buying ? quote : base,
    payAmount: buying ? quoteAmount : baseAmount,
    receiveCurrency: buying ? base : quote,
    receiveAmount: buying ? baseAmount : quoteAmount,
    unitPrice: new Money(quoteAmount).div(baseAmount).toDecimalPlaces(18).toFixed(),
  };
}
