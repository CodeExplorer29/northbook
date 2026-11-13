import { expect, test } from '@playwright/test';
import { Money, quoteResponseSchema, staffTradeDetailSchema } from '../packages/shared/src/index.js';
import { formatAmount } from '../apps/web/lib/format-money.js';
import { readyStaff } from './trading-helpers.js';

test('replay BUY: receive exactly 2 BTC, round the CAD payment up, settle and reconcile the ledger', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  expect((await request.post('/api/demo/reset', { data: {} })).ok()).toBe(true);
  await page.goto('/trade');
  await page.getByRole('button', { name: /^Switch persona:/ }).click();
  await page.getByRole('menuitemradio', { name: /Maple Ridge Payments/ }).click();
  const widget = page.getByRole('region', { name: 'Request a firm quote', exact: true });
  await widget.getByRole('button', { name: 'Swap direction' }).click();
  await widget.getByRole('button', { name: 'Receive asset', exact: true }).click();
  await widget.getByRole('option', { name: 'BTC', exact: true }).click();
  await widget.getByLabel('You receive', { exact: true }).fill('2');
  await expect(widget.getByRole('button', { name: 'Pay asset', exact: true })).toHaveText(/CAD$/);
  await readyStaff(request, true);
  const issued = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/quotes',
  );
  await widget.getByRole('button', { name: 'Get quote', exact: true }).click();
  const response = await issued;
  expect(response.status(), await response.text()).toBe(201);
  expect(response.request().postDataJSON()).toEqual({
    pair: 'BTC/CAD',
    side: 'BUY',
    fixed: 'base',
    amount: '2',
  });
  const quote = quoteResponseSchema.parse(await response.json());
  expect(quote).toMatchObject({
    side: 'BUY',
    fixed: 'base',
    receiveCurrency: 'BTC',
    payCurrency: 'CAD',
    replayed: true,
  });
  expect(new Money(quote.requestedAmount).toFixed()).toBe('2');
  expect(new Money(quote.receiveAmount).toFixed()).toBe('2');

  // Use the full-precision private route, not the rounded informational price
  // shown to clients. This verifies the financial result of the real UI request.
  const storedResponse = await request.get(`/api/staff/quotes/${quote.id}`);
  expect(storedResponse.ok()).toBe(true);
  const stored = await storedResponse.json();
  expect(typeof stored.route.marketPrice).toBe('string');
  const unrounded = new Money(stored.route.marketPrice)
    .mul('2')
    .mul(new Money(1).plus(new Money(stored.spreadBps).div(10000)));
  const paid = new Money(quote.payAmount);
  expect(unrounded.decimalPlaces()).toBeGreaterThan(2);
  expect(paid.toFixed(2)).toBe(unrounded.toFixed(2, Money.ROUND_CEIL));
  expect(paid.toFixed(2)).not.toBe(unrounded.toFixed(2, Money.ROUND_FLOOR));
  expect(paid.gte(unrounded) && paid.minus(unrounded).lt('0.01')).toBe(true);
  const card = page.getByRole('region', { name: 'Firm quote', exact: true });
  await expect(card).toContainText('2.00000000BTC');
  await expect(card).toContainText(`${formatAmount(quote.payAmount, 'CAD')}CAD`);
  await page.screenshot({ path: 'docs/review/buy-quote.png', fullPage: true, animations: 'disabled' });
  await card.getByRole('button', { name: 'Accept quote', exact: true }).click();
  const link = card.getByRole('link', { name: 'View trade', exact: true });
  await expect(link).toBeVisible();
  const id = (await link.getAttribute('href'))!.split('/').at(-1)!;
  await link.click();
  await expect(page.getByTestId('trade-state')).toHaveText('Awaiting client funds');
  await expect(page.getByRole('region', { name: 'What happens next', exact: true })).toContainText(
    `${formatAmount(quote.payAmount, 'CAD')} CAD`,
  );
  await page.getByRole('button', { name: /^Switch persona:/ }).click();
  await page.getByRole('menuitemradio', { name: /Northbook staff/ }).click();
  await page
    .getByRole('table', { name: 'Staff trades', exact: true })
    .getByRole('link', { name: id, exact: true })
    .click();
  for (const [action, state] of [
    ['Simulate funds received', 'Funds received'],
    ['Simulate payout sent', 'Payout sent'],
    ['Simulate payout confirmed', 'Settled'],
  ]) {
    await page.getByRole('button', { name: action!, exact: true }).click();
    await expect(page.getByTestId('trade-state')).toHaveText(state!);
  }
  const ledger = page.getByRole('region', { name: 'Ledger', exact: true });
  await expect(ledger.getByRole('region', { name: /ledger group$/ })).toHaveCount(4);
  await ledger.getByRole('button', { name: 'Run check', exact: true }).click();
  await expect(ledger.getByRole('status')).toHaveText('Integrity check passed');
  expect(await (await request.get('/api/staff/ledger/check')).json()).toEqual({
    ok: true,
    discrepancies: [],
  });
  const detail = staffTradeDetailSchema.parse(await (await request.get(`/api/staff/trades/${id}`)).json());
  expect(detail.state).toBe('settled');
  expect(new Money(detail.baseAmount).toFixed()).toBe('2');
  expect(new Money(detail.quoteAmount).eq(paid)).toBe(true);
  const entries = detail.ledger.flatMap((group) => group.entries);
  const funded = entries.find(
    (entry) => entry.accountType === 'desk_bank' && entry.currency === 'CAD' && entry.direction === 'debit',
  );
  const payout = entries.find(
    (entry) =>
      entry.accountType === 'desk_wallet' && entry.currency === 'BTC' && entry.direction === 'credit',
  );
  expect(funded).toBeDefined();
  expect(new Money(funded!.amount).eq(paid)).toBe(true);
  expect(payout).toBeDefined();
  expect(new Money(payout!.amount).toFixed()).toBe('2');
  await page.screenshot({ path: 'docs/review/buy-settled.png', fullPage: true, animations: 'disabled' });
});
