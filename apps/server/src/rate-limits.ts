import { createHash } from 'node:crypto';
import { trustedClientAddress } from '@northbook/shared/proxy-auth';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Database } from './db/client.js';
import { AppError } from './errors.js';

export interface RateLimitOptions {
  publicPerMinute: number;
  quotesPerMinute: number;
  organisationPerMinute: number;
  resetsPerFiveMinutes: number;
}
export const defaultRateLimits: RateLimitOptions = {
  publicPerMinute: 120,
  quotesPerMinute: 30,
  organisationPerMinute: 30,
  resetsPerFiveMinutes: 3,
};
export function rateLimitOptions(env: NodeJS.ProcessEnv): RateLimitOptions {
  const names = {
    publicPerMinute: 'RATE_LIMIT_PUBLIC',
    quotesPerMinute: 'RATE_LIMIT_QUOTES',
    organisationPerMinute: 'RATE_LIMIT_ORGANISATION',
    resetsPerFiveMinutes: 'RATE_LIMIT_RESETS',
  } as const;
  return Object.fromEntries(
    Object.entries(names).map(([key, name]) => {
      const value =
        env[name] === undefined ? defaultRateLimits[key as keyof RateLimitOptions] : Number(env[name]);
      if (!Number.isSafeInteger(value) || value < 1 || value > 10000)
        throw new Error(`${name} must be an integer from 1 to 10000.`);
      return [key, value];
    }),
  ) as unknown as RateLimitOptions;
}
export function registerRateLimits(
  app: FastifyInstance,
  database: Database,
  options: RateLimitOptions,
  secret?: string,
) {
  app.addHook('onRequest', async (request, reply) => {
    const route = request.routeOptions.url;
    const category = route?.startsWith('/api/public/prices/')
      ? 'price'
      : route === '/api/quotes' && request.method === 'POST'
        ? 'quote'
        : route === '/api/demo/reset' && request.method === 'POST'
          ? 'reset'
          : null;
    if (!category) return;
    const source = trustedClientAddress(
      request.raw.socket.remoteAddress,
      typeof request.headers['x-forwarded-for'] === 'string' ? request.headers['x-forwarded-for'] : undefined,
      typeof request.headers['x-northbook-proxy'] === 'string'
        ? request.headers['x-northbook-proxy']
        : undefined,
      secret,
      request.method,
      request.raw.url ?? request.url,
    );
    const sourceHash = createHash('sha256').update(source).digest('hex');
    const buckets = [
      {
        key: `${category}:source:${sourceHash}`,
        limit:
          category === 'price'
            ? options.publicPerMinute
            : category === 'quote'
              ? options.quotesPerMinute
              : options.resetsPerFiveMinutes,
        window: category === 'reset' ? 300000 : 60000,
      },
    ];
    if (category === 'quote' && request.persona?.organisation)
      buckets.push({
        key: `quote:organisation:${request.persona.organisation.id}`,
        limit: options.organisationPerMinute,
        window: 60000,
      });
    const retry = await database.db.transaction(async (tx) => {
      // Bounded opportunistic cleanup; no third background timer, no raw IP storage.
      await tx.execute(
        sql`DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at <= now() ORDER BY expires_at LIMIT 100)`,
      );
      let wait = 0;
      for (const bucket of buckets.sort((left, right) => left.key.localeCompare(right.key))) {
        const result = await tx.execute<{ count: number; retry: number }>(sql`
          INSERT INTO rate_limits (key, count, expires_at) VALUES (${bucket.key}, 1, now() + ${bucket.window} * interval '1 millisecond')
          ON CONFLICT (key) DO UPDATE SET
            count = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE least(rate_limits.count + 1, ${bucket.limit + 1}) END,
            expires_at = CASE WHEN rate_limits.expires_at <= now() THEN now() + ${bucket.window} * interval '1 millisecond' ELSE rate_limits.expires_at END
          RETURNING count, greatest(1, ceil(extract(epoch FROM expires_at - now())))::int AS retry`);
        const row = result.rows[0]!;
        if (row.count > bucket.limit) wait = Math.max(wait, row.retry);
      }
      return wait;
    });
    if (retry) {
      reply.header('retry-after', String(retry));
      throw new AppError('rate_limited', `Too many requests. Try again in ${retry} seconds.`);
    }
  });
}
