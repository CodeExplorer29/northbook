import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('data components preserve exact values, support keyboard selection and show all timeline states', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/components');
  const main = page.getByRole('main');
  await expect(main.getByText('Indicative', { exact: true })).toHaveCSS('border-style', 'dashed');
  await expect(main.getByText('Cancelled', { exact: true }).first()).toHaveCSS('color', 'rgb(192, 57, 43)');
  const copy = page.getByRole('button', { name: 'Copy amount', exact: true });
  await copy.click();
  await expect(copy).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('50.00000000');
  await expect(copy).toHaveText('Copy');
  await page.getByRole('button', { name: 'Copy deposit address', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('0x7A3f…SAMPLE…9c1E');
  const timeline = page.getByRole('list', { name: 'Timeline', exact: true });
  await expect(timeline.getByRole('listitem')).toHaveCount(4);
  await expect(timeline.locator('[aria-current="step"]')).toContainText('Payout sent');
  await expect(timeline).toContainText('Completed');
  await expect(timeline).toContainText('Upcoming');
  await expect(timeline.getByText('Simulated', { exact: true })).toHaveCount(1);
  await expect(timeline.locator('time').first()).toHaveText('14:42:07');
  await expect(timeline.locator('time').first()).toHaveAttribute('datetime', '2026-11-12T14:42:07Z');
  await expect(page.getByRole('list', { name: 'Cancelled trade timeline' })).toContainText('Cancelled');
  const client = page.getByRole('table', { name: 'Client trades', exact: true });
  const staff = page.getByRole('table', { name: 'Staff trades', exact: true });
  await expect(client.locator('tbody tr')).toHaveCount(2);
  await expect(client.locator('tbody td').first()).toHaveCSS('height', '56px');
  await expect(staff.locator('tbody td').first()).toHaveCSS('height', '40px');
  await expect(client.getByRole('cell', { name: '207,892.50', exact: true })).toHaveCSS(
    'text-align',
    'right',
  );
  await expect(client.getByRole('cell', { name: '207,892.50', exact: true })).toHaveCSS(
    'font-variant-numeric',
    'tabular-nums',
  );
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/components.png', fullPage: true });
  const filters = page.getByRole('group', { name: 'Trade status' });
  await filters.getByRole('button', { name: /In progress/ }).click();
  await expect(client.locator('tbody tr')).toHaveCount(1);
  await expect(client).toContainText('NB-T-000128');
  await filters.getByRole('button', { name: /Cancelled/ }).click();
  await expect(client).toContainText('Nothing matches these filters.');
  await expect(filters.getByRole('button', { name: /Cancelled/ })).toHaveAttribute('aria-pressed', 'true');
  const trades = page.getByRole('tab', { name: /Trades/ });
  const quotes = page.getByRole('tab', { name: /Quotes/ });
  await trades.focus();
  await page.keyboard.press('ArrowRight');
  await expect(quotes).toBeFocused();
  await expect(quotes).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.getByRole('tabpanel')).toContainText('Nothing matches these filters.');
  await page.keyboard.press('Home');
  await expect(trades).toBeFocused();
  await expect(trades).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => {
        throw new Error('Permission denied');
      },
    });
  });
  await copy.click();
  await expect(main.getByRole('status').filter({ hasText: 'Could not copy' })).toBeVisible();
  await expect(copy).toHaveText('Copy');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
