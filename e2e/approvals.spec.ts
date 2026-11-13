import { mkdir } from 'node:fs/promises';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function submitted(request: APIRequestContext) {
  const reset = await request.post('/api/demo/reset', { data: {} });
  expect(reset.status(), await reset.text()).toBe(200);
  await request.post('/api/demo/persona', { data: { userId: 'cedar-admin' } });
  const response = await request.post('/api/kyb/application/submit', {
    data: {},
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).id as string;
}

test('staff approves once, the client can quote and the switcher shows verified', async ({
  page,
  request,
}) => {
  const id = await submitted(request);
  const quote = () =>
    request.post('/api/quotes', {
      data: { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '10' },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
  expect((await (await quote()).json()).error.code).toBe('kyb_not_approved');
  await page.request.post('/api/demo/persona', { data: { userId: 'staff' } });
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto('/staff/approvals');
  const panel = page.getByRole('complementary', { name: 'Cedar & Finch Remittance Corp.' });
  await expect(panel).toContainText('AB-2019-0048812');
  await expect(panel.getByRole('region', { name: 'Beneficial owners' })).toContainText('100%');
  await expect(page.getByRole('table', { name: 'KYB applications' }).getByRole('row')).toHaveCount(4);
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/approvals.png', fullPage: true });
  await page.getByRole('button', { name: /^Needs review/ }).click();
  await expect(page.getByRole('table', { name: 'KYB applications' }).getByRole('row')).toHaveCount(2);
  let decisions = 0;
  let release: (() => void) | undefined;
  await page.route(`**/api/staff/applications/${id}/approve`, async (route) => {
    decisions++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.continue();
  });
  await panel.getByRole('button', { name: 'Approve', exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(panel.getByRole('button', { name: 'Approving…' })).toBeDisabled();
  await expect.poll(() => decisions).toBe(1);
  release!();
  await expect(panel.getByRole('status')).toContainText('The client can now request firm quotes.');
  await expect(page.getByRole('table', { name: 'KYB applications' })).toContainText(
    'No applications need review.',
  );
  await expect(panel.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect
    .poll(
      async () => {
        const response = await quote();
        if (response.status() !== 201)
          expect(['price_unavailable', 'insufficient_liquidity']).toContain(
            (await response.json()).error.code,
          );
        return response.status();
      },
      { timeout: 20000 },
    )
    .toBe(201);
  await page.getByRole('button', { name: /^Switch persona:/ }).click();
  await expect(page.getByRole('menuitemradio', { name: /Cedar & Finch/ })).toContainText('Verified');
  expect(decisions).toBe(1);
});

test('rejection requires a reason, reaches the client and ordinary clients cannot review', async ({
  page,
  request,
}) => {
  await submitted(request);
  expect((await request.get('/api/staff/applications')).status()).toBe(403);
  await page.request.post('/api/demo/persona', { data: { userId: 'staff' } });
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto('/staff/approvals');
  const panel = page.getByRole('complementary', { name: 'Cedar & Finch Remittance Corp.' });
  await panel.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Confirm rejection' })).toBeDisabled();
  await page.getByLabel('Reason for rejection').fill('   ');
  await expect(panel.getByRole('button', { name: 'Confirm rejection' })).toBeDisabled();
  await page
    .getByLabel('Reason for rejection')
    .fill('The registration number could not be matched to the jurisdiction given.');
  await page.screenshot({ path: 'docs/review/approvals-rejection.png', fullPage: true });
  await panel.getByRole('button', { name: 'Confirm rejection' }).click();
  await expect(panel.getByRole('status')).toContainText('Reason shared with the client');
  expect((await (await request.get('/api/kyb/application')).json()).decisionReason).toBe(
    'The registration number could not be matched to the jurisdiction given.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.request.post('/api/demo/persona', { data: { userId: 'cedar-admin' } });
  await page.goto('/onboarding');
  await expect(page.locator('main')).toContainText(
    'The registration number could not be matched to the jurisdiction given.',
  );
  await page.goto('/staff/approvals');
  await expect(page.getByRole('button', { name: 'Choose persona' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'KYB applications' })).toHaveCount(0);
});
