import { expect, it } from 'vitest';
import { CoinbaseDecoder, createCoinbaseAdapter } from './coinbase.js';
import { readRecording } from './recording.js';

it('replays every recorded Coinbase book message across both connections', async () => {
  const recording = await readRecording(new URL('../../fixtures/coinbase.json.gz', import.meta.url));
  const adapter = createCoinbaseAdapter({ feeRate: '0.006', recording });
  const sessions: Set<string>[] = [];
  const failures: string[] = [];
  let updates = 0;
  await adapter.start((event) => {
    if (event.type === 'health' && event.health.status === 'resynchronising') {
      if (event.health.detail) failures.push(event.health.detail);
      expect(adapter.books()).toEqual([]);
      sessions.push(new Set());
    }
    if (event.type === 'book') {
      sessions.at(-1)!.add(event.book.market.symbol);
      updates++;
      expect(event.book.replayed).toBe(true);
      expect(event.book.bids.length).toBeLessThanOrEqual(100);
    }
  });
  expect(failures).toEqual([]);
  expect(sessions).toHaveLength(2);
  for (const session of sessions)
    expect([...session].sort()).toEqual(adapter.markets.map((market) => market.symbol).sort());
  const frames = recording.frames.filter(
    (frame) => frame.kind === 'message' && ['snapshot', 'l2update'].includes(JSON.parse(frame.data).type),
  );
  expect(updates).toBe(frames.length);
  expect(adapter.markets.some((market) => market.symbol === 'BTC/CAD')).toBe(false);
  expect(adapter.markets.some((market) => market.symbol === 'USDC/CAD')).toBe(true);
  expect(adapter.health().status).toBe('disconnected');
  await adapter.stop();
}, 20000);

it('replaces absolute sizes, removes levels, reveals retained depth and ignores updates before snapshot', () => {
  const decoder = new CoinbaseDecoder();
  const update = (changes: string[][]) =>
    JSON.stringify({ type: 'l2update', product_id: 'ETH-USD', time: '2026-11-12T00:00:00Z', changes });
  expect(decoder.receive(update([['buy', '100', '1']]), 0, false)).toEqual([]);
  const bids = Array.from({ length: 101 }, (_, index) => [String(101 - index), '1']);
  const [snapshot] = decoder.receive(
    JSON.stringify({ type: 'snapshot', product_id: 'ETH-USD', bids, asks: [['102', '2']] }),
    1,
    false,
  );
  expect(snapshot!.bids).toHaveLength(100);
  expect(snapshot!.bids.at(-1)!.price).toBe('2');
  const [updated] = decoder.receive(
    update([
      ['buy', '101', '0'],
      ['buy', '100.0', '0.123456789012345678'],
    ]),
    2,
    false,
  );
  expect(updated!.bids[0]).toEqual({ price: '100.0', size: '0.123456789012345678' });
  expect(updated!.bids.at(-1)!.price).toBe('1');
  expect(updated!.receivedAt).toBe(2);
  decoder.reset();
  expect(decoder.receive(update([['buy', '100', '2']]), 3, false)).toEqual([]);
});
