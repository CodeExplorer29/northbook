import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('shared chrome switches all personas, refreshes verification and offers no reset', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /^Switch persona:/ });
  await expect(trigger).toBeEnabled();
  await expect(page.locator('header')).toHaveAttribute('data-variant', 'dark');
  await expect(page.getByLabel('Demo notice')).toContainText('No real funds move');
  await expect(page.getByRole('contentinfo')).toContainText('not affiliated with any company');
  await trigger.click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(5);
  await expect(page.getByRole('menu')).toContainText('shared between viewers');
  await expect(page.getByRole('menu')).not.toContainText(/reset/i);
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/personas-home.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);

  for (const [name, id, org, variant] of [
    ['Maple Ridge Payments', 'maple-trader', 'maple', 'light'],
    ['Harbourline Treasury', 'harbourline-trader', 'harbourline', 'light'],
    ['Cedar & Finch', 'cedar-admin', 'cedar', 'light'],
    ['Northbook staff', 'staff', null, 'staff'],
  ] as const) {
    await trigger.click();
    await page.getByRole('menuitemradio', { name: new RegExp(name) }).click();
    await expect(trigger).toBeEnabled();
    await expect(page.locator('header')).toHaveAttribute('data-variant', variant);
    const session = await page.evaluate(async () => (await fetch('/api/me')).json());
    expect(session.user.id).toBe(id);
    expect(session.organisation?.id ?? null).toBe(org);
    await expect(page.getByLabel('Demo notice')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('independent demonstration');
    if (org === 'maple') await page.screenshot({ path: 'docs/review/personas-client.png', fullPage: true });
  }
  await expect(page.getByRole('navigation', { name: 'Staff', exact: true })).toContainText('Blotter');
  await expect(page.locator('header > div').first()).toHaveCSS('height', '64px');
  await page.screenshot({ path: 'docs/review/personas-staff.png', fullPage: true });

  // A later server status (for example after staff approval) must replace the
  // seeded status when the menu is reopened; no page reload is needed.
  await page.route('**/api/demo/status', async (route) => {
    const response = await route.fetch();
    const status = await response.json();
    status.personas.find(
      (entry: { user: { id: string } }) => entry.user.id === 'cedar-admin',
    ).organisation.kybState = 'approved';
    await route.fulfill({ response, json: status });
  });
  await trigger.click();
  await expect(page.getByRole('menuitemradio', { name: /Cedar & Finch/ })).toContainText('Verified');
  await page.getByRole('menuitemradio', { name: /^Visitor/ }).click();
  await expect(page).toHaveURL('/');
  expect(await page.evaluate(async () => (await fetch('/api/me')).json())).toEqual({
    user: null,
    organisation: null,
  });
  await expect(page.getByRole('navigation', { name: 'Main', exact: true })).not.toContainText('Blotter');
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'docs/review/personas-mobile.png', fullPage: true });
});
