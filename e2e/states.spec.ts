import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('feedback patterns keep context, retry once and respect the rate-limit deadline', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-13T18:00:00Z') });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/states');
  const loading = page.getByRole('region', { name: 'Loading pattern', exact: true });
  await expect(loading.getByRole('columnheader')).toHaveCount(4);
  await expect(loading.locator('tbody')).toHaveAttribute('aria-busy', 'true');
  await expect(loading.locator('tbody tr')).toHaveCount(5);
  await expect(loading.locator('tbody td').first()).toHaveCSS('height', '56px');
  const empty = page.getByRole('region', { name: 'Empty pattern', exact: true });
  await expect(empty).toContainText('No quotes yet.');
  await expect(empty.getByRole('link', { name: 'Go to Trade' })).toHaveAttribute('href', '/trade');
  const error = page.getByRole('region', { name: 'Error pattern', exact: true });
  await expect(error.getByRole('alert')).toContainText('req_8f2c41');
  const limited = page.getByRole('region', { name: 'Rate-limit pattern', exact: true });
  const retry = limited.getByRole('button');
  await expect(retry).toBeDisabled();
  await expect(limited.getByRole('status')).toContainText('Too many requests.');
  await expect(limited.getByRole('table')).toContainText('250,000.000000');
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/states.png', fullPage: true });

  let attempts = 0;
  let release: (() => void) | undefined;
  await page.route('**/api/test/echo?pattern=error', async (route) => {
    attempts++;
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'internal_error',
            message: 'Service temporarily unavailable.',
            requestId: 'req_retry_2',
          },
        },
      });
    } else {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ status: 200, json: { ok: true } });
    }
  });
  await error.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(error.getByRole('alert')).toContainText(
    'Service temporarily unavailable. Reference: req_retry_2',
  );
  await error.getByRole('button', { name: 'Try again', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(error.getByRole('button', { name: 'Retrying…' })).toBeDisabled();
  await expect.poll(() => attempts).toBe(2);
  release!();
  await expect(error.getByRole('status')).toHaveText('Connection restored.');
  expect(attempts).toBe(2);

  await page.clock.runFor(6000);
  await expect(retry).toBeEnabled();
  let refreshes = 0;
  await page.route('**/api/test/echo?pattern=rate', async (route) => {
    refreshes++;
    await route.fulfill({ json: { ok: true } });
  });
  await retry.click();
  await expect(limited.getByRole('status')).toHaveText('Quotes refreshed.');
  await expect(limited.getByRole('table')).toContainText('250,000.000000');
  expect(refreshes).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
