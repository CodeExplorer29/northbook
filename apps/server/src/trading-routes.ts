import {
  emptyRequestSchema,
  entityParamsSchema,
  quoteRequestSchema,
  tradeEventRequestSchema,
} from '@northbook/shared';
import type { FastifyInstance } from 'fastify';
import { requireOrganisation, requirePersona } from './auth.js';
import type { Database } from './db/client.js';
import { idempotent } from './idempotency.js';
import { acceptQuote, issueQuote } from './quoting.js';
import { clientQuote } from './trading-views.js';
import { applyTradeEvent } from './settlement.js';
import type { PricingService } from './pricing/service.js';

export function registerTradingRoutes(
  app: FastifyInstance,
  database: Database,
  pricing?: Pick<PricingService, 'freshBooks'>,
) {
  app.post(
    '/api/quotes',
    { config: { access: 'client' } },
    idempotent(
      database,
      async (tx, request) => {
        emptyRequestSchema.parse(request.query);
        const input = quoteRequestSchema.parse(request.body);
        const quote = await issueQuote(
          tx,
          input,
          { userId: requirePersona(request).user.id, organisationId: requireOrganisation(request) },
          { books: pricing?.freshBooks() ?? [] },
        );
        return clientQuote(quote);
      },
      201,
      'quote_issued',
    ),
  );
  app.post(
    '/api/quotes/:id/accept',
    { config: { access: 'client' } },
    idempotent(
      database,
      async (tx, request) => {
        emptyRequestSchema.parse(request.query);
        emptyRequestSchema.parse(request.body ?? {});
        const { id } = entityParamsSchema.parse(request.params);
        return acceptQuote(tx, id, {
          userId: requirePersona(request).user.id,
          organisationId: requireOrganisation(request),
        });
      },
      200,
      'quote_accepted',
    ),
  );
  app.post(
    '/api/staff/trades/:id/events',
    { config: { access: 'staff' } },
    idempotent(
      database,
      async (tx, request) => {
        emptyRequestSchema.parse(request.query);
        const { id } = entityParamsSchema.parse(request.params);
        return applyTradeEvent(
          tx,
          id,
          tradeEventRequestSchema.parse(request.body),
          requirePersona(request).user.id,
        );
      },
      200,
      'trade_transition',
    ),
  );
}
