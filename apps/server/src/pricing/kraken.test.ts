import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createKrakenAdapter, KrakenDecoder, krakenChecksum } from './kraken.js';
import { recordingSchema, type Recording } from './recording.js';
import type { OrderBook, VenueEvent } from './venue.js';

async function recording() {
  return recordingSchema.parse(
    JSON.parse(await readFile(new URL('../../fixtures/kraken.json', import.meta.url), 'utf8')),
  );
}

it('reconstructs every captured update with valid checksums and resynchronises all markets after disconnect', async () => {
  const fixture = await recording();
  const adapter = createKrakenAdapter({ feeRate: '0.0026', recording: fixture });
  const events: VenueEvent[] = [];
  const sessions: Set<string>[] = [];
  await adapter.start((event) => {
    events.push(event);
    if (event.type === 'health' && event.health.status === 'resynchronising') {
      expect(adapter.books()).toEqual([]);
      sessions.push(new Set());
    }
    if (event.type === 'health' && event.health.status === 'disconnected')
      expect(adapter.books()).toEqual([]);
    if (event.type === 'book') sessions.at(-1)!.add(event.book.market.symbol);
  });
  expect(
    events.filter((event) => event.type === 'health' && event.health.detail?.includes('mismatch')),
  ).toEqual([]);
  expect(sessions).toHaveLength(2);
  for (const session of sessions)
    expect([...session].sort()).toEqual(adapter.markets.map((market) => market.symbol).sort());
  const books = events.filter((event): event is { type: 'book'; book: OrderBook } => event.type === 'book');
  const bookFrames = fixture.frames.filter((frame) => frame.kind === 'message' && frame.data.startsWith('['));
  expect(books).toHaveLength(bookFrames.length);
  expect(
    books.every(
      (event) => event.book.replayed && event.book.asks.length <= 100 && event.book.bids.length <= 100,
    ),
  ).toBe(true);
  expect(adapter.health().status).toBe('disconnected');
  expect(adapter.takerFee('BTC/CAD')).toBe('0.0026');
  await adapter.stop();
}, 20000);

it('invalidates corrupted books and ignores deltas until a new snapshot arrives', async () => {
  const fixture = await recording();
  const snapshot = fixture.frames.find((frame) => frame.kind === 'message' && frame.data.includes('"as":'))!;
  if (snapshot.kind !== 'message') throw new Error('Missing snapshot');
  const decoder = new KrakenDecoder();
  const [first] = decoder.receive(snapshot.data, 1, true);
  expect(first).toBeDefined();
  const symbol = first!.market.symbol.replace('BTC/', 'XBT/');
  const bad = JSON.stringify([
    0,
    { b: [[first!.bids[0]!.price, '999999', '1']], c: '0' },
    'book-100',
    symbol,
  ]);
  expect(() => decoder.receive(bad, 2, true)).toThrow('checksum mismatch');
  expect(decoder.receive(bad, 3, true)).toEqual([]);
  expect(decoder.receive(snapshot.data, 4, true)).toHaveLength(1);
  const replay: Recording = {
    ...fixture,
    frames: [
      { kind: 'connected', atMs: 0 },
      { ...snapshot, atMs: 1 },
      { kind: 'message', atMs: 2, data: bad },
      { kind: 'message', atMs: 3, data: bad },
      { ...snapshot, atMs: 4 },
    ],
  };
  const adapter = createKrakenAdapter({ feeRate: '0.0026', recording: replay });
  const statuses: string[] = [];
  await adapter.start((event) => {
    if (event.type === 'health') statuses.push(event.health.status);
  });
  expect(statuses).toEqual(['connecting', 'resynchronising', 'connected', 'resynchronising', 'connected']);
  expect(adapter.books()).toHaveLength(1);
  await adapter.stop();
  expect(adapter.books()).toEqual([]);
});

it('applies updates in wire order, deletes zero volume and preserves checksum digits', () => {
  const decoder = new KrakenDecoder();
  decoder.receive(
    JSON.stringify([
      0,
      { as: [['2.00000', '1.00000000', '1']], bs: [['1.00000', '1.00000000', '1']] },
      'book-100',
      'ETH/CAD',
    ]),
    1,
    false,
  );
  const asks = [{ price: '2.00000', size: '1.00000000' }];
  const bids = [{ price: '0.90000', size: '3.00000000' }];
  const [book] = decoder.receive(
    JSON.stringify([
      0,
      {
        b: [
          ['1.00000', '0.00000000', '3'],
          ['0.90000', '2.00000000', '3'],
          ['0.90000', '3.00000000', '2'],
        ],
        c: krakenChecksum(asks, bids),
      },
      'book-100',
      'ETH/CAD',
    ]),
    2,
    false,
  );
  expect(book!.bids).toEqual(bids);
  expect(book!.replayed).toBe(false);
});
