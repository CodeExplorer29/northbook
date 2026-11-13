import { expect, test } from '@playwright/test';

test('configuration validates drafts, saves once, changes venue routing and discards edits', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  expect((await page.request.post('/api/demo/reset', { data: {} })).ok()).toBe(true);
  await page.request.post('/api/demo/persona', { data: { userId: 'staff' } });
  await page.goto('/staff/configuration');
  const lifetime = page.getByRole('textbox', { name: 'Quote lifetime', exact: true });
  await expect(lifetime).toHaveValue('15');
  await page.getByRole('textbox', { name: 'Tier 1, under 100k CAD, bps', exact: true }).fill('-1');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Check these values');
  expect((await (await page.request.get('/api/staff/config')).json()).settings.quoteLifetimeSeconds).toBe(15);
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Unsaved changes' })).toHaveCount(0);
  await lifetime.fill('30');
  await page.getByRole('textbox', { name: 'Tier 1, 100k to 500k CAD, bps', exact: true }).fill('30');
  await page
    .getByRole('combobox', { name: 'Harbourline Treasury Ltd. tier', exact: true })
    .selectOption('Tier 1');
  await page.getByRole('switch', { name: 'Use Binance for routing' }).click();
  await expect(page.getByRole('region', { name: 'Unsaved changes' })).toContainText('4 unsaved changes');
  await expect(page.getByRole('switch', { name: 'Use Binance for routing' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.screenshot({ path: 'docs/review/configuration.png', fullPage: true, animations: 'disabled' });
  let saves = 0;
  await page.route('**/api/staff/config', async (route) => {
    if (route.request().method() === 'PUT') {
      saves++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Save', exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByText('Configuration saved.', { exact: true })).toBeVisible();
  expect(saves).toBe(1);
  const config = await (await page.request.get('/api/staff/config')).json();
  expect(config.settings.quoteLifetimeSeconds).toBe(30);
  expect(config.organisations.find((org: { id: string }) => org.id === 'harbourline').tier).toBe('Tier 1');
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/staff/venues')).json()).find(
          (venue: { id: string }) => venue.id === 'binance',
        ).status,
    )
    .toBe('disabled');
  await lifetime.fill('45');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(lifetime).toHaveValue('30');
  await page.reload();
  await expect(lifetime).toHaveValue('30');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect((await page.request.post('/api/demo/reset', { data: {} })).ok()).toBe(true);
});
