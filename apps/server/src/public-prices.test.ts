import { afterAll, beforeAll, expect, it } from 'vitest';
import { publicPriceEventSchema, publicPriceSchema } from '@northbook/shared';
import { buildApp } from './app.js';
import { createLogger } from './logging.js';
import { seedIdentity } from './db/seed.js';
import { testDatabase } from './test-database.js';
import { testBooks, testMarketData } from './test-pricing.js';
import type { PricedBook } from './pricing/depth.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof buildApp>;
let books: PricedBook[] = [];
let origin: string;
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.owner.db.transaction((tx) => seedIdentity(tx));
  books = testBooks();
  app = buildApp(fixture.database, createLogger({ write() {} }), {
    pricing: { ...testMarketData, freshBooks: () => books },
  });
  origin = await app.listen({ host: '127.0.0.1', port: 0 });
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});

it('returns public pair metadata and identical prices for different amounts and personas', async () => {
  expect((await app.inject('/api/public/pairs')).json()).toHaveLength(8);
  const url = '/api/public/prices/ETH%2FCAD?side=SELL';
  const small = await app.inject(`${url}&amount=1`);
  const large = await app.inject(`${url}&amount=999999999999`);
  expect(small.statusCode).toBe(200);
  expect(large.statusCode).toBe(200);
  const price = publicPriceSchema.parse(small.json());
  expect(large.json()).toEqual(price);
  expect(price.indicative).toBe(true);
  expect(small.headers['cache-control']).toBe('no-store');
  for (const id of ['maple-trader', 'harbourline-trader', 'staff']) {
    const persona = await app.inject({ method: 'POST', url: '/api/demo/persona', payload: { userId: id } });
    expect(
      (
        await app.inject({
          url,
          headers: { cookie: (persona.headers['set-cookie'] as string).split(';')[0]! },
        })
      ).json(),
    ).toEqual(price);
  }
  expect(price).not.toHaveProperty('marketPrice');
  expect(price).not.toHaveProperty('spreadBps');
  expect(price).not.toHaveProperty('route');
  expect(await fixture.database.db.query.quotes.findMany()).toHaveLength(0);
  expect(await fixture.database.db.query.trades.findMany()).toHaveLength(0);
});
it('returns price_unavailable when a pair has no usable route', async () => {
  const response = await app.inject('/api/public/prices/USDT%2FCAD');
  expect(response.statusCode).toBe(503);
  expect(response.json().error.code).toBe('price_unavailable');
  expect(response.json()).not.toHaveProperty('unitPrice');
});
it('streams an initial price and a replacement unavailable event within five seconds, and closes on shutdown', async () => {
  const controller = new AbortController();
  const response = await fetch(`${origin}/api/public/prices/stream?pair=ETH%2FCAD`, {
    signal: controller.signal,
  });
  expect(response.headers.get('content-type')).toBe('text/event-stream');
  expect(response.headers.get('x-accel-buffering')).toBe('no');
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  async function event() {
    while (!pending.includes('\n\n')) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('Stream closed before event');
      pending += decoder.decode(chunk.value, { stream: true });
    }
    const boundary = pending.indexOf('\n\n');
    const record = pending.slice(0, boundary);
    pending = pending.slice(boundary + 2);
    return publicPriceEventSchema.parse(JSON.parse(record.replace(/^data: /, '')));
  }
  try {
    expect((await event()).status).toBe('ready');
    const started = Date.now();
    books = [];
    const unavailable = await event();
    expect(unavailable.status).toBe('unavailable');
    expect(unavailable).not.toHaveProperty('unitPrice');
    expect(Date.now() - started).toBeLessThan(5000);
    await app.close();
    expect((await reader.read()).done).toBe(true);
  } finally {
    controller.abort();
    books = testBooks();
  }
}, 10000);
