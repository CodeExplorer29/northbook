import { z } from 'zod';
import { currencySchema, decimalStringSchema, sideSchema } from './money.js';
import { accountTypeSchema } from './ledger.js';
import { organisationSchema } from './session.js';
import { tradeDetailSchema, tradeEventSchema } from './trading.js';
import { venueIdSchema } from './pricing.js';

// Route calculations retain full intermediate precision, beyond HTTP input limits.
const calculation = z
  .string()
  .max(500)
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/);
export const routeLegSchema = z.object({
  venue: venueIdSchema,
  market: z.string(),
  side: sideSchema,
  marketPrice: calculation,
  feeRate: calculation,
  levelsUsed: z.number().int().positive().optional(),
  replayed: z.boolean(),
});
export const routeSnapshotSchema = z.object({
  mode: z.string().optional(),
  source: z.string().optional(),
  path: z.array(currencySchema).optional(),
  legs: z.array(routeLegSchema).optional(),
  marketQuoteAmount: calculation.optional(),
  notionalCad: calculation.optional(),
  tier: z.string().optional(),
  band: z.number().int().min(0).max(2).optional(),
});
export const ledgerPostingSchema = z.strictObject({
  id: z.uuid(),
  accountId: z.string(),
  accountType: accountTypeSchema,
  organisationId: z.string().nullable(),
  currency: currencySchema,
  direction: z.enum(['debit', 'credit']),
  amount: decimalStringSchema,
});
export const ledgerGroupSchema = z.strictObject({
  event: tradeEventSchema,
  transactionId: z.uuid().nullable(),
  reversesTransactionId: z.uuid().nullable(),
  entries: z.array(ledgerPostingSchema),
});
export type LedgerGroupData = z.infer<typeof ledgerGroupSchema>;
export const staffTradeDetailSchema = tradeDetailSchema.extend({
  organisation: organisationSchema,
  pricing: z.strictObject({
    marketPrice: decimalStringSchema,
    spreadBps: decimalStringSchema,
    route: routeSnapshotSchema,
  }),
  ledger: z.array(ledgerGroupSchema),
});
export type StaffTradeDetail = z.infer<typeof staffTradeDetailSchema>;
