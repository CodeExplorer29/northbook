import {
  kybDraftSchema,
  kybMachine,
  kybRejectionSchema,
  kybSubmissionSchema,
  transition,
  TransitionError,
  type KybDraft,
} from '@northbook/shared';
import { eq, sql } from 'drizzle-orm';
import type { Transaction } from './db/client.js';
import { kybApplications, organisations } from './db/schema.js';
import { AppError } from './errors.js';

type Application = typeof kybApplications.$inferSelect;
const clock = (asOf?: Date) =>
  sql`date_trunc('milliseconds', COALESCE(${asOf?.toISOString() ?? null}::timestamptz, now()))`;
function change(application: Application, action: string, actor: 'client' | 'staff') {
  try {
    return transition(
      kybMachine,
      application.state,
      action,
      actor,
      application.submittedAt ? ['submit'] : [],
    );
  } catch (error) {
    if (error instanceof TransitionError) throw new AppError(error.code, error.message);
    throw error;
  }
}
export async function createKybDraft(tx: Transaction, organisationId: string, asOf?: Date) {
  const [organisation] = await tx.select().from(organisations).where(eq(organisations.id, organisationId));
  if (!organisation) throw new AppError('not_found', 'Organisation not found.');
  const [application] = await tx
    .insert(kybApplications)
    .values({
      organisationId,
      legalName: organisation.name,
      jurisdiction: organisation.jurisdiction,
      createdAt: clock(asOf),
      updatedAt: clock(asOf),
    })
    .onConflictDoNothing({ target: kybApplications.organisationId })
    .returning();
  return application ?? readKybApplication(tx, organisationId);
}
export async function readKybApplication(tx: Transaction, organisationId: string) {
  const [application] = await tx
    .select()
    .from(kybApplications)
    .where(eq(kybApplications.organisationId, organisationId));
  if (!application) throw new AppError('not_found', 'Application not found.');
  return application;
}
async function lockApplication(tx: Transaction, organisationId: string) {
  const [application] = await tx
    .select()
    .from(kybApplications)
    .where(eq(kybApplications.organisationId, organisationId))
    .for('update');
  if (!application) throw new AppError('not_found', 'Application not found.');
  return application;
}
export async function saveKybDraft(tx: Transaction, organisationId: string, input: KybDraft, asOf?: Date) {
  const fields = kybDraftSchema.parse(input);
  const application = await lockApplication(tx, organisationId);
  if (application.state !== 'draft')
    throw new AppError('invalid_transition', 'Only draft applications can be edited.');
  const [updated] = await tx
    .update(kybApplications)
    .set({ ...fields, updatedAt: clock(asOf) })
    .where(eq(kybApplications.id, application.id))
    .returning();
  return updated!;
}
export async function submitKybApplication(tx: Transaction, organisationId: string, asOf?: Date) {
  const application = await lockApplication(tx, organisationId);
  const next = change(application, 'submit', 'client');
  if (!next.changed) return application;
  const fields = kybSubmissionSchema.parse({
    legalName: application.legalName,
    registrationNumber: application.registrationNumber,
    jurisdiction: application.jurisdiction,
    natureOfBusiness: application.natureOfBusiness,
    beneficialOwners: application.beneficialOwners,
    workEmail: application.workEmail,
    monthlyVolume: application.monthlyVolume,
  });
  const [updated] = await tx
    .update(kybApplications)
    .set({
      ...fields,
      state: next.state,
      submissionCount: 1,
      submittedAt: clock(asOf),
      updatedAt: clock(asOf),
    })
    .where(eq(kybApplications.id, application.id))
    .returning();
  await tx.update(organisations).set({ kybState: next.state }).where(eq(organisations.id, organisationId));
  return updated!;
}
export async function decideKybApplication(
  tx: Transaction,
  id: string,
  action: 'approve' | 'reject',
  actorId: string,
  reason?: string,
  asOf?: Date,
) {
  const rejection = action === 'reject' ? kybRejectionSchema.parse({ reason }).reason : null;
  const [application] = await tx
    .select()
    .from(kybApplications)
    .where(eq(kybApplications.id, id))
    .for('update');
  if (!application) throw new AppError('not_found', 'Application not found.');
  const next = change(application, action, 'staff');
  if (!next.changed) {
    if (application.decisionReason !== rejection)
      throw new AppError('invalid_transition', 'This application already has a different decision.');
    return application;
  }
  const [updated] = await tx
    .update(kybApplications)
    .set({
      state: next.state,
      decidedAt: clock(asOf),
      decisionBy: actorId,
      decisionReason: rejection,
      updatedAt: clock(asOf),
    })
    .where(eq(kybApplications.id, id))
    .returning();
  await tx
    .update(organisations)
    .set({
      kybState: next.state,
      ...(action === 'approve'
        ? { name: application.legalName, jurisdiction: application.jurisdiction }
        : {}),
    })
    .where(eq(organisations.id, application.organisationId));
  return updated!;
}
