import { expect, test } from '@playwright/test';
import { readyStaff } from './trading-helpers.js';

test('a web page receives JSON and unbuffered SSE exclusively through web', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    requests.push(request.url());
  });
  await page.goto('/');
  const json = await page.evaluate(async () => {
    const response = await fetch('/api/test/echo', { headers: { 'x-request-id': 'browser-proxy-test' } });
    return { body: await response.json(), requestId: response.headers.get('x-request-id') };
  });
  expect(json).toMatchObject({
    requestId: 'browser-proxy-test',
    body: { source: 'server', requestId: 'browser-proxy-test', forwardedAddress: '127.0.0.1' },
  });
  const health = await page.evaluate(async () => (await fetch('/api/healthz')).json());
  expect(health.pricingMode).toBe('replay');
  expect(health.venues).toHaveLength(3);
  expect(health.venues.every((venue: { replayed: boolean }) => venue.replayed)).toBe(true);
  const events = await page.evaluate(
    () =>
      new Promise<{ sequence: number; time: number }[]>((resolve, reject) => {
        const source = new EventSource('/api/test/stream');
        const received: { sequence: number; time: number }[] = [];
        const timeout = setTimeout(() => {
          source.close();
          reject(new Error('Stream timeout'));
        }, 10000);
        source.onmessage = (event) => {
          const data = JSON.parse(event.data) as { sequence: number };
          received.push({ sequence: data.sequence, time: performance.now() });
          if (received.length === 2) {
            source.close();
            clearTimeout(timeout);
            resolve(received);
          }
        };
      }),
  );
  expect(events.map((event) => event.sequence)).toEqual([1, 2]);
  expect(events[1]!.time - events[0]!.time).toBeGreaterThan(200);
  expect(requests.every((url) => new URL(url).origin === 'http://127.0.0.1:3100')).toBe(true);
});

test('indicative prices stream through the web proxy at least every five seconds', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await readyStaff(request, true);
  const price = await page.evaluate(async () =>
    (await fetch('/api/public/prices/ETH%2FCAD?side=SELL')).json(),
  );
  expect(price).toMatchObject({ pair: 'ETH/CAD', side: 'SELL', indicative: true, replayed: true });
  expect(typeof price.unitPrice).toBe('string');
  const events = await page.evaluate(
    () =>
      new Promise<{ status: string; indicative: boolean; unitPrice?: string; elapsed: number }[]>(
        (resolve, reject) => {
          const source = new EventSource('/api/public/prices/stream?pair=ETH%2FCAD&side=SELL');
          const received: { status: string; indicative: boolean; unitPrice?: string; elapsed: number }[] = [];
          const start = performance.now();
          const timeout = setTimeout(() => {
            source.close();
            reject(new Error('Indicative stream timeout'));
          }, 12000);
          source.onmessage = (event) => {
            received.push({
              ...(JSON.parse(event.data) as { status: string; indicative: boolean; unitPrice?: string }),
              elapsed: performance.now() - start,
            });
            if (received.length >= 2 && received.slice(-2).every((snapshot) => snapshot.status === 'ready')) {
              source.close();
              clearTimeout(timeout);
              resolve(received);
            }
          };
        },
      ),
  );
  // Recorded disconnects can fall between any two samples. Require two
  // consecutive priced events, plus correct cadence and no retained numeric
  // price for every intervening unavailable snapshot.
  expect(
    events
      .slice(-2)
      .every((event) => event.status === 'ready' && event.indicative && typeof event.unitPrice === 'string'),
  ).toBe(true);
  for (const [index, event] of events.entries()) {
    expect(event.indicative).toBe(true);
    if (event.status === 'unavailable') expect(event.unitPrice).toBeUndefined();
    else {
      expect(event.status).toBe('ready');
      expect(typeof event.unitPrice).toBe('string');
    }
    if (index > 0) {
      expect(event.elapsed - events[index - 1]!.elapsed).toBeLessThan(5000);
      expect(event.elapsed - events[index - 1]!.elapsed).toBeGreaterThan(1000);
    }
  }
});

test('local web proxy replaces caller-selected IP headers before forwarding', async ({ page }) => {
  const response = await page.request.get('/api/test/echo', {
    headers: {
      'x-forwarded-for': '203.0.113.99',
      'x-real-ip': '198.51.100.99',
      'x-northbook-proxy': 'forged',
    },
  });
  expect((await response.json()).forwardedAddress).toBe('127.0.0.1');
});
