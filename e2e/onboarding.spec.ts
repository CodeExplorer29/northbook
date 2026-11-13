import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('unverified clients see live indicative prices, save drafts, submit once and see the staff decision', async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.request.post('/api/demo/persona', { data: { userId: 'cedar-admin' } });
  await page.goto('/trade');
  const widget = page.getByRole('region', { name: 'Indicative conversion', exact: true });
  await expect(widget.getByLabel('You receive', { exact: true })).not.toHaveValue('', { timeout: 15000 });
  await expect(widget.getByRole('button', { name: 'Get a firm quote' })).toBeDisabled();
  await widget.getByLabel('You pay', { exact: true }).fill('25');
  await expect(widget.getByRole('button', { name: 'Get a firm quote' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Your business is not verified yet' })).toBeVisible();
  await expect(page.locator('main')).toContainText('Draft');
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/trade-unverified.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'docs/review/trade-unverified-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });

  const clear = await page.request.put('/api/kyb/application', {
    data: {
      legalName: '',
      registrationNumber: '',
      jurisdiction: '',
      natureOfBusiness: '',
      beneficialOwners: [],
    },
  });
  expect(clear.status()).toBe(200);
  await page.getByRole('link', { name: 'Continue onboarding' }).click();
  await expect(page.getByLabel('Legal name', { exact: true })).toBeVisible();
  let submissions = 0;
  page.on('request', (event) => {
    if (event.method() === 'POST' && event.url().endsWith('/api/kyb/application/submit')) submissions++;
  });
  await page.getByRole('button', { name: 'Submit for review' }).click();
  const summary = page.getByRole('alert').filter({ hasText: 'Fix 5 problems' });
  await expect(summary).toBeVisible();
  for (const message of [
    'Enter the business’s legal name',
    'Enter the registration number',
    'Choose a jurisdiction',
    'Describe the nature of business',
    'Add at least one beneficial owner',
  ])
    await expect(summary.getByRole('link', { name: message })).toBeVisible();
  expect(submissions).toBe(0);
  await page.getByLabel('Legal name', { exact: true }).fill('Cedar & Finch Remittance Corp.');
  await page.getByLabel('Registration number', { exact: true }).fill('AB-2019-0048812');
  await page.getByLabel('Jurisdiction', { exact: true }).selectOption('Alberta, Canada');
  await page
    .getByLabel('Nature of business', { exact: true })
    .fill('Cross-border remittance for small businesses');
  await page.getByRole('button', { name: 'Add owner' }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Tomás Reyes');
  await page.getByLabel('Ownership', { exact: true }).fill('60');
  await page.getByRole('button', { name: 'Add owner' }).click();
  await page.getByLabel('Full name', { exact: true }).nth(1).fill('Ingrid Sørensen');
  await page.getByLabel('Ownership', { exact: true }).nth(1).fill('39');
  await expect(
    page.getByRole('alert').getByRole('link', { name: 'Ownership adds up to 99%. It should total 100%.' }),
  ).toBeVisible();
  await page.getByLabel('Ownership', { exact: true }).nth(1).fill('40');
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved automatically.' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Registration number', { exact: true })).toHaveValue('AB-2019-0048812');
  await expect(page.getByLabel('Ownership', { exact: true }).nth(1)).toHaveValue('40');
  await page.screenshot({ path: 'docs/review/onboarding.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'docs/review/onboarding-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Submit for review' }).evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
  await expect(
    page.getByRole('heading', { name: 'Under review. No action is needed from you.' }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  await expect(page.getByLabel('Legal name', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Application summary' })).toContainText('Tomás Reyes');
  await page.screenshot({ path: 'docs/review/onboarding-submitted.png', fullPage: true });
  const application = await (await page.request.get('/api/kyb/application')).json();
  expect(application.submissionCount).toBe(1);
  await request.post('/api/demo/persona', { data: { userId: 'staff' } });
  const decision = await request.post(`/api/staff/applications/${application.id}/reject`, {
    data: { reason: 'The registration number could not be matched to the jurisdiction given.' },
    headers: { 'idempotency-key': randomUUID() },
  });
  expect(decision.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Not approved', exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator('main')).toContainText(
    'The registration number could not be matched to the jurisdiction given.',
  );
  await page.screenshot({ path: 'docs/review/onboarding-rejected.png', fullPage: true });
  await page.goto('/trade');
  await expect(page.getByRole('heading', { name: 'Your application was not approved' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get a firm quote' })).toBeDisabled();
  // A later Home intake must keep the existing decision and every saved field.
  const rejectedApplication = await (await page.request.get('/api/kyb/application')).json();
  await page.goto('/');
  await page
    .getByLabel('Business legal name', { exact: true })
    .fill('New details must not overwrite the decision');
  await page.getByLabel('Work email', { exact: true }).fill('replacement@example.com');
  await page.getByRole('button', { name: 'Start verification' }).click();
  await expect(page).toHaveURL('/onboarding');
  const handoff = page.getByRole('region', { name: 'Details from Home' });
  await expect(handoff).toContainText('Your new details have not replaced it.');
  await expect(handoff).toContainText('replacement@example.com');
  expect(await (await page.request.get('/api/kyb/application')).json()).toEqual(rejectedApplication);
});

test('approved onboarding presents the recorded application, limits and the unlocked trading link', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.request.post('/api/demo/persona', { data: { userId: 'maple-trader' } });
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Verified. You can request firm quotes.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Application summary' })).toContainText(
    'Maple Ridge Payments Inc.',
  );
  await expect(page.getByRole('button', { name: 'Submit for review' })).toHaveCount(0);
  await expect(page.locator('main')).toContainText('2,000,000 CAD');
  await page.screenshot({ path: 'docs/review/onboarding-approved.png', fullPage: true });
  await page.getByRole('link', { name: 'Go to Trade' }).click();
  await expect(page.getByRole('region', { name: 'Request a firm quote' })).toBeVisible();
});
