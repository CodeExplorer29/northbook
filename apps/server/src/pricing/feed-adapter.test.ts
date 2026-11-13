import { afterEach, expect, it, vi } from 'vitest';
import { FeedAdapter } from './feed-adapter.js';
import type { OrderBook, VenueEvent } from './venue.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('clears books on a live feed failure, polls safely, reconnects and cancels all work on stop', async () => {
  vi.useFakeTimers();
  const sockets: FakeSocket[] = [];
  class FakeSocket extends EventTarget {
    static OPEN = 1;
    readyState = 0;
    sent: unknown[] = [];
    constructor() {
      super();
      sockets.push(this);
    }
    send(data: string) {
      this.sent.push(JSON.parse(data));
    }
    open() {
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    }
    close() {
      this.readyState = 3;
      this.dispatchEvent(new Event('close'));
    }
    message(data: string) {
      this.dispatchEvent(new MessageEvent('message', { data }));
    }
  }
  vi.stubGlobal('WebSocket', FakeSocket);
  const market = { symbol: 'ETH/CAD', base: 'ETH', quote: 'CAD' } as const;
  const book: OrderBook = {
    venue: 'kraken',
    market,
    asks: [{ price: '2', size: '3' }],
    bids: [{ price: '1', size: '4' }],
    receivedAt: 1,
    replayed: false,
  };
  const reset = vi.fn();
  const poll = vi.fn(async () => ({ ...book, receivedAt: 2 }));
  const events: VenueEvent[] = [];
  const adapter = new FeedAdapter({
    id: 'kraken',
    url: 'wss://example.invalid',
    subscription: { subscribe: 'test' },
    feeRate: '0.0026',
    poll,
    decoder: {
      markets: [market],
      reset,
      receive(message) {
        if (message === 'invalid') throw new Error('Invalid test checksum');
        return [book];
      },
    },
  });
  await adapter.start((event) => events.push(event));
  sockets[0]!.open();
  sockets[0]!.message('snapshot');
  expect(sockets[0]!.sent).toEqual([{ subscribe: 'test' }]);
  expect(adapter.books()).toHaveLength(1);
  sockets[0]!.message('invalid');
  expect(adapter.books()).toEqual([]);
  expect(adapter.health().status).toBe('disconnected');
  await vi.advanceTimersByTimeAsync(1000);
  expect(sockets).toHaveLength(2);
  expect(poll).toHaveBeenCalledOnce();
  expect(adapter.health().status).toBe('polling');
  expect(adapter.books()[0]!.receivedAt).toBe(2);
  sockets[1]!.open();
  expect(adapter.books()).toEqual([]);
  sockets[1]!.message('new snapshot');
  expect(adapter.health().status).toBe('connected');
  await adapter.stop();
  await vi.advanceTimersByTimeAsync(60000);
  expect(sockets).toHaveLength(2);
  expect(poll).toHaveBeenCalledOnce();
  expect(adapter.books()).toEqual([]);
  expect(reset.mock.calls.length).toBeGreaterThanOrEqual(4);
  expect(
    events.some((event) => event.type === 'health' && event.health.detail === 'Invalid test checksum'),
  ).toBe(true);
});
