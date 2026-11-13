import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { readyStaff } from './trading-helpers.js';
import { Money, quoteResponseSchema } from '../packages/shared/src/index.js';
import { formatAmount } from '../apps/web/lib/format-money.js';

test('replay SELL: approved client sells 50 ETH, staff settles and ledger integrity passes', async ({
  page,
  request,
}) => {
  expect((await request.post('/api/demo/reset', { data: {} })).ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/trade');
  await page.getByRole('button', { name: /^Switch persona:/ }).click();
  await page.getByRole('menuitemradio', { name: /Maple Ridge Payments/ }).click();
  await page.getByLabel('You pay', { exact: true }).fill('50');
  await readyStaff(request, true);
  const issued = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/quotes',
  );
  await page.getByRole('button', { name: 'Get quote', exact: true }).click();
  const response = await issued;
  expect(response.status()).toBe(201);
  const quote = quoteResponseSchema.parse(await response.json());
  expect(new Money(quote.payAmount).toFixed()).toBe('50');
  expect(quote.payCurrency).toBe('ETH');
  expect(quote.receiveCurrency).toBe('CAD');
  expect(quote.replayed).toBe(true);
  await expect(page.getByLabel('Firm quote')).toContainText(`${formatAmount(quote.receiveAmount, 'CAD')}CAD`);
  await mkdir('docs/review', { recursive: true });
  await expect(page.getByRole('status', { name: /^Loading/ })).toHaveCount(0);
  await expect(page.locator('tbody[aria-busy=true]')).toHaveCount(0);
  await page.screenshot({ path: 'docs/review/trade.png', fullPage: true });
  await page.getByRole('button', { name: 'Accept quote', exact: true }).click();
  const link = page.getByRole('link', { name: 'View trade' });
  const href = await link.getAttribute('href');
  await link.click();
  await expect(page.getByTestId('trade-state')).toHaveText('Awaiting client funds');
  await page.screenshot({ path: 'docs/review/trade-detail.png', fullPage: true });
  await page.getByRole('button', { name: /^Switch persona:/ }).click();
  await page.getByRole('menuitemradio', { name: /Northbook staff/ }).click();
  await page.getByRole('link', { name: 'Blotter', exact: true }).click();
  await page
    .getByRole('table', { name: 'Staff trades', exact: true })
    .getByRole('link', { name: href!.split('/').at(-1)!, exact: true })
    .click();
  await page.getByRole('button', { name: 'Simulate funds received', exact: true }).click();
  await expect(page.getByTestId('trade-state')).toHaveText('Funds received');
  await page.getByRole('button', { name: 'Simulate payout sent', exact: true }).click();
  await expect(page.getByTestId('trade-state')).toHaveText('Payout sent');
  await page.getByRole('button', { name: 'Simulate payout confirmed', exact: true }).click();
  await expect(page.getByTestId('trade-state')).toHaveText('Settled');
  await expect(page.getByRole('list', { name: 'Timeline', exact: true }).getByRole('listitem')).toHaveCount(
    5,
  );
  await page.getByRole('button', { name: 'Run check', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Ledger', exact: true }).getByRole('status')).toHaveText(
    'Integrity check passed',
  );
  const integrity = await page.evaluate(async () => (await fetch('/api/staff/ledger/check')).json());
  expect(integrity).toEqual({ ok: true, discrepancies: [] });
  await page.screenshot({ path: 'docs/review/staff-trade.png', fullPage: true });
});
