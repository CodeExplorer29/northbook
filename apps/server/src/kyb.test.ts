import { randomUUID } from 'node:crypto';
import { kybApplicationSchema, staffKybApplicationSchema, type KybDraft } from '@northbook/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { seedIdentity } from './db/seed.js';
import { kybApplications, organisations } from './db/schema.js';
import { createKybDraft } from './kyb.js';
import { createLogger } from './logging.js';
import { testDatabase } from './test-database.js';
import { testMarketData } from './test-pricing.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
let client: string, staff: string, maple: string;
const complete: KybDraft = {
  legalName: 'Cedar sample legal name',
  registrationNumber: 'DEMO-123',
  jurisdiction: 'Alberta, Canada',
  natureOfBusiness: 'Business payments',
  beneficialOwners: [{ name: 'Sample owner', ownership: '100' }],
};
const read = () => app.inject({ url: '/api/kyb/application', headers: { cookie: client } });
const save = (payload: object = complete) =>
  app.inject({ method: 'PUT', url: '/api/kyb/application', headers: { cookie: client }, payload });
const submit = (key = randomUUID(), payload = {}, query = '') =>
  app.inject({
    method: 'POST',
    url: `/api/kyb/application/submit${query}`,
    headers: { cookie: client, 'idempotency-key': key },
    payload,
  });
const decide = (id: string, action: 'approve' | 'reject', payload = {}, key = randomUUID()) =>
  app.inject({
    method: 'POST',
    url: `/api/staff/applications/${id}/${action}`,
    headers: { cookie: staff, 'idempotency-key': key },
    payload,
  });
const quote = () =>
  app.inject({
    method: 'POST',
    url: '/api/quotes',
    headers: { cookie: client, 'idempotency-key': randomUUID() },
    payload: { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' },
  });
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
  app = buildApp(fixture.database, createLogger({ write() {} }), { pricing: testMarketData });
  const login = async (userId: string) => {
    const response = await app.inject({ method: 'POST', url: '/api/demo/persona', payload: { userId } });
    return (response.headers['set-cookie'] as string).split(';')[0]!;
  };
  [client, staff, maple] = await Promise.all([login('cedar-admin'), login('staff'), login('maple-trader')]);
});
beforeEach(async () => {
  await fixture.owner.db.transaction(async (tx) => {
    await tx.delete(kybApplications).where(eq(kybApplications.organisationId, 'cedar'));
    await tx.update(organisations).set({ kybState: 'draft' }).where(eq(organisations.id, 'cedar'));
    await createKybDraft(tx, 'cedar');
  });
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});

it('refuses missing fields without recording a submission, and forbids caller-controlled state, scope or clock', async () => {
  const empty = {
    legalName: '',
    registrationNumber: '',
    jurisdiction: '',
    natureOfBusiness: '',
    beneficialOwners: [],
  };
  expect((await save(empty)).statusCode).toBe(200);
  const refused = await submit();
  expect(refused.statusCode).toBe(400);
  for (const field of Object.keys(empty)) expect(refused.json().error.message).toContain(field);
  expect((await read()).json()).toMatchObject({ state: 'draft', submittedAt: null, submissionCount: 0 });
  for (const extra of [{ state: 'approved' }, { organisationId: 'maple' }, { asOf: '2020-01-01' }])
    expect((await save({ ...complete, ...extra })).statusCode).toBe(400);
  expect((await submit(randomUUID(), { asOf: '2020-01-01' })).statusCode).toBe(400);
  expect((await submit(randomUUID(), {}, '?asOf=2020-01-01')).statusCode).toBe(400);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/kyb/application/submit',
        headers: { cookie: client },
        payload: {},
      })
    ).json().error.code,
  ).toBe('idempotency_key_required');
});

it('records one submission under concurrency and replays the exact response for its key', async () => {
  await save();
  const responses = await Promise.all(Array.from({ length: 20 }, () => submit()));
  expect(responses.every((response) => response.statusCode === 200)).toBe(true);
  expect(new Set(responses.map((response) => response.json().submittedAt)).size).toBe(1);
  const key = randomUUID();
  const first = await submit(key);
  expect((await submit(key)).json()).toEqual(first.json());
  const application = kybApplicationSchema.parse(first.json());
  expect(application).toMatchObject({ ...complete, state: 'submitted', submissionCount: 1 });
  expect((await save()).statusCode).toBe(409);
  expect((await quote()).json().error.code).toBe('kyb_not_approved');
  await decide(application.id, 'approve');
  // A lost submit response must still replay the original response after a decision.
  expect((await submit(key)).json()).toEqual(first.json());
  expect((await submit()).json().state).toBe('approved');
});

