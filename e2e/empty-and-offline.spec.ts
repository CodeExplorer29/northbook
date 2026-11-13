import { spawn, type ChildProcess } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { expect, test } from '@playwright/test';
import { testDatabase } from '../apps/server/src/test-database.js';
import { createLogger } from '../apps/server/src/logging.js';
import { buildApp } from '../apps/server/src/app.js';
import { seedIdentity } from '../apps/server/src/db/seed.js';
import { seedConfiguration } from '../apps/server/src/db/seed-configuration.js';
import { readSample } from '../apps/server/src/db/sample-data.js';

const origin = 'http://127.0.0.1:3110';
const paths = [
  '/',
  '/trade',
  '/quotes',
  '/trades',
  '/trades/NB-T-000128',
  '/onboarding',
  '/staff/approvals',
  '/staff/blotter',
  '/staff/configuration',
  '/staff/trades/NB-T-000128',
  '/architecture',
];
// This auxiliary instance is test-only, has its own empty database, and uses
// the actual proxy and API. No fault controls are added to the production API.
let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
let web: ChildProcess;
let stopped = false;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  try {
    loadEnvFile('.env');
  } catch {
    /* CI supplies process environment. */
  }
  fixture = await testDatabase();
  const logger = createLogger();
  logger.level = 'silent';
  app = buildApp(fixture.database, logger, {
    sessionSecret: 'empty-screen-fixture-session-secret',
    proxySecret: 'empty-screen-fixture-proxy-secret',
  });
  await app.listen({ host: '127.0.0.1', port: 3111 });
  web = spawn(process.execPath, ['scripts/start-web.mjs'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: '3110',
      SERVER_URL: 'http://127.0.0.1:3111',
      PROXY_SECRET: 'empty-screen-fixture-proxy-secret',
    },
  });
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(origin)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 20000 },
    )
    .toBe(200);
});
test.afterAll(async () => {
  if (web && web.exitCode === null) {
    const closed = new Promise<void>((resolve) => {
      web.once('exit', () => resolve());
    });
    web.kill('SIGTERM');
    await closed;
  }
  if (app && !stopped) await app.close();
  if (fixture) await fixture.close();
});

test('every page explains a genuinely empty database without inventing accounts or prices', async ({
  page,
}) => {
  test.setTimeout(180000);
  for (const path of paths) {
    await page.goto(`${origin}${path}`);
    await expect(page.getByRole('region', { name: 'Demo data', exact: true })).toContainText(
      'No demo accounts are available.',
    );
    await expect(page.locator('main')).toBeVisible();
  }
  await page.goto(origin);
  await page.getByRole('button', { name: /^Switch persona:/ }).click();
  await expect(page.getByRole('menu')).toContainText('shared between viewers');
  await page.keyboard.press('Escape');
  const widget = page.getByRole('region', { name: 'Indicative conversion', exact: true });
  await expect(widget).toContainText('Waiting for price updates');
  await expect(widget.getByLabel('You receive', { exact: true })).toHaveValue('');
});

test('empty domain tables show explanations and missing trade links return to lists', async ({ page }) => {
  await fixture.owner.db.transaction(async (tx) => {
    await seedIdentity(tx);
    await seedConfiguration(tx, await readSample());
  });
  await page.request.post(`${origin}/api/demo/persona`, { data: { userId: 'maple-trader' } });
  for (const [path, message] of [
    ['/quotes', 'No quotes yet.'],
    ['/trades', 'No trades yet.'],
    ['/trade', 'No open trades.'],
    ['/trades/NB-T-000128', 'This trade is no longer available.'],
  ]) {
    await page.goto(`${origin}${path}`);
    await expect(page.locator('main')).toContainText(message!);
  }
  await expect(page.getByRole('link', { name: 'View trades', exact: true })).toHaveAttribute(
    'href',
    '/trades',
  );
  await page.request.post(`${origin}/api/demo/persona`, { data: { userId: 'cedar-admin' } });
  await page.goto(`${origin}/onboarding`);
  await expect(page.getByLabel('Registration number', { exact: true })).toHaveValue('');
  await page.request.post(`${origin}/api/demo/persona`, { data: { userId: 'staff' } });
  await page.goto(`${origin}/staff/approvals`);
  await page.getByRole('button', { name: /^Needs review/ }).click();
  await expect(page.locator('main')).toContainText('No applications need review.');
  await page.goto(`${origin}/staff/blotter`);
  await expect(page.getByRole('table')).toContainText('No trades');
  await page.goto(`${origin}/staff/trades/NB-T-000128`);
  await expect(page.locator('main')).toContainText('This trade is no longer available.');
  await expect(page.getByRole('link', { name: 'View trades', exact: true })).toHaveAttribute(
    'href',
    '/staff/blotter',
  );
});

test('each page remains readable with the real API stopped and offers a referenced retry', async ({
  page,
}) => {
  test.setTimeout(180000);
  await app.close();
  stopped = true;
  for (const path of paths) {
    await page.goto(`${origin}${path}`);
    const failure = page.getByRole('region', { name: 'Connection status', exact: true });
    await expect(failure.getByRole('alert')).toContainText('Reference:');
    await expect(failure.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
    await expect(page.locator('main')).toBeVisible();
  }
  await page.goto(origin);
  await expect(page.getByRole('region', { name: 'Indicative conversion', exact: true })).toContainText(
    'Waiting for price updates',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({
    path: 'docs/review/home-offline-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
