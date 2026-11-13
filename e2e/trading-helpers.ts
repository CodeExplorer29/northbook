import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { quoteResponseSchema, tradeResponseSchema, type QuoteRequest } from '../packages/shared/src/index.js';

export async function readyStaff(request: APIRequestContext, restartReplay = false) {
  await request.post('/api/demo/persona', { data: { userId: 'staff' } });
  if (restartReplay) {
    // Rewind the real recordings through the public staff controls. Begin quote
    // scenarios after initial depth, away from the recorded disconnect boundary;
    // never retry or substitute the quote request whose response is asserted.
    for (const enabled of [false, true]) {
      for (const id of ['kraken', 'coinbase', 'binance'])
        expect((await request.put(`/api/staff/venues/${id}`, { data: { enabled } })).ok()).toBe(true);
      if (!enabled)
        await expect
          .poll(async () => {
            const venues = await (await request.get('/api/staff/venues')).json();
            return venues.every((venue: { status: string }) => venue.status === 'disabled');
          })
          .toBe(true);
    }
  }
  await expect
    .poll(
      async () => {
        const venues = await (await request.get('/api/staff/venues')).json();
        return venues.filter(
          (venue: { id: string; readyMarkets: number; status: string }) =>
            (venue.id === 'kraken' && venue.readyMarkets === 9 && venue.status === 'connected') ||
            (venue.id === 'binance' && venue.readyMarkets === 5 && venue.status === 'connected'),
        ).length;
      },
      { timeout: 20000, intervals: [100] },
    )
    .toBe(2);
}
export async function bookTrade(
  page: Page,
  input: QuoteRequest = { pair: 'ETH/CAD', side: 'SELL', fixed: 'base', amount: '50' },
) {
  await page.request.post('/api/demo/persona', { data: { userId: 'maple-trader' } });
  let issued = await page.request.post('/api/quotes', {
    data: input,
    headers: { 'idempotency-key': randomUUID() },
  });
  // This helper prepares a booked trade for settlement/detail tests. Recorded
  // reconnects can briefly remove executable depth; only those explicit, safe
  // refusals may be retried. The UI quote tests assert their own first response.
  for (let attempt = 0; attempt < 20 && issued.status() !== 201; attempt++) {
    const body = await issued.json();
    if (!['price_unavailable', 'insufficient_liquidity'].includes(body.error?.code)) break;
    await delay(250);
    issued = await page.request.post('/api/quotes', {
      data: input,
      headers: { 'idempotency-key': randomUUID() },
    });
  }
  expect(issued.status(), await issued.text()).toBe(201);
  const quote = quoteResponseSchema.parse(await issued.json());
  const accepted = await page.request.post(`/api/quotes/${quote.id}/accept`, {
    data: {},
    headers: { 'idempotency-key': randomUUID() },
  });
  expect(accepted.status()).toBe(200);
  return tradeResponseSchema.parse(await accepted.json());
}
export async function applyEvent(request: APIRequestContext, id: string, action: string, reason?: string) {
  const response = await request.post(`/api/staff/trades/${id}/events`, {
    data: { action, ...(reason ? { reason } : {}) },
    headers: { 'idempotency-key': randomUUID() },
  });
  expect(response.status(), await response.text()).toBe(200);
}
