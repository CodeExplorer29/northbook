import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { bookTrade, readyStaff } from './trading-helpers.js';

test('staff offers only valid actions, applies a double click once, and shows every ledger event', async ({
  page,
  request,
}) => {
  await readyStaff(request);
  const trade = await bookTrade(page);
  await page.request.post('/api/demo/persona', { data: { userId: 'staff' } });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/staff/trades/${trade.id}`);
  const actions = page.getByRole('region', { name: 'Settlement actions', exact: true });
  const ledger = page.getByRole('region', { name: 'Ledger', exact: true });
  const groups = ledger.getByRole('region', { name: /ledger group$/ });
  await expect(groups).toHaveCount(1);
  await expect(actions.getByRole('button', { name: 'Simulate funds received', exact: true })).toBeEnabled();
  await expect(actions.getByRole('button', { name: 'Cancel trade', exact: true })).toBeEnabled();
  await expect(actions.getByRole('button', { name: 'Simulate payout sent', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Pricing', exact: true })).toContainText('35 bps');
  await expect(ledger).not.toContainText('Integrity check passed');
  let count = 0;
  let release: (() => void) | undefined;
  await page.route(`**/api/staff/trades/${trade.id}/events`, async (route) => {
    count++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.continue();
  });
  await actions.getByRole('button', { name: 'Simulate funds received', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(actions.getByRole('button', { name: 'Applying…', exact: true })).toBeDisabled();
  await expect(actions.getByRole('button', { name: 'Cancel trade', exact: true })).toBeDisabled();
  await expect.poll(() => count).toBe(1);
  release!();
  await expect(page.getByTestId('trade-state')).toHaveText('Funds received');
  await expect(groups).toHaveCount(2);
  expect(count).toBe(1);
  await page.unroute(`**/api/staff/trades/${trade.id}/events`);
  await expect(actions.getByRole('button', { name: 'Cancel trade', exact: true })).toHaveCount(0);
  await actions.getByRole('button', { name: 'Simulate payout sent', exact: true }).click();
  await expect(page.getByTestId('trade-state')).toHaveText('Payout sent');
  await expect(groups).toHaveCount(3);
  await actions.getByRole('button', { name: 'Simulate payout confirmed', exact: true }).click();
  await expect(page.getByTestId('trade-state')).toHaveText('Settled');
  await expect(groups).toHaveCount(4);
  await expect(actions.getByRole('button')).toHaveCount(0);
  await expect(groups.last()).toContainText('Confirmation only. No additional monetary posting.');
  await expect(ledger).toContainText('4 events · 9 postings');
  await ledger.getByRole('button', { name: 'Run check', exact: true }).click();
  await expect(ledger.getByRole('status')).toHaveText('Integrity check passed');
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/staff-trade.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('staff cancellation needs an inline reason and shows the exact reversing ledger group', async ({
  page,
  request,
}) => {
  await readyStaff(request);
  const trade = await bookTrade(page);
  await page.request.post('/api/demo/persona', { data: { userId: 'staff' } });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/staff/trades/${trade.id}`);
  const actions = page.getByRole('region', { name: 'Settlement actions', exact: true });
  await actions.getByRole('button', { name: 'Cancel trade', exact: true }).click();
  const confirmation = actions.getByRole('alertdialog');
  await expect(confirmation).toContainText('This cannot be undone');
  await expect(confirmation.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
  await confirmation.getByLabel('Cancellation reason').fill('   ');
  await expect(confirmation.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
  await confirmation.getByLabel('Cancellation reason').fill('Client changed the demo trade request.');
  await confirmation.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByTestId('trade-state')).toHaveText('Cancelled');
  await expect(actions).toContainText('Client changed the demo trade request.');
  await expect(actions.getByRole('button')).toHaveCount(0);
  const reversed = page.getByRole('region', { name: 'Trade cancelled ledger group', exact: true });
  await expect(reversed).toContainText('Reverses booking');
  await expect(reversed).toContainText('Balanced ETH');
  await expect(reversed).toContainText('Balanced CAD');
  const ledger = page.getByRole('region', { name: 'Ledger', exact: true });
  await ledger.getByRole('button', { name: 'Run check', exact: true }).click();
  await expect(ledger.getByRole('status')).toHaveText('Integrity check passed');
  await page.screenshot({
    path: 'docs/review/staff-trade-cancelled.png',
    fullPage: true,
    animations: 'disabled',
  });
});
