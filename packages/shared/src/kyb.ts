import { z } from 'zod';
import { Money } from './money.js';
import { organisationSchema } from './session.js';
import { kybStateSchema } from './state-machines.js';

export const beneficialOwnerDraftSchema = z.strictObject({
  name: z.string().max(200),
  ownership: z.string().max(32),
});
export const monthlyVolumeSchema = z.enum([
  '',
  'Under 250,000 CAD',
  '250,000 to 1,000,000 CAD',
  'Over 1,000,000 CAD',
]);
export const homeVerificationSchema = z.strictObject({
  legalName: z.string().trim().max(200),
  workEmail: z.union([z.email().max(254), z.literal('')]),
  monthlyVolume: monthlyVolumeSchema,
});
export type HomeVerification = z.infer<typeof homeVerificationSchema>;
export const kybDraftSchema = z.strictObject({
  legalName: z.string().max(200),
  registrationNumber: z.string().max(100),
  jurisdiction: z.string().max(200),
  natureOfBusiness: z.string().max(2000),
  beneficialOwners: z.array(beneficialOwnerDraftSchema).max(20),
  workEmail: z.string().max(254).optional(),
  monthlyVolume: monthlyVolumeSchema.optional(),
});
export type KybDraft = z.infer<typeof kybDraftSchema>;
const ownership = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, 'Enter an ownership percentage with up to six decimal places')
  .refine((value) => {
    try {
      return new Money(value).gt(0) && new Money(value).lte(100);
    } catch {
      return false;
    }
  }, 'Ownership must be greater than 0 and at most 100');
export const kybSubmissionSchema = kybDraftSchema
  .extend({
    workEmail: homeVerificationSchema.shape.workEmail.optional(),
    legalName: z.string().trim().min(1, 'Enter the business’s legal name').max(200),
    registrationNumber: z.string().trim().min(1, 'Enter the registration number').max(100),
    jurisdiction: z.string().trim().min(1, 'Choose a jurisdiction').max(200),
    natureOfBusiness: z.string().trim().min(1, 'Describe the nature of business').max(2000),
    beneficialOwners: z
      .array(z.strictObject({ name: z.string().trim().min(1, 'Enter a full name').max(200), ownership }))
      .min(1, 'Add at least one beneficial owner')
      .max(20),
  })
  .superRefine((input, context) => {
    if (
      input.beneficialOwners.length &&
      input.beneficialOwners.every((owner) => ownership.safeParse(owner.ownership).success)
    ) {
      const total = input.beneficialOwners.reduce((sum, owner) => sum.plus(owner.ownership), new Money(0));
      if (!total.eq(100))
        context.addIssue({
          code: 'custom',
          path: ['beneficialOwners'],
          message: `Ownership adds up to ${total.toFixed()}%. It should total 100%.`,
        });
    }
  });
export const kybApplicationSchema = kybDraftSchema.extend({
  workEmail: z.string(),
  monthlyVolume: monthlyVolumeSchema,
  id: z.uuid(),
  organisationId: z.string(),
  state: kybStateSchema,
  submissionCount: z.number().int().min(0).max(1),
  submittedAt: z.iso.datetime().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionBy: z.string().nullable(),
  decisionReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type KybApplication = z.infer<typeof kybApplicationSchema>;
export const staffKybApplicationSchema = kybApplicationSchema.extend({ organisation: organisationSchema });
export const kybRejectionSchema = z.strictObject({
  reason: z.string().trim().min(1, 'A rejection reason is required').max(500),
});
