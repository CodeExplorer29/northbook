import {
  emptyRequestSchema,
  entityParamsSchema,
  kybDraftSchema,
  kybRejectionSchema,
} from '@northbook/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireOrganisation, requirePersona } from './auth.js';
import type { Database } from './db/client.js';
import { kybApplications, organisations } from './db/schema.js';
import { idempotent } from './idempotency.js';
import { decideKybApplication, readKybApplication, saveKybDraft, submitKybApplication } from './kyb.js';

export function registerKybRoutes(app: FastifyInstance, database: Database) {
  app.get('/api/kyb/application', { config: { access: 'client' } }, async (request) => {
    emptyRequestSchema.parse(request.query);
    return database.db.transaction((tx) => readKybApplication(tx, requireOrganisation(request)));
  });
  app.put('/api/kyb/application', { config: { access: 'client' } }, async (request) => {
    emptyRequestSchema.parse(request.query);
    const input = kybDraftSchema.parse(request.body);
    return database.db.transaction((tx) => saveKybDraft(tx, requireOrganisation(request), input));
  });
  app.post(
    '/api/kyb/application/submit',
    { config: { access: 'client' } },
    idempotent(
      database,
      async (tx, request) => {
        emptyRequestSchema.parse(request.query);
        emptyRequestSchema.parse(request.body ?? {});
        return submitKybApplication(tx, requireOrganisation(request));
      },
      200,
      'kyb_submitted',
    ),
  );
  app.get('/api/staff/applications', { config: { access: 'staff' } }, async (request) => {
    emptyRequestSchema.parse(request.query);
    const rows = await database.db
      .select({ application: kybApplications, organisation: organisations })
      .from(kybApplications)
      .innerJoin(organisations, eq(organisations.id, kybApplications.organisationId))
      .orderBy(desc(kybApplications.updatedAt));
    return rows.map(({ application, organisation }) => ({ ...application, organisation }));
  });
  for (const action of ['approve', 'reject'] as const)
    app.post(
      `/api/staff/applications/:id/${action}`,
      { config: { access: 'staff' } },
      idempotent(
        database,
        async (tx, request) => {
          emptyRequestSchema.parse(request.query);
          const { id } = entityParamsSchema.parse(request.params);
          const reason = action === 'reject' ? kybRejectionSchema.parse(request.body).reason : undefined;
          if (action === 'approve') emptyRequestSchema.parse(request.body ?? {});
          return decideKybApplication(tx, id, action, requirePersona(request).user.id, reason);
        },
        200,
        `kyb_${action === 'approve' ? 'approved' : 'rejected'}`,
      ),
    );
}
