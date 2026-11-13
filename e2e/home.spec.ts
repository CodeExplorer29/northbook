import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Home follows the desktop design, streams without shifting, and stacks at phone width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('OTC trading,priced to the last cent.');
  const widget = page.getByRole('region', { name: 'Indicative conversion', exact: true });
  await expect(widget.getByLabel('You receive', { exact: true })).not.toHaveValue('');
  const sections = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(sections).toEqual(
    expect.arrayContaining([
      'Why Northbook',
      'Deep books.Exact settlement.',
      'Bespoke pricingfor meaningful size.',
      'From RFQ to payoutin three steps.',
      'Frequently asked questions',
      'Ready to start?',
    ]),
  );
  const before = await widget.boundingBox();
  const updates = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const stream = new EventSource('/api/public/prices/stream?pair=ETH%2FCAD');
        let count = 0;
        const timeout = setTimeout(() => {
          stream.close();
          reject(new Error('No live updates'));
        }, 6000);
        stream.onmessage = () => {
          if (++count === 2) {
            stream.close();
            clearTimeout(timeout);
            resolve(count);
          }
        };
      }),
  );
  expect(updates).toBe(2);
  expect(await widget.boundingBox()).toEqual(before);
  await widget.getByRole('button', { name: 'Get a firm quote', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Choose a demo persona' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const headline = await page.getByRole('heading', { level: 1 }).boundingBox();
  const mobileWidget = await widget.boundingBox();
  expect(mobileWidget!.y).toBeGreaterThan(headline!.y + headline!.height);
});

test('Home replaces stale or disconnected market data without retaining a computed amount', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.addInitScript(() => {
    const sources: {
      url: string;
      onmessage: ((event: { data: string }) => void) | null;
      onerror: (() => void) | null;
      close: () => void;
    }[] = [];
    Object.assign(window, { marketSources: sources });
    class Feed {
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly url: string) {
        sources.push(this);
      }
      close() {}
    }
    Object.defineProperty(window, 'EventSource', { value: Feed });
  });
  await page.goto('/');
  const widget = page.getByRole('region', { name: 'Indicative conversion', exact: true });
  await expect(widget.getByRole('status', { name: 'Computing amount' })).toBeVisible();
  await page.evaluate(() => {
    const sources = (
      window as unknown as { marketSources: { onmessage: (event: { data: string }) => void }[] }
    ).marketSources;
    sources.at(-1)!.onmessage({
      data: JSON.stringify({
        status: 'ready',
        pair: 'ETH/CAD',
        side: 'SELL',
        indicative: true,
        unitPrice: '4183.20',
        updatedAt: new Date(Date.now() - 6000).toISOString(),
        replayed: false,
        cadPerQuote: '1',
        minimumTradeCad: '10000',
      }),
    });
  });
  await expect(widget.getByRole('status').filter({ hasText: 'Waiting for price updates' })).toBeVisible();
  await expect(widget.getByLabel('You receive', { exact: true })).toHaveValue('');
  await page.evaluate(() => {
    const sources = (
      window as unknown as { marketSources: { onmessage: (event: { data: string }) => void }[] }
    ).marketSources;
    sources.at(-1)!.onmessage({
      data: JSON.stringify({
        status: 'ready',
        pair: 'ETH/CAD',
        side: 'SELL',
        indicative: true,
        unitPrice: '4183.20',
        updatedAt: new Date().toISOString(),
        replayed: false,
        cadPerQuote: '1',
        minimumTradeCad: '10000',
      }),
    });
  });
  await expect(widget.getByLabel('You receive', { exact: true })).toHaveValue('209160.00');
  // Capture the approved indicative figures deterministically. The preceding
  // test exercises real recorded streams, including their reconnect gaps.
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/home.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/review/home-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  const before = await widget.boundingBox();
  await page.evaluate(() => {
    const sources = (
      window as unknown as { marketSources: { onmessage: (event: { data: string }) => void }[] }
    ).marketSources;
    sources.at(-1)!.onmessage({
      data: JSON.stringify({
        status: 'ready',
        pair: 'ETH/CAD',
        side: 'SELL',
        indicative: true,
        unitPrice: '4200',
        updatedAt: new Date().toISOString(),
        replayed: false,
        cadPerQuote: '1',
        minimumTradeCad: '10000',
      }),
    });
  });
  await expect(widget.getByLabel('You receive', { exact: true })).toHaveValue('210000.00');
  expect(await widget.boundingBox()).toEqual(before);
  await page.evaluate(() => {
    (window as unknown as { marketSources: { onmessage: (event: { data: string }) => void }[] }).marketSources
      .at(-1)!
      .onmessage({
        data: JSON.stringify({
          status: 'unavailable',
          pair: 'ETH/CAD',
          side: 'SELL',
          indicative: true,
          code: 'price_unavailable',
          message: 'Waiting for price updates',
        }),
      });
  });
  await expect(widget.getByLabel('You receive', { exact: true })).toHaveValue('');
  expect(await widget.boundingBox()).toEqual(before);
  await page.evaluate(() => {
    (window as unknown as { marketSources: { onerror: () => void }[] }).marketSources.at(-1)!.onerror();
  });
  await expect(widget.getByRole('status').filter({ hasText: 'Waiting for price updates' })).toBeVisible();
  await expect(widget.getByLabel('You receive', { exact: true })).toHaveValue('');
});
