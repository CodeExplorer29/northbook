import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { normaliseBook, type OrderBook, type VenueAdapter, type VenueEvent } from './venue.js';
import { recordingSchema, replayRecording } from './recording.js';

it('accepts a fake adapter through the contract with exact, sorted, detached levels', async () => {
  const market = { symbol: 'ETH/CAD', base: 'ETH', quote: 'CAD' } as const;
  const input: OrderBook = {
    venue: 'kraken',
    market,
    receivedAt: 1000,
    replayed: true,
    bids: [
      { price: '4172.44', size: '0.123456789012345678' },
      { price: '4172.45', size: '50' },
    ],
    asks: [{ price: '4173', size: '70' }],
  };
  const book = normaliseBook(input);
  const health = { venue: 'kraken', status: 'connected', lastUpdate: 1000, replayed: true } as const;
  const adapter: VenueAdapter = {
    id: 'kraken',
    markets: [market],
    takerFee: () => '0.0026',
    async start(listener) {
      listener({ type: 'health', health });
      listener({ type: 'book', book });
    },
    async stop() {},
    health: () => health,
    books: () => [book],
  };
  const events: VenueEvent[] = [];
  await adapter.start((event) => events.push(event));
  expect(events.map((event) => event.type)).toEqual(['health', 'book']);
  expect(adapter.books()[0]!.bids.map((level) => level.price)).toEqual(['4172.45', '4172.44']);
  expect(book.bids[1]!.size).toBe('0.123456789012345678');
  input.bids[0]!.size = '999';
  expect(book.bids[1]!.size).toBe('0.123456789012345678');
  expect(adapter.takerFee(market.symbol)).toBe('0.0026');
  await adapter.stop();
  expect(() => normaliseBook({ ...book, asks: [{ price: '1', size: '1' }] })).toThrow('crossed');
  expect(() => normaliseBook({ ...book, bids: [{ price: '1', size: '0' }] })).toThrow();
});

it('replays the captured public Kraken messages including both connection boundaries without changing bytes', async () => {
  const recording = recordingSchema.parse(
    JSON.parse(await readFile(new URL('../../fixtures/kraken.json', import.meta.url), 'utf8')),
  );
  const messages: string[] = [];
  const boundaries: string[] = [];
  const clocks: number[] = [];
  await replayRecording(
    recording,
    (frame, time) => {
      clocks.push(time);
      if (frame.kind === 'message') messages.push(frame.data);
      else boundaries.push(frame.kind);
    },
    { baseTime: 100000 },
  );
  expect(boundaries).toEqual(['connected', 'disconnected', 'connected', 'disconnected']);
  expect(messages).toEqual(
    recording.frames.flatMap((frame) => (frame.kind === 'message' ? [frame.data] : [])),
  );
  expect(messages.filter((message) => message.includes('"as":')).length).toBeGreaterThanOrEqual(
    recording.markets.length * 2,
  );
  expect(clocks).toEqual([...clocks].sort((a, b) => a - b));
  expect(clocks[0]).toBe(100000 + recording.frames[0]!.atMs);
});
