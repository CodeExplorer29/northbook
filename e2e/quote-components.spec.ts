import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function openGallery(page: Page) {
  await page.clock.install({ time: new Date('2026-11-13T18:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-13T18:00:01Z'));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/quote-components');
}

test('two-way widgets keep the fixed amount, flip, enforce minimums and label price availability', async ({
  page,
}) => {
  const quoteRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/quotes') quoteRequests.push(request.url());
  });
  await openGallery(page);
  const indicative = page.getByRole('region', { name: 'Indicative widget', exact: true });
  await expect(indicative.getByLabel('You pay', { exact: true })).toHaveValue('50');
  await expect(indicative.getByLabel('You receive', { exact: true })).toHaveValue('209160.00');
  await indicative.getByLabel('You receive', { exact: true }).fill('83664.00');
  await expect(indicative.getByLabel('You pay', { exact: true })).toHaveValue('20.00000000');
  await indicative.getByRole('button', { name: 'Swap direction' }).click();
  await expect(indicative.getByRole('button', { name: 'Pay asset', exact: true })).toHaveText(/CAD$/);
  await expect(indicative.getByLabel('You pay', { exact: true })).toHaveValue('83664.00');
  await indicative.getByRole('button', { name: 'Receive asset', exact: true }).click();
  await indicative.getByRole('option', { name: 'BTC', exact: true }).click();
  await indicative.getByLabel('You receive', { exact: true }).fill('2');
  await expect(indicative.getByLabel('You pay', { exact: true })).toHaveValue('190024.80');
  await indicative.getByRole('button', { name: 'Get a firm quote', exact: true }).click();
  await expect(indicative.getByRole('status')).toHaveText('Choose a client persona to continue.');
  const firm = page.getByRole('region', { name: 'Firm widget', exact: true });
  await firm.getByRole('button', { name: 'Swap direction' }).click();
  await firm.getByRole('button', { name: 'Receive asset', exact: true }).click();
  await firm.getByRole('option', { name: 'BTC', exact: true }).click();
  await firm.getByLabel('You receive', { exact: true }).fill('2');
  await firm.getByRole('button', { name: 'Get quote', exact: true }).click();
  await expect(firm.getByRole('status')).toHaveText('BUY 2 base · BTC/CAD');
  const computing = page.getByRole('region', { name: 'Computing widget' });
  await expect(computing.getByLabel('You pay', { exact: true })).toHaveValue('50');
  await expect(computing.getByRole('status', { name: 'Computing amount' })).toBeVisible();
  await expect(computing.getByRole('button', { name: 'Get a firm quote' })).toBeDisabled();
  const unavailable = page.getByRole('region', { name: 'Unavailable widget' });
  await expect(unavailable.getByRole('status')).toHaveText('Waiting for price updates');
  await expect(unavailable.getByLabel('You receive', { exact: true })).toHaveValue('');
  await expect(unavailable.getByRole('button', { name: 'Get a firm quote' })).toBeDisabled();
  const minimum = page.getByRole('region', { name: 'Below minimum widget' });
  await expect(minimum.getByRole('alert')).toHaveText('Minimum trade is 10,000 CAD');
  await expect(minimum.getByRole('button', { name: 'Get a firm quote' })).toBeDisabled();
  expect(quoteRequests).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(
    await firm
      .getByLabel('You pay', { exact: true })
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});

test('all quote states render and acceptance stays locked while the response is pending', async ({
  page,
}) => {
  await openGallery(page);
  const active = page.getByRole('region', { name: 'Active example', exact: true });
  const ending = page.getByRole('region', { name: 'Ending example', exact: true });
  const accepting = page.getByRole('region', { name: 'Accepting example', exact: true });
  const expired = page.getByRole('region', { name: 'Expired example', exact: true });
  const accepted = page.getByRole('region', { name: 'Accepted example', exact: true });
  await expect(active).toContainText('Valid for 14s');
  await expect(ending).toContainText('Valid for 3s');
  await expect(ending.getByText('Valid for 3s')).toHaveCSS('color', 'rgb(192, 57, 43)');
  await expect(accepting.getByRole('button', { name: 'Accepting…' })).toBeDisabled();
  await expect(accepting.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await expect(expired.getByRole('button', { name: 'Accept quote' })).toHaveCount(0);
  await expect(expired).toContainText('No trade was made.');
  await expect(accepted.getByRole('link', { name: 'View trade' })).toHaveAttribute(
    'href',
    '/trades/NB-T-000128',
  );
  await expect(page.getByRole('region', { name: 'Late acceptance example' })).toContainText(
    'This quote expired before we received your acceptance. No trade was made.',
  );
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/quote-components.png', fullPage: true });
  await page.getByRole('button', { name: 'Move indicative market' }).click();
  await expect(active).toContainText('207,892.50');
  await expect(active).toContainText('1 ETH = 4,157.85 CAD');
  await page.clock.runFor(11000);
  await expect(active.getByText('Valid for 3s')).toHaveCSS('color', 'rgb(192, 57, 43)');
  let requests = 0;
  let release: (() => void) | undefined;
  await page.route('**/api/test/echo?pattern=accept&scenario=Active', async (route) => {
    requests++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: { ok: true } });
  });
  await active.getByRole('button', { name: 'Accept quote', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(active.getByRole('button', { name: 'Accepting…' })).toBeDisabled();
  await expect(active.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await expect.poll(() => requests).toBe(1);
  await page.clock.runFor(5000);
  await expect(active.getByRole('button', { name: 'Accepting…' })).toBeDisabled();
  await expect(active).not.toContainText('No trade was made.');
  release!();
  await expect(active.getByRole('link', { name: 'View trade' })).toBeVisible();
  expect(requests).toBe(1);
});

test('countdown expires one second early, re-quote resets it and server expiry has the exact message', async ({
  page,
}) => {
  await openGallery(page);
  const active = page.getByRole('region', { name: 'Active example', exact: true });
  await page.clock.runFor(13999);
  await expect(active.getByRole('button', { name: 'Accept quote', exact: true })).toBeEnabled();
  await page.clock.runFor(1);
  await expect(active.getByRole('button', { name: 'Accept quote', exact: true })).toHaveCount(0);
  await expect(active).toContainText('This quote has expired. No trade was made.');
  await active.getByRole('button', { name: 'Request new quote' }).click();
  await expect(active.getByRole('button', { name: 'Accept quote', exact: true })).toBeEnabled();
  await expect(active).toContainText('Valid for 14s');
  await page.route('**/api/test/echo?pattern=accept&scenario=Active', async (route) => {
    await route.fulfill({
      status: 410,
      json: { error: { code: 'quote_expired', message: 'Quote expired.', requestId: 'req_late' } },
    });
  });
  await active.getByRole('button', { name: 'Accept quote', exact: true }).click();
  await expect(active).toContainText(
    'This quote expired before we received your acceptance. No trade was made.',
  );
});

test('an ambiguous acceptance failure does not claim that no trade was made', async ({ page }) => {
  await openGallery(page);
  const active = page.getByRole('region', { name: 'Active example', exact: true });
  await page.route('**/api/test/echo?pattern=accept&scenario=Active', async (route) => {
    await route.abort('failed');
  });
  await active.getByRole('button', { name: 'Accept quote', exact: true }).click();
  await expect(active).toContainText('Acceptance could not be confirmed.');
  await page.clock.runFor(16000);
  await expect(active).not.toContainText('No trade was made.');
  await expect(active.getByRole('button', { name: 'Request new quote' })).toHaveCount(0);
  await expect(active.getByRole('link', { name: 'Check trades' })).toHaveAttribute('href', '/trades');
});
