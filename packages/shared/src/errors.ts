import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'validation_failed',
  'idempotency_key_required',
  'not_authenticated',
  'forbidden',
  'kyb_not_approved',
  'not_found',
  'idempotency_conflict',
  'idempotency_in_progress',
  'reset_in_progress',
  'configuration_conflict',
  'invalid_transition',
  'quote_expired',
  'below_minimum',
  'above_maximum',
  'insufficient_liquidity',
  'rate_limited',
  'price_unavailable',
  'internal_error',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorHttpStatus = {
  validation_failed: 400,
  idempotency_key_required: 400,
  not_authenticated: 401,
  forbidden: 403,
  kyb_not_approved: 403,
  not_found: 404,
  idempotency_conflict: 409,
  idempotency_in_progress: 409,
  reset_in_progress: 409,
  configuration_conflict: 409,
  invalid_transition: 409,
  quote_expired: 410,
  below_minimum: 422,
  above_maximum: 422,
  insufficient_liquidity: 422,
  rate_limited: 429,
  price_unavailable: 503,
  internal_error: 500,
} as const satisfies Record<ErrorCode, number>;

export const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
