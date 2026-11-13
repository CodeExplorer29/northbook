import { buildApp } from './app.js';
import { createDatabase } from './db/client.js';
import { resetWithOwner } from './db/reset.js';
import { seedIfEmpty } from './db/seed.js';
import { PricingService, pricingMode } from './pricing/service.js';
import { createLogger } from './logging.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required for seed-if-empty startup.');
const owner = createDatabase(adminUrl);
try {
  await seedIfEmpty(owner);
} finally {
  await owner.pool.end();
}
const database = createDatabase(databaseUrl);
const logger = createLogger();
const pricing = new PricingService(database, pricingMode(process.env.PRICING_MODE), undefined, logger);
// Data persists. The reset route exists only when explicitly enabled, as the browser tests do.
const app = buildApp(database, logger, {
  pricing,
  ...(process.env.DEMO_RESET === 'enabled'
    ? {
        reset: async () => {
          await resetWithOwner(adminUrl)();
          await pricing.refreshAfterReset();
        },
      }
    : {}),
});

try {
  await pricing.start();
  await app.listen({
    port: Number(process.env.PORT ?? '3001'),
    host: process.env.SERVER_HOST ?? '127.0.0.1',
  });
} catch (error) {
  app.log.error({ err: error }, 'Server failed to start');
  await app.close();
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
