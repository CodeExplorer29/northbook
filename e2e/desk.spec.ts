import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('staff see the desk position and spread revenue move when a trade is booked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  expect((await page.request.post('/api/demo/reset', { data: {} })).ok()).toBe(true);
  await page.request.post('/api/demo/persona', { data: { userId: 'staff' } });
  const before = await (await page.request.get('/api/staff/desk')).json();
  const quantity = (desk: { positions: { currency: string; quantity: string }[] }, currency: string) =>
    Number(desk.positions.find((item) => item.currency === currency)?.quantity ?? 0);

  await page.request.post('/api/demo/persona', { data: { userId: 'maple-trader' } });
  const quote = await page.request.post('/api/quotes', {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' },
  });
  expect(quote.ok(), await quote.text()).toBe(true);
  const accepted = await page.request.post(`/api/quotes/${(await quote.json()).id}/accept`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: {},
  });
  expect(accepted.ok(), await accepted.text()).toBe(true);

  await page.request.post('/api/demo/persona', { data: { userId: 'staff' } });
  const after = await (await page.request.get('/api/staff/desk')).json();
  expect(quantity(after, 'ETH') - quantity(before, 'ETH')).toBeCloseTo(50, 8);
  expect(quantity(after, 'CAD')).toBeLessThan(quantity(before, 'CAD'));

  await page.goto('/staff/desk');
  await expect(page.getByRole('heading', { name: 'Desk', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Staff', exact: true })).toContainText('Desk');
  const position = page.getByRole('table', { name: 'Desk position', exact: true });
  await expect(position.getByRole('row', { name: /^ETH / })).toContainText('Long (holds)');
  await expect(position.getByRole('row', { name: /^CAD / })).toContainText('Short (owes)');
  await expect(page.getByRole('table', { name: 'Spread revenue by client', exact: true })).toContainText(
    'Maple Ridge Payments',
  );
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/desk.png', fullPage: true });

  await page.request.post('/api/demo/persona', { data: { userId: 'maple-trader' } });
  await page.goto('/staff/desk');
  await expect(page.locator('main')).toContainText('available to Northbook staff');
});
