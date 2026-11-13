import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --env-file-if-exists=.env --import tsx scripts/e2e-server.ts',
      env: {
        PORT: '3101',
        LOG_LEVEL: 'error',
        PROXY_SECRET: 'northbook-e2e-proxy-secret-for-local-tests',
        RATE_LIMIT_RESETS: '1000',
      },
      url: 'http://127.0.0.1:3101/api/test/echo',
      reuseExistingServer: false,
    },
    {
      command:
        process.env.E2E_PRODUCTION === '1'
          ? 'node scripts/start-web.mjs'
          : 'pnpm --filter @northbook/web dev --webpack --port 3100',
      env: {
        PROXY_SECRET: 'northbook-e2e-proxy-secret-for-local-tests',
        PORT: '3100',
        SERVER_URL: 'http://127.0.0.1:3101',
        WATCHPACK_POLLING: 'true',
      },
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: false,
    },
  ],
});
