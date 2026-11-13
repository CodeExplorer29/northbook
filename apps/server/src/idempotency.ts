import { createHash } from 'node:crypto';
import { errorHttpStatus } from '@northbook/shared';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { requirePersona } from './auth.js';
import type { Database, Transaction } from './db/client.js';
import { idempotencyKeys } from './db/schema.js';
import { AppError, publicError } from './errors.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function idempotent(
  database: Database,
  operation: (tx: Transaction, request: FastifyRequest) => Promise<unknown>,
  statusCode = 200,
  event?: string,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const persona = requirePersona(request);
    const key = request.headers['idempotency-key'];
    if (!key) throw new AppError('idempotency_key_required', 'An Idempotency-Key header is required.');
    if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(key))
      throw new AppError('validation_failed', 'Invalid idempotency key.');
    const scope =
      persona.user.role === 'staff' ? `staff:${persona.user.id}` : `organisation:${persona.organisation!.id}`;
    const endpoint = `${request.method} ${request.url.split('?')[0]}`;
    const requestHash = createHash('sha256')
      .update(canonical({ body: request.body, query: request.query }))
      .digest('hex');
    const identity = and(
      eq(idempotencyKeys.scope, scope),
      eq(idempotencyKeys.endpoint, endpoint),
      eq(idempotencyKeys.key, key),
    );
    await database.db.delete(idempotencyKeys).where(and(identity, lt(idempotencyKeys.expiresAt, sql`now()`)));
    const [claim] = await database.db
      .insert(idempotencyKeys)
      .values({ scope, endpoint, key, requestHash })
      .onConflictDoNothing()
      .returning();
    if (!claim) {
      const [stored] = await database.db.select().from(idempotencyKeys).where(identity);
      if (!stored || (stored.state === 'pending' && stored.requestHash === requestHash)) {
        reply.header('retry-after', '1');
        throw new AppError(
          'idempotency_in_progress',
          'The original request is still running. Retry shortly.',
        );
      }
      if (stored.requestHash !== requestHash)
        throw new AppError('idempotency_conflict', 'This key was already used with different content.');
      if (stored.failure) throw new AppError(stored.failure.code, stored.failure.message);
      return reply.code(stored.statusCode!).send(stored.response);
    }
    const reservation = and(
      identity,
      eq(idempotencyKeys.reservation, claim.reservation),
      eq(idempotencyKeys.state, 'pending'),
    );
    try {
      const response = await database.db.transaction(async (tx) => {
        const body: unknown = JSON.parse(JSON.stringify(await operation(tx, request)));
        const saved = await tx
          .update(idempotencyKeys)
          .set({ state: 'completed', statusCode, response: body })
          .where(reservation)
          .returning();
        if (saved.length !== 1) throw new AppError('internal_error', 'The request reservation was lost.');
        return body;
      });
      if (event && response && typeof response === 'object') {
        const body = response as Record<string, unknown>;
        request.log.info(
          {
            event,
            entityId: body.id,
            quoteId: body.quoteId,
            baseAmount: body.baseAmount,
            quoteAmount: body.quoteAmount,
          },
          'Domain transaction committed',
        );
      }
      return reply.code(statusCode).send(response);
    } catch (error) {
      // Business effects rolled back. Replay failures with a request-local trace id.
      // The predicate prevents overwriting a committed success after a lost ACK.
      const failure = publicError(error);
      await database.db
        .update(idempotencyKeys)
        .set({
          state: 'completed',
          statusCode: errorHttpStatus[failure.code],
          failure: { code: failure.code, message: failure.message },
        })
        .where(reservation);
      throw error;
    }
  };
}
