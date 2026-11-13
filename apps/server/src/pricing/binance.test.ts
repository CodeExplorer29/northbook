import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { BinanceDecoder, binanceMarkets, createBinanceAdapter } from './binance.js';
import { readRecording } from './recording.js';

it('replays Binance market-data-only snapshots and verifies the captured catalogue has no CAD markets', async () => {
  const recording = await readRecording(new URL('../../fixtures/binance.json', import.meta.url));
  expect(new URL(recording.source).hostname).toBe('data-stream.binance.vision');
  const adapter = createBinanceAdapter({ feeRate: '0.001', recording });
  const sessions: Set<string>[] = [];
  const failures: string[] = [];
  let books = 0;
  await adapter.start((event) => {
    if (event.type === 'health' && event.health.status === 'resynchronising') {
      if (event.health.detail) failures.push(event.health.detail);
      sessions.push(new Set());
      expect(adapter.books()).toEqual([]);
    }
    if (event.type === 'book') {
      sessions.at(-1)!.add(event.book.market.symbol);
      books++;
      expect(event.book.replayed).toBe(true);
      expect(event.book.bids.length).toBeLessThanOrEqual(20);
      expect(event.book.asks.length).toBeLessThanOrEqual(20);
    }
  });
  expect(failures).toEqual([]);
  expect(sessions).toHaveLength(2);
  for (const session of sessions)
    expect([...session].sort()).toEqual(binanceMarkets.map((market) => market.symbol).sort());
  expect(books).toBe(
    recording.frames.filter((frame) => frame.kind === 'message' && JSON.parse(frame.data).stream).length,
  );
  const catalogue = JSON.parse(
    await readFile(new URL('../../fixtures/binance-markets.json', import.meta.url), 'utf8'),
  ) as {
    total: number;
    cadMarkets: string[];
    selected: { symbol: string; status: string }[];
  };
  expect(catalogue.total).toBeGreaterThan(0);
  expect(catalogue.cadMarkets).toEqual([]);
  expect(catalogue.selected.map((market) => market.symbol).sort()).toEqual(
    binanceMarkets.map((market) => market.symbol.replace('/', '')).sort(),
  );
  expect(catalogue.selected.every((market) => market.status === 'TRADING')).toBe(true);
  expect(binanceMarkets.every((market) => market.base !== 'CAD' && market.quote !== 'CAD')).toBe(true);
  await adapter.stop();
});

it('uses complete snapshots, rejects older IDs and preserves integers above Number precision', () => {
  const decoder = new BinanceDecoder();
  const message = (sequence: string, bid: string) =>
    `{"stream":"ethusdt@depth20@100ms","data":{"lastUpdateId":${sequence},"bids":[["${bid}","0.123456789012345678"]],"asks":[["5","2"]]}}`;
  const [first] = decoder.receive(message('9007199254740993', '1'), 1, false);
  expect(first!.sequence).toBe('9007199254740993');
  expect(first!.bids[0]!.size).toBe('0.123456789012345678');
  expect(decoder.receive(message('9007199254740992', '2'), 2, false)).toEqual([]);
  const [next] = decoder.receive(message('9007199254741000', '3'), 3, false);
  expect(next!.bids).toEqual([{ price: '3', size: '0.123456789012345678' }]);
  expect(decoder.receive(message('9007199254741000', '3'), 4, false)[0]!.receivedAt).toBe(4);
  decoder.reset();
  expect(decoder.receive(message('1', '1'), 5, false)).toHaveLength(1);
});
