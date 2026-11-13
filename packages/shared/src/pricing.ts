import { z } from 'zod';
import { decimalStringSchema, pairSchema, sideSchema } from './money.js';

export const venueIdSchema = z.enum(['kraken', 'coinbase', 'binance']);
export const venueUpdateSchema = z.strictObject({ enabled: z.boolean() });
export const venueConfigurationSchema = z.strictObject({
  id: venueIdSchema,
  enabled: z.boolean(),
  feeRate: decimalStringSchema,
});
export const venueHealthSchema = venueConfigurationSchema.extend({
  status: z.enum([
    'connecting',
    'connected',
    'resynchronising',
    'disconnected',
    'polling',
    'stale',
    'disabled',
  ]),
  lastUpdate: z.number().nullable(),
  markets: z.number().int().nonnegative(),
  readyMarkets: z.number().int().nonnegative(),
  replayed: z.boolean(),
  staleAfterMs: z.number().int().positive(),
});

export const publicPriceSchema = z.strictObject({
  pair: pairSchema,
  side: sideSchema,
  unitPrice: decimalStringSchema,
  indicative: z.literal(true),
  updatedAt: z.iso.datetime(),
  replayed: z.boolean(),
  cadPerQuote: decimalStringSchema,
  minimumTradeCad: decimalStringSchema,
});
export type PublicPrice = z.infer<typeof publicPriceSchema>;
export const publicPriceEventSchema = z.discriminatedUnion('status', [
  publicPriceSchema.extend({ status: z.literal('ready') }),
  z.strictObject({
    status: z.literal('unavailable'),
    pair: pairSchema,
    side: sideSchema,
    indicative: z.literal(true),
    code: z.literal('price_unavailable'),
    message: z.string(),
  }),
]);
export type PublicPriceEvent = z.infer<typeof publicPriceEventSchema>;
