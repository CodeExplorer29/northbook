import { mkdir } from 'node:fs/promises';
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { readyStaff } from './trading-helpers.js';
import { quoteResponseSchema } from '../packages/shared/src/index.js';

async function openTrade(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/trade');
  await page.getByRole('button', { name: /^Switch persona:/ }).click();
  await page.getByRole('menuitemradio', { name: /Maple Ridge Payments/ }).click();
  await expect(page.getByRole('button', { name: 'Get quote', exact: true })).toBeEnabled();
}
async function issue(page: Page, request: APIRequestContext) {
  await readyStaff(request, true);
  const response = page.waitForResponse(
    (result) => new URL(result.url()).pathname === '/api/quotes' && result.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Get quote', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(201);
  return quoteResponseSchema.parse(await result.json());
}

test('Trade collapses input, guards acceptance and refreshes quotes and action-needed trades', async ({
  page,
  request,
}) => {
  await openTrade(page);
  const quote = await issue(page, request);
  const card = page.getByRole('region', { name: 'Firm quote', exact: true });
  await expect(page.getByLabel('You pay', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Sell 50 ETH for CAD', { exact: true })).toBeVisible();
  await expect(card).toHaveAttribute('data-state', 'active');
  let requests = 0;
  let release: (() => void) | undefined;
  const keys: string[] = [];
  await page.route(`**/api/quotes/${quote.id}/accept`, async (route) => {
    requests++;
    keys.push(route.request().headers()['idempotency-key']!);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.continue();
  });
  await card.getByRole('button', { name: 'Accept quote', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(card.getByRole('button', { name: 'Accepting…' })).toBeDisabled();
  await expect.poll(() => requests).toBe(1);
  release!();
  await expect(card.getByRole('link', { name: 'View trade' })).toBeVisible();
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  const href = await card.getByRole('link', { name: 'View trade' }).getAttribute('href');
  const open = page.getByRole('complementary', { name: 'Trading activity' }).locator(`a[href="${href}"]`);
  await expect(open).toContainText('Action needed · Send 50 ETH');
  await expect(open).not.toContainText(/send by|funding window|closes/i);
  await expect(page.getByRole('table', { name: 'Recent quotes', exact: true })).toContainText('Accepted');
  expect(requests).toBe(1);
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/trade-accepted.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'docs/review/trade-mobile.png', fullPage: true });
});

test('Trade expires, requests a new quote with a fresh key, and displays a real late-acceptance response', async ({
  page,
  request,
}) => {
  test.setTimeout(65000);
  await openTrade(page);
  const keys: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/quotes' && request.method() === 'POST')
      keys.push(request.headers()['idempotency-key']!);
  });
  const first = await issue(page, request);
  const card = page.getByRole('region', { name: 'Firm quote', exact: true });
  await expect(card.getByRole('button', { name: 'Request new quote' })).toBeVisible({ timeout: 17000 });
  await expect(card).toContainText('This quote has expired. No trade was made.');
  await expect(page.getByRole('table', { name: 'Recent quotes', exact: true })).toContainText('Expired');
  await readyStaff(request, true);
  const next = page.waitForResponse(
    (result) => new URL(result.url()).pathname === '/api/quotes' && result.request().method() === 'POST',
  );
  await card.getByRole('button', { name: 'Request new quote' }).click();
  const response = await next;
  expect(response.status()).toBe(201);
  const second = quoteResponseSchema.parse(await response.json());
  expect(second.id).not.toBe(first.id);
  expect(keys).toHaveLength(2);
  expect(keys[1]).not.toBe(keys[0]);
  await expect(card.getByRole('button', { name: 'Accept quote', exact: true })).toBeEnabled();
  // Hold the actual HTTP acceptance until server expiry. The browser remains in
  // its accepting state while the real domain handler produces quote_expired.
  await page.route(`**/api/quotes/${second.id}/accept`, async (route) => {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, Date.parse(second.expiresAt) - Date.now()) + 100),
    );
    await route.continue();
  });
  const accepted = page.waitForResponse((result) =>
    new URL(result.url()).pathname.endsWith(`/${second.id}/accept`),
  );
  await card.getByRole('button', { name: 'Accept quote', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Accepting…' })).toBeDisabled();
  expect((await accepted).status()).toBe(410);
  await expect(card).toContainText(
    'This quote expired before we received your acceptance. No trade was made.',
  );
  const trades = await page.evaluate(async () => (await fetch('/api/trades')).json());
  expect(trades.some((trade: { quoteId: string }) => trade.quoteId === second.id)).toBe(false);
});

test('retry after a lost quote response reuses its key and returns the one stored quote', async ({
  page,
  request,
}) => {
  await openTrade(page);
  let calls = 0;
  const keys: string[] = [];
  let storedId = '';
  await page.route('**/api/quotes', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    calls++;
    keys.push(route.request().headers()['idempotency-key']!);
    const response = await route.fetch();
    if (calls === 1) {
      storedId = (await response.json()).id;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await readyStaff(request, true);
  await page.getByRole('button', { name: 'Get quote', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Could not complete the request');
  const retry = await issue(page, request);
  expect(retry.id).toBe(storedId);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});
