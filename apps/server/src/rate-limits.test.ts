import { randomUUID } from 'node:crypto';
import { signProxyAddress } from '@northbook/shared/proxy-auth';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { resetDemo } from './db/reset.js';
import { seedIfEmpty } from './db/seed.js';
import { createLogger } from './logging.js';
import { testDatabase } from './test-database.js';
import { testMarketData } from './test-pricing.js';
import { rateLimitOptions } from './rate-limits.js';
let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
let cookie: string;
const secret = 'test-proxy-secret-with-at-least-32-characters';
const url = '/api/public/prices/ETH%2FCAD';
const forwarded = (address: string, method = 'GET', path = url) => ({
  'x-forwarded-for': address,
  'x-northbook-proxy': signProxyAddress(secret, address, method, path),
});
beforeAll(async () => {
  fixture = await testDatabase();
  await seedIfEmpty(fixture.owner);
  app = buildApp(fixture.database, createLogger({ write() {} }), {
    pricing: testMarketData,
    proxySecret: secret,
    rateLimits: { publicPerMinute: 2, quotesPerMinute: 2, organisationPerMinute: 3, resetsPerFiveMinutes: 1 },
    reset: () => resetDemo(fixture.owner),
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/demo/persona',
    payload: { userId: 'maple-trader' },
  });
  cookie = (login.headers['set-cookie'] as string).split(';')[0]!;
});
beforeEach(async () => {
  await fixture.owner.pool.query('DELETE FROM rate_limits');
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});
it('atomically limits bursts, separates verified sources, correlates errors and recovers after expiry', async () => {
  const results = await Promise.all(
    Array.from({ length: 10 }, () => app.inject({ url, headers: forwarded('203.0.113.1') })),
  );
  expect(results.filter((result) => result.statusCode === 200)).toHaveLength(2);
  const limited = results.filter((result) => result.statusCode === 429);
  expect(limited).toHaveLength(8);
  for (const result of limited) {
    expect(result.json().error.code).toBe('rate_limited');
    expect(result.json().error.requestId).toBe(result.headers['x-request-id']);
    expect(Number(result.headers['retry-after'])).toBeGreaterThan(0);
  }
  expect((await app.inject({ url, headers: forwarded('203.0.113.2') })).statusCode).toBe(200);
  await fixture.owner.pool.query("UPDATE rate_limits SET expires_at=now()-interval '1 second'");
  expect((await app.inject({ url, headers: forwarded('203.0.113.1') })).statusCode).toBe(200);
});
it('ignores forged headers from direct public callers and unsigned private requests', async () => {
  for (const [remoteAddress, signed] of [
    ['198.51.100.9', true],
    ['127.0.0.1', false],
  ] as const) {
    for (let i = 0; i < 3; i++) {
      const result = await app.inject({
        url,
        remoteAddress,
        headers: signed ? forwarded(`203.0.113.${i + 1}`) : { 'x-forwarded-for': `203.0.113.${i + 1}` },
      });
      expect(result.statusCode).toBe(i < 2 ? 200 : 429);
    }
  }
});
it('shares HTTP price limits with stream opens before hijacking the response', async () => {
  for (let i = 0; i < 2; i++)
    expect((await app.inject({ url, headers: forwarded('203.0.113.1') })).statusCode).toBe(200);
  const stream = '/api/public/prices/stream?pair=ETH%2FCAD';
  const result = await app.inject({ url: stream, headers: forwarded('203.0.113.1', 'GET', stream) });
  expect(result.statusCode).toBe(429);
  expect(result.headers['content-type']).toContain('application/json');
});
it('enforces both source and organisation quote limits before creating quotes', async () => {
  const issue = (source: string) =>
    app.inject({
      method: 'POST',
      url: '/api/quotes',
      headers: { ...forwarded(source, 'POST', '/api/quotes'), cookie, 'idempotency-key': randomUUID() },
      payload: { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' },
    });
  const before = Number((await fixture.database.pool.query('SELECT count(*) FROM quotes')).rows[0].count);
  expect((await issue('203.0.113.1')).statusCode).toBe(201);
  expect((await issue('203.0.113.1')).statusCode).toBe(201);
  expect((await issue('203.0.113.1')).statusCode).toBe(429);
  // Rejected attempts count toward abuse limits too, across source addresses.
  expect((await issue('203.0.113.2')).statusCode).toBe(429);
  expect(
    Number((await fixture.database.pool.query('SELECT count(*) FROM quotes')).rows[0].count) - before,
  ).toBe(2);
});
it('a successful reset cannot erase its own limit and another source has a separate budget', async () => {
  const reset = (address: string) =>
    app.inject({
      method: 'POST',
      url: '/api/demo/reset',
      headers: forwarded(address, 'POST', '/api/demo/reset'),
      payload: {},
    });
  expect((await reset('203.0.113.1')).statusCode).toBe(200);
  expect((await reset('203.0.113.1')).statusCode).toBe(429);
  expect((await reset('203.0.113.2')).statusCode).toBe(200);
});
it('rejects invalid environment limits instead of silently disabling protection', () => {
  expect(() => rateLimitOptions({ RATE_LIMIT_RESETS: '0' })).toThrow();
  expect(() => rateLimitOptions({ RATE_LIMIT_QUOTES: 'NaN' })).toThrow();
});
