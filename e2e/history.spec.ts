import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('client history is scoped, filters statuses and links each accepted quote to its trade', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await page.request.post('/api/demo/reset', { data: {} })).ok()).toBe(true);
  await page.request.post('/api/demo/persona', { data: { userId: 'maple-trader' } });
  await page.goto('/quotes');
  const quotes = page.getByRole('table', { name: 'Quote history' });
  await expect(quotes.getByRole('row')).toHaveCount(7);
  const accepted = quotes.getByRole('row').filter({ hasText: 'NB-Q-000342' });
  await expect(accepted).toContainText('207,892.50 CAD');
  await expect(accepted.getByRole('link', { name: 'View trade' })).toHaveAttribute(
    'href',
    '/trades/NB-T-000128',
  );
  await expect(quotes).not.toContainText('NB-Q-000339');
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/quotes.png', fullPage: true });
  await page.getByRole('button', { name: /^Expired/ }).click();
  await expect(quotes.getByRole('row')).toHaveCount(3);
  await expect(quotes.getByRole('link')).toHaveCount(0);
  await page.getByRole('button', { name: /^Accepted/ }).click();
  await expect(quotes.getByRole('row')).toHaveCount(5);
  await accepted.getByRole('link', { name: 'View trade' }).click();
  await expect(page.getByRole('heading', { name: 'NB-T-000128' })).toBeVisible();
  await page.goto('/trades');
  const trades = page.getByRole('table', { name: 'Trade history' });
  await expect(trades.getByRole('row')).toHaveCount(5);
  await expect(trades.getByText('Action needed')).toHaveCount(1);
  await expect(page.locator('main')).toContainText('1 trade needs your action.');
  await expect(page.locator('main')).not.toContainText(/15:42|closes|send by/i);
  await page.screenshot({ path: 'docs/review/trades.png', fullPage: true });
  await page.getByRole('button', { name: /^In progress/ }).click();
  await expect(trades.getByRole('row')).toHaveCount(3);
  await page.getByRole('button', { name: /^Settled/ }).click();
  await expect(trades.getByRole('row')).toHaveCount(3);
  await expect(trades.getByText('Action needed')).toHaveCount(0);
  await page.getByRole('button', { name: /^Cancelled/ }).click();
  await expect(trades).toContainText('No cancelled trades.');
  await page.getByRole('button', { name: /^Switch persona:/ }).click();
  await page.getByRole('menuitemradio', { name: /Harbourline Treasury/ }).click();
  await expect(page).toHaveURL(/\/trade$/);
  await expect(page.getByRole('button', { name: /^Switch persona: Harbourline/ })).toBeEnabled();
  await page.goto('/trades');
  await expect(trades).toContainText('NB-T-000127');
  await expect(trades).not.toContainText('NB-T-000128');
  expect((await page.request.get('/api/trades/NB-T-000128')).status()).toBe(404);
  expect((await page.request.get('/api/quotes/NB-Q-000342')).status()).toBe(404);
  const privateQuotes = await (await page.request.get('/api/quotes')).json();
  for (const quote of privateQuotes) {
    expect(quote).not.toHaveProperty('marketPrice');
    expect(quote).not.toHaveProperty('spreadBps');
    expect(quote).not.toHaveProperty('route');
  }
  await page.request.post('/api/demo/persona', { data: { userId: 'cedar-admin' } });
  await page.goto('/quotes');
  await expect(quotes).toContainText('No quotes yet.');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('history retries errors with a request id, preserves loaded rows on rate limits and gates visitors', async ({
  page,
}) => {
  await page.request.post('/api/demo/persona', { data: { userId: 'maple-trader' } });
  let state = 'error';
  await page.route('**/api/quotes', (route) =>
    state === 'ok'
      ? route.continue()
      : route.fulfill({
          status: state === 'error' ? 503 : 429,
          json: {
            error: {
              code: state === 'error' ? 'price_unavailable' : 'rate_limited',
              message: 'Temporary test failure.',
              requestId: 'history-check',
            },
          },
        }),
  );
  await page.goto('/quotes');
  await expect(page.locator('main').getByRole('alert')).toContainText('history-check');
  state = 'ok';
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Quote history' })).toContainText('NB-Q-000342');
  state = 'limited';
  await expect(page.getByRole('status')).toContainText('Too many requests', { timeout: 10000 });
  await expect(page.getByRole('table', { name: 'Quote history' })).toContainText('NB-Q-000342');
  await page.request.post('/api/demo/persona', { data: { userId: 'visitor' } });
  await page.goto('/trades');
  await expect(page.getByRole('button', { name: 'Choose persona' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Trade history' })).toHaveCount(0);
});