it('refuses approval of drafts and only unlocks firm quotes after a staff approval', async () => {
  const id = (await read()).json().id as string;
  expect((await quote()).json().error.code).toBe('kyb_not_approved');
  expect((await decide(id, 'approve')).json().error.code).toBe('invalid_transition');
  expect((await read()).json().state).toBe('draft');
  await save();
  await submit();
  const key = randomUUID();
  const approved = await decide(id, 'approve', {}, key);
  expect(approved.statusCode).toBe(200);
  expect(approved.json()).toMatchObject({ state: 'approved', decisionBy: 'staff', decisionReason: null });
  expect((await decide(id, 'approve', {}, key)).json()).toEqual(approved.json());
  expect((await decide(id, 'approve')).json()).toEqual(approved.json());
  expect(
    (await app.inject({ url: '/api/me', headers: { cookie: client } })).json().organisation,
  ).toMatchObject({ name: complete.legalName, kybState: 'approved' });
  expect((await quote()).statusCode).toBe(201);
  expect((await decide(id, 'reject', { reason: 'Too late' })).statusCode).toBe(409);
});

it('requires and preserves the rejection reason, leaving the organisation unable to trade', async () => {
  await save();
  const id = (await submit()).json().id as string;
  for (const reason of [undefined, '', '   '])
    expect((await decide(id, 'reject', { reason })).statusCode).toBe(400);
  const rejected = await decide(id, 'reject', { reason: '  Sample registration needs review.  ' });
  expect(rejected.json()).toMatchObject({
    state: 'rejected',
    decisionReason: 'Sample registration needs review.',
    decisionBy: 'staff',
  });
  expect((await decide(id, 'reject', { reason: 'Sample registration needs review.' })).json()).toEqual(
    rejected.json(),
  );
  expect((await decide(id, 'reject', { reason: 'A replacement reason' })).statusCode).toBe(409);
  expect((await save()).statusCode).toBe(409);
  expect((await quote()).json().error.code).toBe('kyb_not_approved');
  expect(
    (await app.inject({ url: '/api/me', headers: { cookie: client } })).json().organisation.kybState,
  ).toBe('rejected');
});

it('serializes competing decisions and keeps the application and organisation consistent', async () => {
  await save();
  const id = (await submit()).json().id as string;
  const results = await Promise.all([
    decide(id, 'approve'),
    decide(id, 'reject', { reason: 'Competing decision' }),
  ]);
  expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  const application = kybApplicationSchema.parse((await read()).json());
  const [organisation] = await fixture.database.db
    .select()
    .from(organisations)
    .where(eq(organisations.id, 'cedar'));
  expect(organisation!.kybState).toBe(application.state);
  expect(application.submissionCount).toBe(1);
});

it('scopes applications and decisions by persona, and seeds approved identities through the lifecycle', async () => {
  const id = (await read()).json().id as string;
  expect((await app.inject({ url: '/api/kyb/application' })).statusCode).toBe(401);
  expect((await app.inject({ url: '/api/kyb/application', headers: { cookie: staff } })).statusCode).toBe(
    403,
  );
  expect((await app.inject({ url: '/api/staff/applications', headers: { cookie: client } })).statusCode).toBe(
    403,
  );
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/api/staff/applications/${id}/approve`,
        headers: { cookie: client, 'idempotency-key': randomUUID() },
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  const own = kybApplicationSchema.parse(
    (await app.inject({ url: '/api/kyb/application', headers: { cookie: maple } })).json(),
  );
  expect(own).toMatchObject({
    organisationId: 'maple',
    state: 'approved',
    submissionCount: 1,
    decisionBy: 'staff',
  });
  expect(own.submittedAt).not.toBeNull();
  expect(own.decidedAt).not.toBeNull();
  expect(own.id).not.toBe(id);
  const all = staffKybApplicationSchema
    .array()
    .parse((await app.inject({ url: '/api/staff/applications', headers: { cookie: staff } })).json());
  expect(all).toHaveLength(3);
  expect(all.every((item) => item.organisation.kybState === item.state)).toBe(true);
});
