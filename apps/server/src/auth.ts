import { createHmac, timingSafeEqual } from 'node:crypto';
import { personaRequestSchema, type Session } from '@northbook/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from './db/client.js';
import { organisations, users } from './db/schema.js';
import { AppError } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    persona: Session | null;
  }
  interface FastifyContextConfig {
    access?: 'public' | 'client' | 'staff';
  }
}

const cookieName = 'northbook_session';
const sessionLifetime = 24 * 60 * 60;
const signature = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

function sessionUser(cookie: string | undefined, secret: string): string | undefined {
  const values = cookie
    ?.split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${cookieName}=`));
  if (values?.length !== 1) return;
  const match = /^northbook_session=([a-z-]+):(\d{10}):([A-Za-z0-9_-]{43})$/.exec(values[0]!);
  if (!match) return;
  const [, id, expires, signed] = match;
  const expected = signature(`${id}:${expires}`, secret);
  if (!timingSafeEqual(Buffer.from(signed!), Buffer.from(expected)) || Number(expires) <= Date.now() / 1000)
    return;
  return id;
}

function sessionCookie(value: string, maxAge: number) {
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function requirePersona(request: FastifyRequest): Session {
  if (!request.persona) throw new AppError('not_authenticated', 'Choose a demo persona.');
  return request.persona;
}

export function requireOrganisation(request: FastifyRequest): string {
  const persona = requirePersona(request);
  if (persona.user.role !== 'client' || !persona.organisation)
    throw new AppError('forbidden', 'A client persona is required.');
  return persona.organisation.id;
}

export function registerAuth(app: FastifyInstance, database: Database, secret: string) {
  if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  app.decorateRequest('persona', null);
  app.addHook('onRequest', async (request) => {
    const userId = sessionUser(request.headers.cookie, secret);
    if (userId) {
      const [record] = await database.db
        .select({ user: users, organisation: organisations })
        .from(users)
        .leftJoin(organisations, eq(users.organisationId, organisations.id))
        .where(eq(users.id, userId));
      request.persona = record ?? null;
    }
    const route = request.routeOptions.url;
    if (!route) return; // The framework 404 remains not_found for unknown paths.
    const access = route.startsWith('/api/staff/') ? 'staff' : request.routeOptions.config.access;
    if (access === 'public') return;
    const persona = requirePersona(request);
    if (access && persona.user.role !== access)
      throw new AppError('forbidden', 'This persona cannot access this resource.');
  });

  app.post('/api/demo/persona', { config: { access: 'public' } }, async (request, reply) => {
    const { userId } = personaRequestSchema.parse(request.body);
    if (userId === 'visitor') {
      reply.header('set-cookie', sessionCookie('', 0));
      return { user: null, organisation: null };
    }
    const [record] = await database.db
      .select({ user: users, organisation: organisations })
      .from(users)
      .leftJoin(organisations, eq(users.organisationId, organisations.id))
      .where(eq(users.id, userId));
    if (!record) throw new AppError('not_found', 'Demo persona not found.');
    const payload = `${userId}:${Math.floor(Date.now() / 1000) + sessionLifetime}`;
    reply.header('set-cookie', sessionCookie(`${payload}:${signature(payload, secret)}`, sessionLifetime));
    return record;
  });
  app.get(
    '/api/me',
    { config: { access: 'public' } },
    async (request) => request.persona ?? { user: null, organisation: null },
  );
  app.get('/api/demo/status', { config: { access: 'public' } }, async () => ({
    personas: await database.db
      .select({ user: users, organisation: organisations })
      .from(users)
      .leftJoin(organisations, eq(users.organisationId, organisations.id)),
    sharedNotice: 'Demo data is shared between viewers.',
  }));
}
