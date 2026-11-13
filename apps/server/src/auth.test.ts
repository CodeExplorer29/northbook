import { afterAll, beforeAll, expect, it } from 'vitest';
import { demoStatusSchema } from '@northbook/shared';
import { buildApp } from './app.js';
import { seedIdentity } from './db/seed.js';
import { quotes, trades } from './db/schema.js';
import { createLogger } from './logging.js';
import { testDatabase } from './test-database.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
let quoteId: string;
let tradeId: string;
const cookies: Record<string, string> = {};
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
  app = buildApp(fixture.database, createLogger({ write() {} }));
  app.get('/api/default-private', async () => ({ ok: true }));
  const [quote] = await fixture.database.db
    .insert(quotes)
    .values({
      organisationId: 'maple',
      userId: 'maple-trader',
      pair: 'ETH/CAD',
      side: 'SELL',
      fixed: 'base',
      requestedAmount: '50',
      baseAmount: '50',
      quoteAmount: '207892.32',
      clientPrice: '4157.8464',
      marketPrice: '4172.45',
      spreadBps: '35',
      route: { venue: 'fixture' },
      expiresAt: new Date(Date.now() + 60000),
    })
    .returning();
  quoteId = quote!.id;
  const [trade] = await fixture.database.db
    .insert(trades)
    .values({
      quoteId,
      organisationId: 'maple',
      pair: 'ETH/CAD',
      side: 'SELL',
      baseAmount: '50',
      quoteAmount: '207892.32',
      clientPrice: '4157.8464',
    })
    .returning();
  tradeId = trade!.id;
  for (const userId of ['maple-trader', 'harbourline-trader', 'staff']) {
    const response = await app.inject({ method: 'POST', url: '/api/demo/persona', payload: { userId } });
    expect(response.statusCode).toBe(200);
    const header = response.headers['set-cookie'] as string;
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    cookies[userId] = header.split(';')[0]!;
  }
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});

it('requires a persona on every protected route by default', async () => {
  for (const url of ['/api/quotes', '/api/trades', '/api/staff/quotes', '/api/default-private']) {
    const response = await app.inject(url);
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('not_authenticated');
  }
});

it('publishes seeded persona names and current verification', async () => {
  const response = await app.inject('/api/demo/status');
  expect(response.statusCode).toBe(200);
  const status = demoStatusSchema.parse(response.json());
  expect(status.personas).toHaveLength(4);
  expect(status.personas.find((entry) => entry.user.id === 'maple-trader')?.organisation?.kybState).toBe(
    'approved',
  );
  expect(status.personas.find((entry) => entry.user.id === 'cedar-admin')?.organisation?.kybState).toBe(
    'draft',
  );
  expect(status.sharedNotice).toContain('shared between viewers');
});

it('refuses staff routes to clients and returns not_found for another organisation', async () => {
  const denied = await app.inject({
    url: '/api/staff/trades',
    headers: { cookie: cookies['maple-trader']! },
  });
  expect(denied.statusCode).toBe(403);
  expect(denied.json().error.code).toBe('forbidden');
  for (const url of [`/api/quotes/${quoteId}`, `/api/trades/${tradeId}`]) {
    const own = await app.inject({ url, headers: { cookie: cookies['maple-trader']! } });
    expect(own.statusCode).toBe(200);
    const other = await app.inject({ url, headers: { cookie: cookies['harbourline-trader']! } });
    expect(other.statusCode).toBe(404);
    expect(other.json().error.code).toBe('not_found');
  }
  const list = await app.inject({ url: '/api/quotes', headers: { cookie: cookies['harbourline-trader']! } });
  expect(list.json()).toEqual([]);
  const staff = await app.inject({ url: '/api/staff/trades', headers: { cookie: cookies.staff! } });
  expect(staff.json()).toHaveLength(1);
});

it('does not expose market price, route or spread in client quote responses', async () => {
  const response = await app.inject({
    url: `/api/quotes/${quoteId}`,
    headers: { cookie: cookies['maple-trader']! },
  });
  expect(response.json()).not.toHaveProperty('route');
  expect(response.json()).not.toHaveProperty('marketPrice');
  expect(response.json()).not.toHaveProperty('spreadBps');
});

it('rejects tampered cookies and clears the cookie when leaving a persona', async () => {
  const response = await app.inject({
    url: '/api/trades',
    headers: { cookie: cookies['maple-trader']!.replace('maple-trader', 'staff') },
  });
  expect(response.statusCode).toBe(401);
  const logout = await app.inject({
    method: 'POST',
    url: '/api/demo/persona',
    payload: { userId: 'visitor' },
  });
  expect(logout.headers['set-cookie']).toContain('Max-Age=0');
  expect(logout.json()).toEqual({ user: null, organisation: null });
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/demo/persona',
    payload: { userId: 'maple-trader', role: 'staff' },
  });
  expect(invalid.statusCode).toBe(400);
});
