import { z } from 'zod';
import { Money, decimalStringSchema } from './money.js';
import { organisationSchema } from './session.js';
import { venueIdSchema } from './pricing.js';
const bps = decimalStringSchema.refine(
  (value) =>
    decimalStringSchema.safeParse(value).success &&
    new Money(value).lt(10000) &&
    new Money(value).decimalPlaces() <= 6,
  'Spread must be between 0 and 9,999.999999 bps.',
);
const amount = decimalStringSchema.refine(
  (value) =>
    decimalStringSchema.safeParse(value).success &&
    new Money(value).gt(0) &&
    new Money(value).lt('1e36') &&
    new Money(value).decimalPlaces() <= 2,
  'Enter a positive CAD amount with at most two decimal places.',
);
export const pricingSettingsSchema = z.strictObject({
  quoteLifetimeSeconds: z.number().int().min(5).max(120),
  minimumTradeCad: amount,
  referenceSpreadBps: bps,
});
export const tierSchema = z.enum(['Tier 1', 'Standard']);
const bands = z
  .array(z.strictObject({ tier: tierSchema, band: z.number().int().min(0).max(2), bps }))
  .length(6)
  .refine(
    (rows) => new Set(rows.map((row) => `${row.tier}:${row.band}`)).size === 6,
    'Provide all three bands for both tiers exactly once.',
  );
const orgUpdates = z
  .array(z.strictObject({ id: z.string().min(1), tier: tierSchema, maxTradeSize: amount }))
  .min(1)
  .max(100)
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    'Organisation IDs must be unique.',
  );
const venueUpdates = z
  .array(z.strictObject({ id: venueIdSchema, enabled: z.boolean() }))
  .length(3)
  .refine((rows) => new Set(rows.map((row) => row.id)).size === 3, 'Provide each venue exactly once.');
export const configurationUpdateSchema = z
  .strictObject({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    settings: pricingSettingsSchema,
    spreadBands: bands,
    organisations: orgUpdates,
    venues: venueUpdates,
  })
  .superRefine((input, ctx) => {
    input.organisations.forEach((org, index) => {
      if (
        decimalStringSchema.safeParse(org.maxTradeSize).success &&
        decimalStringSchema.safeParse(input.settings.minimumTradeCad).success &&
        new Money(org.maxTradeSize).lt(input.settings.minimumTradeCad)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['organisations', index, 'maxTradeSize'],
          message: 'Maximum trade must be at least the minimum trade.',
        });
    });
  });
export const configurationSchema = z.strictObject({
  revision: z.string(),
  settings: pricingSettingsSchema,
  spreadBands: bands,
  organisations: z.array(organisationSchema),
  venues: venueUpdates,
});
export type Configuration = z.infer<typeof configurationSchema>;
export type ConfigurationUpdate = z.infer<typeof configurationUpdateSchema>;
export function configurationUpdate(config: Configuration): ConfigurationUpdate {
  return {
    ...config,
    organisations: config.organisations.map(({ id, tier, maxTradeSize }) => ({
      id,
      tier: tierSchema.parse(tier),
      maxTradeSize,
    })),
  };
}
