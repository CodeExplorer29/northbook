import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('staff blotter filters both tabs, explains every next step and exposes quote pricing and route', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  expect((await page.request.post('/api/demo/reset', { data: {} })).ok()).toBe(true);
  await page.request.post('/api/demo/persona', { data: { userId: 'staff' } });
  await page.goto('/staff/blotter');
  await page.getByLabel('Date range').selectOption('all');
  const trades = page.getByRole('table', { name: 'Staff trades', exact: true });
  await expect(trades.getByRole('row')).toHaveCount(8);
  for (const [id, next] of [
    ['128', 'Confirm client funds'],
    ['127', 'Send payout'],
    ['126', 'Confirm payout'],
    ['125', '—'],
    ['123', '—'],
  ]) {
    await expect(
      trades
        .getByRole('row')
        .filter({ hasText: `NB-T-000${id}` })
        .getByRole('cell')
        .last(),
    ).toHaveText(next!);
  }
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/blotter.png', fullPage: true });
  await page.getByLabel('Organisation', { exact: true }).selectOption('harbourline');
  await expect(trades.getByRole('row')).toHaveCount(4);
  await page.getByLabel('Pair', { exact: true }).selectOption('ETH/CAD');
  await expect(trades).toContainText('Nothing matches these filters.');
  await page.getByLabel('Organisation', { exact: true }).selectOption('all');
  await page.getByLabel('Pair', { exact: true }).selectOption('all');
  await page.getByLabel('Status', { exact: true }).selectOption('funds_received');
  await expect(trades.getByRole('row')).toHaveCount(2);
  await page.getByRole('tab', { name: /Quotes/ }).click();
  const quotes = page.getByRole('table', { name: 'Staff quotes', exact: true });
  await expect(quotes.getByRole('row')).toHaveCount(10);
  const quote = quotes.getByRole('row').filter({ hasText: 'NB-Q-000342' });
  await expect(quote).toContainText('4,172.45');
  await expect(quote).toContainText('4,157.85');
  await expect(quote.getByRole('cell').nth(7)).toHaveText('35');
  await page.getByRole('button', { name: 'NB-Q-000342', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Quote route' })).toContainText('kraken');
  await expect(page.getByRole('table', { name: 'Quote route' })).toContainText('binance');
  await page.screenshot({ path: 'docs/review/blotter-quotes.png', fullPage: true });
  await page.getByLabel('Status', { exact: true }).selectOption('expired');
  await expect(quotes.getByRole('row')).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.request.post('/api/demo/persona', { data: { userId: 'maple-trader' } });
  await page.goto('/staff/blotter');
  await expect(page.getByRole('button', { name: 'Choose persona', exact: true })).toBeVisible();
  expect((await page.request.get('/api/staff/blotter')).status()).toBe(403);
});
