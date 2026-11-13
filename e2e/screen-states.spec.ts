import { expect, test } from '@playwright/test';

const screens = [
  { path: '/trade', persona: 'maple-trader', endpoint: '/quotes', loaded: '14:42:01' },
  { path: '/quotes', persona: 'maple-trader', endpoint: '/quotes', loaded: 'NB-Q-000342' },
  { path: '/trades', persona: 'maple-trader', endpoint: '/trades', loaded: 'NB-T-000128' },
  {
    path: '/trades/NB-T-000128',
    persona: 'maple-trader',
    endpoint: '/trades/NB-T-000128',
    loaded: '207,892.50',
  },
  { path: '/onboarding', persona: 'cedar-admin', endpoint: '/kyb/application', loaded: 'Legal name' },
  {
    path: '/trade',
    persona: 'cedar-admin',
    endpoint: '/kyb/application',
    loaded: 'Your business is not verified yet',
  },
  { path: '/staff/approvals', persona: 'staff', endpoint: '/staff/applications', loaded: 'Maple Ridge' },
  { path: '/staff/blotter', persona: 'staff', endpoint: '/staff/blotter', loaded: 'In progress' },
  { path: '/staff/configuration', persona: 'staff', endpoint: '/staff/config', loaded: 'Quote lifetime' },
  {
    path: '/staff/trades/NB-T-000128',
    persona: 'staff',
    endpoint: '/staff/trades/NB-T-000128',
    loaded: '207,892.50',
  },
];
test.beforeAll(async ({ request }) => {
  expect((await request.post('/api/demo/reset', { data: {} })).ok()).toBe(true);
});
for (const screen of screens)
  test(`${screen.persona} ${screen.path} preserves context through loading, failure, retry and rate limit`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.request.post('/api/demo/persona', { data: { userId: screen.persona } });
    let state = 'loading';
    let release: (() => void) | undefined;
    await page.route(`**/api${screen.endpoint}`, async (route) => {
      if (state === 'loading')
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (state === 'ok') return route.continue();
      return route.fulfill({
        status: state === 'limited' ? 429 : 503,
        headers: { 'retry-after': '10' },
        json: {
          error: {
            code: state === 'limited' ? 'rate_limited' : 'internal_error',
            message: 'Service temporarily unavailable.',
            requestId: 'screen-state-check',
          },
        },
      });
    });
    await page.goto(screen.path);
    await expect(page.locator('main [aria-busy="true"]').first()).toBeVisible();
    await expect.poll(() => !!release).toBe(true);
    state = 'error';
    release!();
    await expect(
      page.locator('main').getByRole('alert').filter({ hasText: 'screen-state-check' }),
    ).toBeVisible();
    state = 'ok';
    await page.locator('main').getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('main')).toContainText(screen.loaded);
    state = 'limited';
    await expect(
      page.locator('main').getByRole('status').filter({ hasText: 'Too many requests' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.locator('main').getByRole('button', { name: /Try again in/ })).toBeDisabled();
    await expect(page.locator('main')).toContainText(screen.loaded);
    if (screen.path === '/trade') {
      await page.screenshot({
        path: `docs/review/trade-${screen.persona}-rate.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
      await page.screenshot({
        path: `docs/review/trade-${screen.persona}-rate-mobile.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });

test('Home exposes the stream HTTP rate limit, keeps input and retries after the deadline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let limited = true;
  await page.route('**/api/public/prices/**', (route) =>
    limited
      ? route.fulfill({
          status: 429,
          headers: { 'retry-after': '3' },
          json: {
            error: { code: 'rate_limited', message: 'Too many requests.', requestId: 'price-rate-check' },
          },
        })
      : route.continue(),
  );
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Too many requests' })).toBeVisible();
  const widget = page.getByRole('region', { name: 'Indicative conversion', exact: true });
  await expect(widget.getByLabel('You receive', { exact: true })).toHaveValue('');
  await expect(widget.getByLabel('You pay', { exact: true })).toHaveValue('50');
  await expect(widget.getByRole('button', { name: 'Get a firm quote', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  await page.screenshot({ path: 'docs/review/home-rate.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'docs/review/home-rate-mobile.png', fullPage: true, animations: 'disabled' });
  limited = false;
  await expect(widget.getByLabel('You receive', { exact: true })).not.toHaveValue('', { timeout: 15000 });
  await expect(page.getByRole('status').filter({ hasText: 'Too many requests' })).toHaveCount(0);
});

test('quote rate limits retain the page and disable their retry until the deadline', async ({ page }) => {
  await page.request.post('/api/demo/persona', { data: { userId: 'maple-trader' } });
  await page.route('**/api/quotes', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 429,
          headers: { 'retry-after': '3' },
          json: {
            error: { code: 'rate_limited', message: 'Too many quotes.', requestId: 'quote-rate-check' },
          },
        })
      : route.continue(),
  );
  await page.goto('/trade');
  await page.getByRole('button', { name: 'Get quote', exact: true }).click();
  await expect(
    page.locator('main').getByRole('status').filter({ hasText: 'Too many requests' }),
  ).toBeVisible();
  await expect(page.getByLabel('You pay', { exact: true })).toHaveValue('50');
  await expect(page.getByRole('button', { name: 'Get quote', exact: true })).toBeDisabled();
  const retry = page.locator('main').getByRole('button', { name: /Try again/ });
  await expect(retry).toBeDisabled();
  await expect(retry).toBeEnabled({ timeout: 6000 });
  await expect(page.getByLabel('You pay', { exact: true })).toHaveValue('50');
});

test('session rate limits have a recoverable banner on every route, including static architecture', async ({
  page,
}) => {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'retry-after': '10' },
      json: { error: { code: 'rate_limited', message: 'Slow down.', requestId: 'session-rate-check' } },
    }),
  );
  for (const path of [
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
  ]) {
    await page.goto(path);
    const connection = page.getByRole('region', { name: 'Connection status', exact: true });
    await expect(connection).toContainText('Too many requests');
    await expect(connection.getByRole('button')).toBeDisabled();
    await expect(page.locator('main')).toBeVisible();
  }
});
