import { expect, test } from '@playwright/test';
import { quoteMachine, tradeMachine, kybMachine } from '../packages/shared/src/index.js';

test('public architecture covers the implementation, generated diagrams and phone readability', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/architecture');
  await expect(
    page.getByRole('heading', { name: 'An OTC trading desk, built spec-first with AI.' }),
  ).toBeVisible();
  for (const title of [
    'Overview',
    'From order book to quote',
    'Quote lifecycle',
    'Trade lifecycle',
    'Exactly one trade per quote',
    'Ledger',
    'What is real, mocked, and planned',
    'Technology',
  ])
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'On this page' })).toHaveCSS('position', 'sticky');
  const article = page.locator('article');
  for (const text of [
    'Idempotency-Key',
    'idempotency_conflict',
    'idempotency_in_progress',
    'UNIQUE (quote_id)',
    '410  quote_expired',
    '191,160.73 CAD',
    '207,892.32 CAD',
    'reversing transactions',
    'bank webhooks',
    'chain watchers',
    'two-factor authentication',
    'reconciliation',
    'TypeScript',
    'Fastify',
    'PostgreSQL',
    'Next.js',
    'Decimal.js',
    'Railway',
  ])
    await expect(article).toContainText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  await expect(article).not.toContainText('[placeholder]');
  for (const [name, machine] of [
    ['quote', quoteMachine],
    ['trade', tradeMachine],
    ['kyb', kybMachine],
  ] as const) {
    const response = await page.request.get(`/diagrams/${name}.svg`);
    expect(response.ok()).toBe(true);
    const svg = await response.text();
    for (const state of machine.states) expect(svg).toContain(`data-state="${state}"`);
    const diagram = page.locator(`img[src="/diagrams/${name}.svg"]`);
    await expect(diagram).toBeVisible();
    expect(await diagram.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(
      true,
    );
  }
  await page.screenshot({ path: 'docs/review/architecture.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole('navigation', { name: 'On this page' })).toHaveCSS('position', 'static');
  const trade = page.getByRole('region', { name: 'Trade lifecycle diagram', exact: true });
  expect(
    await trade.evaluate(
      (element) =>
        element.scrollWidth > element.clientWidth && getComputedStyle(element).overflowX === 'auto',
    ),
  ).toBe(true);
  await trade.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  expect(await trade.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page
    .getByRole('navigation', { name: 'On this page' })
    .getByRole('link', { name: /Technology/ })
    .click();
  await expect(page).toHaveURL(/#tech$/);
  await page.screenshot({ path: 'docs/review/architecture-mobile.png', fullPage: true });
});
