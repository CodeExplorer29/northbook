import { sql } from 'drizzle-orm';
import { readSample, sampleNumber } from './sample-data.js';
import { seedHistory } from './seed-history.js';
import { seedConfiguration } from './seed-configuration.js';
import type { Database, Transaction } from './client.js';
import { organisations, users } from './schema.js';
import { createKybDraft, decideKybApplication, saveKybDraft, submitKybApplication } from '../kyb.js';

export const demoUsers = {
  maple: 'maple-trader',
  harbourline: 'harbourline-trader',
  cedar: 'cedar-admin',
  staff: 'staff',
} as const;

export async function seedIdentity(tx: Transaction, asOf?: Date) {
  const sample = await readSample();
  const ids = ['maple', 'harbourline', 'cedar'];
  await tx.insert(organisations).values(
    sample.organisations.map((org, index) => ({
      id: ids[index]!,
      name: org.name,
      jurisdiction: org.jurisdiction,
      tier: org.tier,
      kybState: 'draft' as const,
      maxTradeSize: sampleNumber(org.maxTrade),
    })),
  );
  await tx.insert(users).values([
    { id: demoUsers.maple, name: 'Priya Nair', role: 'client', organisationId: 'maple' },
    // The sample data has no Harbourline person; use an organisation-labelled demo trader.
    { id: demoUsers.harbourline, name: 'Harbourline trader', role: 'client', organisationId: 'harbourline' },
    { id: demoUsers.cedar, name: 'Tomás Reyes', role: 'client', organisationId: 'cedar' },
    { id: demoUsers.staff, name: 'Dana Okafor', role: 'staff' },
  ]);
  for (const [index, organisation] of sample.organisations.entries()) {
    const id = ids[index]!;
    const application = await createKybDraft(tx, id, asOf);
    if (organisation.kyb === 'Approved') {
      await saveKybDraft(
        tx,
        id,
        {
          legalName: organisation.name,
          jurisdiction: organisation.jurisdiction,
          registrationNumber: `DEMO-${id.toUpperCase()}`,
          natureOfBusiness: 'Demonstration payments and treasury services',
          beneficialOwners: [{ name: 'Sample beneficial owner', ownership: '100' }],
        },
        asOf,
      );
      await submitKybApplication(tx, id, asOf);
      await decideKybApplication(tx, application.id, 'approve', demoUsers.staff, undefined, asOf);
    }
  }
}

export async function seedIfEmpty(database: Database) {
  return database.db.transaction(async (tx) => {
    // Serialize startup seeds without deleting or replacing any existing data.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(724531, 1)`);
    if ((await tx.select({ id: organisations.id }).from(organisations).limit(1)).length) return false;
    await seedDemo(tx);
    return true;
  });
}

// Historical timestamps are retained from the sample data, including its “Yesterday”.
export async function seedDemo(tx: Transaction) {
  const sample = await readSample();
  await seedIdentity(tx, new Date('2026-11-10T09:00:00Z'));
  await saveKybDraft(
    tx,
    'cedar',
    {
      ...sample.kybApplication.business,
      beneficialOwners: sample.kybApplication.beneficialOwners.map((owner) => ({
        ...owner,
        ownership: sampleNumber(owner.ownership),
      })),
    },
    new Date('2026-11-12T09:00:00Z'),
  );
  await seedConfiguration(tx, sample);
  await seedHistory(tx, sample);
}
