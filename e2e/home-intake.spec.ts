import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Home carries every entered value to the existing Cedar draft without creating an identity', async ({
  page,
  request,
}) => {
  await request.post('/api/demo/persona', { data: { userId: 'staff' } });
  const applications = await (await request.get('/api/staff/applications')).json();
  const cedar = applications.find(
    (application: { organisationId: string }) => application.organisationId === 'cedar',
  );
  const identities = await (await request.get('/api/demo/status')).json();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Switch persona:/ })).toBeEnabled();
  await page.getByLabel('Business legal name', { exact: true }).fill('Sample Home intake company');
  await page.getByLabel('Work email', { exact: true }).fill('treasury@example.com');
  await page.getByLabel('Expected monthly volume', { exact: true }).selectOption('250,000 to 1,000,000 CAD');
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/home-verification.png', fullPage: true });
  let switches = 0,
    saves = 0;
  page.on('request', (event) => {
    if (event.method() === 'POST' && event.url().endsWith('/api/demo/persona')) switches++;
    if (event.method() === 'PUT' && event.url().endsWith('/api/kyb/application')) saves++;
  });
  await page.getByRole('button', { name: 'Start verification' }).evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
  await expect(page).toHaveURL('/onboarding');
  await expect(page.getByLabel('Legal name', { exact: true })).toHaveValue('Sample Home intake company');
  await expect(page.getByLabel('Work email (optional)', { exact: true })).toHaveValue('treasury@example.com');
  await expect(page.getByLabel('Expected monthly volume (optional)', { exact: true })).toHaveValue(
    '250,000 to 1,000,000 CAD',
  );
  expect(switches).toBe(1);
  expect(saves).toBe(1);
  const session = await (await page.request.get('/api/me')).json();
  expect(session.user.id).toBe('cedar-admin');
  expect(session.organisation.id).toBe('cedar');
  const updated = await (await page.request.get('/api/kyb/application')).json();
  expect(updated).toMatchObject({
    id: cedar.id,
    organisationId: 'cedar',
    state: 'draft',
    submissionCount: 0,
    legalName: 'Sample Home intake company',
    workEmail: 'treasury@example.com',
    monthlyVolume: '250,000 to 1,000,000 CAD',
    registrationNumber: cedar.registrationNumber,
    jurisdiction: cedar.jurisdiction,
    natureOfBusiness: cedar.natureOfBusiness,
    beneficialOwners: cedar.beneficialOwners,
  });
  expect(await (await request.get('/api/demo/status')).json()).toEqual(identities);
  const after = await (await request.get('/api/staff/applications')).json();
  expect(after.map((item: { id: string }) => item.id).sort()).toEqual(
    applications.map((item: { id: string }) => item.id).sort(),
  );
  expect(after.filter((item: { organisationId: string }) => item.organisationId !== 'cedar')).toEqual(
    applications.filter((item: { organisationId: string }) => item.organisationId !== 'cedar'),
  );
  await page.reload();
  await expect(page.getByLabel('Work email (optional)', { exact: true })).toHaveValue('treasury@example.com');
  await page.screenshot({ path: 'docs/review/onboarding-intake.png', fullPage: true });
});

test('Home keeps typed intake while its initial persona response is still loading', async ({ page }) => {
  expect((await page.request.post('/api/demo/reset', { data: {} })).ok()).toBe(true);
  await page.request.post('/api/demo/persona', { data: { userId: 'cedar-admin' } });
  let release: (() => void) | undefined;
  let held = true;
  await page.route('**/api/me', async (route) => {
    if (held)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.continue();
  });
  await page.goto('/');
  await expect.poll(() => !!release).toBe(true);
  await page.getByLabel('Business legal name', { exact: true }).fill('Typed while loading');
  await page.getByLabel('Work email', { exact: true }).fill('retained@example.com');
  held = false;
  release!();
  await expect(page.getByRole('button', { name: /^Switch persona: Cedar/ })).toBeEnabled();
  await expect(page.getByLabel('Business legal name', { exact: true })).toHaveValue('Typed while loading');
  await expect(page.getByLabel('Work email', { exact: true })).toHaveValue('retained@example.com');
  await page.getByRole('button', { name: 'Start verification' }).click();
  await expect(page).toHaveURL('/onboarding');
  await expect(page.getByLabel('Legal name', { exact: true })).toHaveValue('Typed while loading');
  await expect(page.getByLabel('Work email (optional)', { exact: true })).toHaveValue('retained@example.com');
});
