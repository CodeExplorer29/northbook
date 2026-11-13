import { z } from 'zod';
import { currencySchema, decimalStringSchema } from './money.js';
import { organisationSchema } from './session.js';
import { quoteResponseSchema, tradeResponseSchema } from './trading.js';
import { routeSnapshotSchema } from './staff-trading.js';

export const blotterQuoteSchema = quoteResponseSchema.extend({
  organisation: organisationSchema,
  marketPrice: decimalStringSchema,
  spreadBps: decimalStringSchema,
  route: routeSnapshotSchema,
});
export const blotterTradeSchema = tradeResponseSchema.extend({ organisation: organisationSchema });
export const blotterSchema = z.strictObject({
  asOf: z.iso.datetime(),
  trades: z.array(blotterTradeSchema),
  quotes: z.array(blotterQuoteSchema),
  summary: z.strictObject({
    inProgress: z.number().int(),
    settledToday: z.number().int(),
    awaitingFunds: z.number().int(),
    revenue: z.array(
      z.strictObject({ currency: currencySchema, amount: z.string().regex(/^-?\d+(\.\d+)?$/) }),
    ),
  }),
});
export type Blotter = z.infer<typeof blotterSchema>;
