import { z } from 'zod';
import { currencySchema, decimalStringSchema } from './money.js';

export const accountTypeSchema = z.enum([
  'client_receivable',
  'client_payable',
  'desk_bank',
  'desk_wallet',
  'spread_revenue',
  'trading_position',
]);
export type AccountType = z.infer<typeof accountTypeSchema>;
const signedDecimal = z.string().regex(/^-?(0|[1-9]\d*)(\.\d+)?$/);
export const accountBalanceSchema = z.strictObject({
  accountId: z.string(),
  type: accountTypeSchema,
  currency: currencySchema,
  organisationId: z.string().nullable(),
  debits: decimalStringSchema,
  credits: decimalStringSchema,
  balance: signedDecimal,
});
export type AccountBalance = z.infer<typeof accountBalanceSchema>;
export const ledgerDiscrepancySchema = z.strictObject({
  kind: z.enum([
    'unbalanced_transaction',
    'empty_transaction',
    'missing_posting',
    'unexpected_posting',
    'open_client_obligation',
  ]),
  tradeId: z.string(),
  transactionId: z.string().optional(),
  sourceEventId: z.string().optional(),
  accountId: z.string().optional(),
  currency: currencySchema.optional(),
  difference: signedDecimal.optional(),
});
export type LedgerDiscrepancy = z.infer<typeof ledgerDiscrepancySchema>;
export const ledgerCheckSchema = z.strictObject({
  ok: z.boolean(),
  discrepancies: z.array(ledgerDiscrepancySchema),
});

export const deskSchema = z.strictObject({
  asOf: z.iso.datetime(),
  positions: z.array(
    z.strictObject({
      currency: currencySchema,
      quantity: signedDecimal,
      priceCad: decimalStringSchema.nullable(),
      valueCad: signedDecimal.nullable(),
    }),
  ),
  unrealisedCad: signedDecimal.nullable(),
  revenue: z.array(z.strictObject({ currency: currencySchema, total: signedDecimal, today: signedDecimal })),
  revenueCad: signedDecimal.nullable(),
  clients: z.array(
    z.strictObject({
      organisationId: z.string(),
      name: z.string(),
      currency: currencySchema,
      trades: z.number().int().nonnegative(),
      revenue: signedDecimal,
    }),
  ),
});
export type Desk = z.infer<typeof deskSchema>;
