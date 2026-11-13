import { Writable } from 'node:stream';
import { errorResponseSchema } from '@northbook/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createDatabase } from './db/client.js';
import { AppError } from './errors.js';
import { createLogger } from './logging.js';

const apps: ReturnType<typeof buildApp>[] = [];

function fixture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  // These HTTP tracing tests make no database calls; the pool connects lazily.
  const database = createDatabase('postgresql://northbook_app@127.0.0.1:1/northbook');
  const app = buildApp(database, createLogger(stream), {
    sessionSecret: 'test-session-secret-at-least-32-characters',
  });
  apps.push(app);
  return { app, lines };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('request tracing', () => {
  it.each([undefined, 'proxy-request-123'])(
    'an error response and its log line carry the same request id (%s)',
    async (forwardedId) => {
      const { app, lines } = fixture();
      const response = await app.inject({
        method: 'GET',
        url: '/api/missing',
        headers: {
          cookie: 'session=fictional-session-cookie',
          ...(forwardedId ? { 'x-request-id': forwardedId } : {}),
        },
      });

      expect(response.statusCode).toBe(404);
      const body = errorResponseSchema.parse(response.json());
      const requestId = response.headers['x-request-id'];
      expect(requestId).toEqual(expect.any(String));
      expect(body).toEqual({ error: { code: 'not_found', message: 'Resource not found.', requestId } });
      if (forwardedId) expect(requestId).toBe(forwardedId);
      else expect(requestId).toMatch(/^[a-f0-9-]{36}$/);

      const logs = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      const errorLog = logs.find((line) => line.msg === 'Request failed');
      expect(errorLog).toMatchObject({ requestId, error: body.error });
      expect(logs.some((line) => line.msg === 'incoming request')).toBe(true);
      expect(logs.some((line) => line.msg === 'request completed')).toBe(true);
      for (const line of logs) expect(line.requestId).toBe(requestId);
      expect(lines.join('')).not.toContain('fictional-session-cookie');
    },
  );

  it('gives malformed JSON the shared validation error shape and request id', async () => {
    const { app } = fixture();
    app.post('/api/test-body', { config: { access: 'public' } }, async () => ({ ok: true }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/test-body',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    expect(response.statusCode).toBe(400);
    expect(errorResponseSchema.parse(response.json()).error).toEqual({
      code: 'validation_failed',
      message: 'Invalid request.',
      requestId: response.headers['x-request-id'],
    });
  });

  it('uses the specified HTTP status for an application error', async () => {
    const { app } = fixture();
    app.get('/api/test-expired', { config: { access: 'public' } }, async () => {
      throw new AppError('quote_expired', 'Quote expired.');
    });
    const response = await app.inject('/api/test-expired');
    expect(response.statusCode).toBe(410);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe('quote_expired');
  });

  it('replaces an invalid forwarded request id and generates distinct ids', async () => {
    const { app } = fixture();
    const first = await app.inject({ url: '/api/missing', headers: { 'x-request-id': 'invalid id' } });
    const second = await app.inject('/api/missing');
    expect(first.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('keeps unexpected failure details in correlated logs, never in the response', async () => {
    const { app, lines } = fixture();
    app.get('/api/test-failure', { config: { access: 'public' } }, async () => {
      throw Object.assign(new Error('private implementation detail'), {
        client: { password: 'fictional-driver-password' },
      });
    });
    const response = await app.inject('/api/test-failure');
    expect(response.statusCode).toBe(500);
    expect(errorResponseSchema.parse(response.json())).toEqual({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred.',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(response.body).not.toContain('private implementation detail');
    expect(lines.join('')).not.toContain('fictional-driver-password');
    const logs = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(logs.find((line) => line.msg === 'Unexpected request failure')).toMatchObject({
      requestId: response.headers['x-request-id'],
      err: { message: 'private implementation detail' },
    });
  });
});
