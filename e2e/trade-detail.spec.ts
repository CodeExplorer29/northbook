import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { applyEvent, bookTrade, readyStaff } from './trading-helpers.js';

// State transitions below use a separate staff cookie; the visible browser
// remains a client, so refresh and access checks exercise the actual routes.
test('client detail explains every settlement stage using recorded events and no funding deadline', async ({
  page,
  request,
  context,
}) => {
  await readyStaff(request);
  const trade = await bookTrade(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/trades/${trade.id}`);
  const next = page.getByRole('region', { name: 'What happens next', exact: true });
  await expect(next).toContainText('Send exactly 50 ETH');
  await expect(next).toContainText('Action needed from you');
  await expect(next).toContainText('Ethereum');
  await expect(next).toContainText('Sample address. Do not send funds.');
  await expect(next).toContainText(trade.id);
  await expect(page.getByRole('main')).not.toContainText(/funding window|closes at|send by/i);
  await next.getByRole('button', { name: 'Copy amount', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(trade.baseAmount);
  await next.getByRole('button', { name: 'Copy deposit address', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('SAMPLE');
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/trade-detail.png', fullPage: true });
  for (const [action, title, label] of [
    ['funds_received', 'We have your funds. Your payout is being prepared.', 'Funds received'],
    ['payout_sent', 'CAD sent to your account ending 4471.', 'Payout sent'],
    ['payout_confirmed', 'This trade is complete.', 'Settled'],
  ]) {
    await applyEvent(request, trade.id, action!);
    await expect(page.getByTestId('trade-state')).toHaveText(label!, { timeout: 8000 });
    await expect(next).toContainText(title!);
    await expect(next).toContainText('Nothing needed from you');
    await expect(next).not.toContainText('Action needed');
    await expect(page.getByRole('main')).not.toContainText(/funding window|closes at|send by/i);
  }
  const detail = await (await page.request.get(`/api/trades/${trade.id}`)).json();
  const timeline = page.getByRole('list', { name: 'Timeline', exact: true });
  await expect(timeline.getByRole('listitem')).toHaveCount(5);
  for (const event of detail.events)
    expect(
      await timeline
        .locator('time')
        .evaluateAll((times) => times.map((time) => time.getAttribute('datetime'))),
    ).toContain(event.createdAt);
  await expect(timeline.getByText('Simulated', { exact: true })).toHaveCount(3);
  await page.screenshot({ path: 'docs/review/trade-detail-settled.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'docs/review/trade-detail-mobile.png', fullPage: true });
});

test('BUY shows fictional fiat funding, crypto payout, the actual cancellation reason and scoped access', async ({
  page,
  request,
}) => {
  await readyStaff(request);
  const trade = await bookTrade(page, { pair: 'BTC/CAD', side: 'BUY', fixed: 'base', amount: '2' });
  await page.goto(`/trades/${trade.id}`);
  const next = page.getByRole('region', { name: 'What happens next', exact: true });
  await expect(next).toContainText('Sample bank details. Do not send funds.');
  await expect(next).toContainText('SAMPLE-0001');
  await expect(page.getByRole('region', { name: 'Payout destination', exact: true })).toContainText(
    'Bitcoin',
  );
  await applyEvent(request, trade.id, 'cancel', 'Client requested cancellation of this demonstration.');
  await expect(page.getByTestId('trade-state')).toHaveText('Cancelled', { timeout: 8000 });
  await expect(next).toContainText('This trade was cancelled.');
  await expect(next).toContainText('Client requested cancellation of this demonstration.');
  await expect(next).toContainText('Nothing needed from you');
  await expect(next).not.toContainText('Action needed');
  await expect(page.getByRole('list', { name: 'Timeline', exact: true })).toContainText('Cancelled');
  await page.request.post('/api/demo/persona', { data: { userId: 'harbourline-trader' } });
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Trade not found');
  await expect(page.getByRole('region', { name: 'Summary', exact: true })).toHaveCount(0);
});
