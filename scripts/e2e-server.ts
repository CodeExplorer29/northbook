import { buildApp } from '../apps/server/src/app.js';
import { resetDemo } from '../apps/server/src/db/reset.js';
import { seedIfEmpty } from '../apps/server/src/db/seed.js';
import { testDatabase } from '../apps/server/src/test-database.js';
import { spawn } from 'node:child_process';
import { PricingService } from '../apps/server/src/pricing/service.js';

const fixture = await testDatabase();
if (process.env.E2E_PRODUCTION === '1') {
  // Exercise the compiled entrypoint and its owner-only seed-if-empty startup.
  const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SERVER_HOST: '127.0.0.1',
      PRICING_MODE: 'replay',
      DEMO_RESET: 'enabled',
      DATABASE_URL: fixture.database.pool.options.connectionString!,
      DATABASE_ADMIN_URL: fixture.owner.pool.options.connectionString!,
    },
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      server.kill(signal);
    });
  server.once('exit', (code) => {
    void fixture.close().then(() => {
      process.exitCode = code ?? 0;
    });
  });
} else {
  await seedIfEmpty(fixture.owner);
  const pricing = new PricingService(fixture.database, 'replay');
  await pricing.start();
  const app = buildApp(fixture.database, undefined, {
    pricing,
    reset: async () => {
      await resetDemo(fixture.owner);
      await pricing.refreshAfterReset();
    },
  });
  await app.listen({ port: Number(process.env.PORT ?? '3101'), host: '127.0.0.1' });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().then(() => fixture.close());
    });
  }
}
