import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { seedIdentity } from './db/seed.js';
import { idempotent } from './idempotency.js';
import { AppError } from './errors.js';
import { createLogger } from './logging.js';
import { testDatabase } from './test-database.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
let cookie: string;
let release: (() => void) | undefined;
let started: (() => void) | undefined;
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
  await fixture.owner.pool.query('CREATE TABLE test_effects (id serial PRIMARY KEY)');
  app = buildApp(fixture.database, createLogger({ write() {} }));
  app.post(
    '/api/test/idempotency',
    idempotent(fixture.database, async (tx, request) => {
      const result = await tx.execute<{ id: number }>(
        sql`INSERT INTO test_effects DEFAULT VALUES RETURNING id`,
      );
      const body = request.body as { wait?: boolean; fail?: boolean };
      if (body.wait)
        await new Promise<void>((resolve) => {
          release = resolve;
          started?.();
        });
      if (body.fail) throw new AppError('invalid_transition', 'Test transition refused.');
      return { effectId: result.rows[0]!.id };
    }),
  );
  const response = await app.inject({
    method: 'POST',
    url: '/api/demo/persona',
    payload: { userId: 'maple-trader' },
  });
  cookie = (response.headers['set-cookie'] as string).split(';')[0]!;
});
afterAll(async () => {
  release?.();
  await app?.close();
  await fixture?.close();
});

const call = (key: string | undefined, payload: object) =>
  app.inject({
    method: 'POST',
    url: '/api/test/idempotency',
    payload,
    headers: { cookie, ...(key ? { 'idempotency-key': key } : {}) },
  });

it('requires a key and returns the identical response for the same key/content', async () => {
  const missing = await call(undefined, {});
  expect(missing.statusCode).toBe(400);
  expect(missing.json().error.code).toBe('idempotency_key_required');
  const first = await call('same', { a: 1, b: 2 });
  const retry = await call('same', { b: 2, a: 1 });
  expect(first.statusCode).toBe(200);
  expect(retry.json()).toEqual(first.json());
  expect((await fixture.database.pool.query('SELECT count(*) FROM test_effects')).rows[0].count).toBe('1');
  const conflict = await call('same', { a: 2 });
  expect(conflict.statusCode).toBe(409);
  expect(conflict.json().error.code).toBe('idempotency_conflict');
});

it('returns in_progress while the original operation is running, then replays it', async () => {
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const original = call('concurrent', { wait: true }).then((response) => response);
  await entered;
  const pending = await call('concurrent', { wait: true });
  expect(pending.statusCode).toBe(409);
  expect(pending.json().error.code).toBe('idempotency_in_progress');
  expect(pending.headers['retry-after']).toBe('1');
  release!();
  const first = await original;
  expect((await call('concurrent', { wait: true })).json()).toEqual(first.json());
});

it('rolls back effects on failure and replays the failure with a fresh correlated request id', async () => {
  const count = async () =>
    (await fixture.database.pool.query('SELECT count(*) FROM test_effects')).rows[0].count;
  const before = await count();
  const first = await call('failed', { fail: true });
  const second = await call('failed', { fail: true });
  expect(first.statusCode).toBe(409);
  expect(second.json().error.code).toBe('invalid_transition');
  expect(second.json().error.requestId).toBe(second.headers['x-request-id']);
  expect(second.json().error.requestId).not.toBe(first.json().error.requestId);
  expect(await count()).toBe(before);
});
