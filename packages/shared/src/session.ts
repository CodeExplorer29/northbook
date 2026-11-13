import { z } from 'zod';

export const personaIdSchema = z.enum([
  'visitor',
  'maple-trader',
  'harbourline-trader',
  'cedar-admin',
  'staff',
]);
export const personaRequestSchema = z.strictObject({ userId: personaIdSchema });
export const userSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  role: z.enum(['client', 'staff']),
  organisationId: z.string().nullable(),
});
export const organisationSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  jurisdiction: z.string(),
  tier: z.string(),
  maxTradeSize: z.string(),
  kybState: z.enum(['draft', 'submitted', 'approved', 'rejected']),
});
export const sessionSchema = z.strictObject({
  user: userSchema,
  organisation: organisationSchema.nullable(),
});
export type Session = z.infer<typeof sessionSchema>;
export const demoStatusSchema = z.strictObject({
  personas: z.array(sessionSchema),
  sharedNotice: z.string(),
});
export type DemoStatus = z.infer<typeof demoStatusSchema>;
