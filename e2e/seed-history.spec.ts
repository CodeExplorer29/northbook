import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('historical screens show exact figures and changes are kept', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  expect((await page.request.post('/api/demo/reset', { data: {} })).ok()).toBe(true);
  await page.request.post('/api/demo/persona', { data: { userId: 'maple-trader' } });
  await page.goto('/trades/NB-T-000128');
  await expect(page.getByRole('heading', { name: 'NB-T-000128' })).toBeVisible();
  await expect(page.locator('main')).toContainText('207,892.50');
  await expect(page.locator('main')).toContainText('Awaiting client funds');
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/seed-trade.png', fullPage: true });
  await page.request.post('/api/demo/persona', { data: { userId: 'staff' } });
  await page.goto('/staff/trades/NB-T-000128');
  await expect(page.getByRole('heading', { name: 'Pricing', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Execution route' })).toContainText('binance');
  await expect(page.locator('main')).toContainText('730.00');
  expect(await (await page.request.get('/api/staff/ledger/check')).json()).toEqual({
    ok: true,
    discrepancies: [],
  });
  await page.screenshot({ path: 'docs/review/seed-staff-trade.png', fullPage: true });
  expect(
    (
      await page.request.post('/api/staff/trades/NB-T-000128/events', {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        data: { action: 'cancel', reason: 'Client request' },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: /^Switch persona:/ }).click();
  await expect(page.getByRole('menuitem', { name: /reset/i })).toHaveCount(0);
  const kept = await (await page.request.get('/api/staff/trades/NB-T-000128')).json();
  expect(kept.state).toBe('cancelled');
  expect(await (await page.request.get('/api/staff/ledger/check')).json()).toEqual({
    ok: true,
    discrepancies: [],
  });
});
