import { z } from 'zod';
import { currencySchema, decimalStringSchema, fixedCurrencySchema, pairSchema, sideSchema } from './money.js';
import { quoteStateSchema, tradeActionSchema, tradeStateSchema } from './state-machines.js';

export const emptyRequestSchema = z.strictObject({});
export const entityParamsSchema = z.strictObject({ id: z.string().min(1).max(100) });
export const quoteResponseSchema = z.strictObject({
  tradeId: z.string().nullable().optional(),
  id: z.string(),
  pair: pairSchema,
  side: sideSchema,
  fixed: fixedCurrencySchema,
  requestedAmount: decimalStringSchema,
  baseAmount: decimalStringSchema,
  quoteAmount: decimalStringSchema,
  clientPrice: decimalStringSchema,
  payCurrency: currencySchema,
  payAmount: decimalStringSchema,
  receiveCurrency: currencySchema,
  receiveAmount: decimalStringSchema,
  status: quoteStateSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  replayed: z.boolean(),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
export const tradeResponseSchema = z.strictObject({
  id: z.string(),
  quoteId: z.string(),
  organisationId: z.string(),
  pair: pairSchema,
  side: sideSchema,
  baseAmount: decimalStringSchema,
  quoteAmount: decimalStringSchema,
  clientPrice: decimalStringSchema,
  state: tradeStateSchema,
  cancellationReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type TradeResponse = z.infer<typeof tradeResponseSchema>;
export const tradeEventRequestSchema = z
  .strictObject({
    action: tradeActionSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((request, context) => {
    if (request.action === 'cancel' && !request.reason)
      context.addIssue({ code: 'custom', path: ['reason'], message: 'A cancellation reason is required.' });
  });
export type TradeEventRequest = z.infer<typeof tradeEventRequestSchema>;
export const tradeEventSchema = z.strictObject({
  id: z.uuid(),
  tradeId: z.string(),
  action: z.string(),
  fromState: tradeStateSchema.nullable(),
  toState: tradeStateSchema,
  actorId: z.string(),
  simulated: z.boolean(),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const tradeDetailSchema = tradeResponseSchema.extend({ events: z.array(tradeEventSchema) });
export type TradeDetail = z.infer<typeof tradeDetailSchema>;
