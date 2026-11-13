import { randomUUID } from 'node:crypto';
import Fastify, { LogController, type FastifyBaseLogger } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Database } from './db/client.js';
import { AppError, publicError, sendError } from './errors.js';
import { createLogger } from './logging.js';
import { registerStreamTest } from './stream-test.js';
import { registerAuth } from './auth.js';
import { registerTradingViews } from './trading-views.js';
import { registerTradingRoutes } from './trading-routes.js';
import { registerLedgerViews } from './ledger-views.js';
import type { PricingService } from './pricing/service.js';
import { registerVenueRoutes } from './pricing/venue-routes.js';
import { registerPublicPrices } from './public-prices.js';
import { registerDemoReset } from './demo-reset.js';
import { registerKybRoutes } from './kyb-routes.js';
import { registerConfiguration } from './configuration.js';
import { registerRateLimits, rateLimitOptions, type RateLimitOptions } from './rate-limits.js';
import { readBlotter } from './blotter.js';
import { registerDesk } from './desk.js';

export function buildApp(
  database: Database,
  logger: FastifyBaseLogger = createLogger(),
  options: {
    proxySecret?: string;
    rateLimits?: RateLimitOptions;
    reset?: () => Promise<void>;
    sessionSecret?: string;
    pricing?: Pick<PricingService, 'mode' | 'freshBooks' | 'health' | 'stop' | 'refreshConfiguration'>;
  } = {},
) {
  const app = Fastify({
    loggerInstance: logger,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    requestIdHeader: false,
    genReqId(request) {
      const forwardedId = request.headers['x-request-id'];
      return typeof forwardedId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(forwardedId)
        ? forwardedId
        : randomUUID();
    },
  });

  app.addHook('onClose', async () => {
    await options.pricing?.stop();
    await database.pool.end();
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.setNotFoundHandler((request, reply) =>
    sendError(new AppError('not_found', 'Resource not found.'), request, reply),
  );
  app.setErrorHandler((error, request, reply) => {
    const failure = publicError(error);
    if (failure.code === 'internal_error') request.log.error({ err: error }, 'Unexpected request failure');
    return sendError(failure, request, reply);
  });
  registerAuth(app, database, options.sessionSecret ?? process.env.SESSION_SECRET ?? '');
  registerRateLimits(
    app,
    database,
    options.rateLimits ?? rateLimitOptions(process.env),
    options.proxySecret ?? process.env.PROXY_SECRET,
  );
  app.get('/api/healthz', { config: { access: 'public' } }, async (_request, reply) => {
    try {
      await database.db.execute(sql`SELECT 1`);
      return {
        status: 'ok',
        database: 'reachable',
        ...(options.pricing
          ? {
              pricingMode: options.pricing.mode,
              venues: options.pricing
                .health()
                .map(({ id, status, lastUpdate, replayed }) => ({ id, status, lastUpdate, replayed })),
            }
          : {}),
      };
    } catch {
      return reply.code(503).send({ status: 'unavailable', database: 'unreachable' });
    }
  });

  if (options.reset) registerDemoReset(app, options.reset);
  registerStreamTest(app);
  registerPublicPrices(app, database, options.pricing);
  registerDesk(app, database, options.pricing);
  registerKybRoutes(app, database);
  registerTradingViews(app, database);
  app.get('/api/staff/blotter', { config: { access: 'staff' } }, () => readBlotter(database));
  registerTradingRoutes(app, database, options.pricing);
  registerLedgerViews(app, database);
  registerVenueRoutes(app, database, options.pricing);
  registerConfiguration(app, database, options.pricing);
  return app;
}
