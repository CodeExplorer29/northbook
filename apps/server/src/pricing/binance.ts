import { currencySchema } from '@northbook/shared';
import { z } from 'zod';
import { FeedAdapter, type BookDecoder } from './feed-adapter.js';
import type { Recording } from './recording.js';
import { normaliseBook, type Market, type OrderBook } from './venue.js';

export const binanceMarkets: readonly Market[] = [
  'BTC/USDT',
  'ETH/USDT',
  'BTC/USDC',
  'ETH/USDC',
  'USDC/USDT',
].map((symbol) => {
  const [base, quote] = symbol.split('/');
  return { symbol, base: currencySchema.parse(base), quote: currencySchema.parse(quote) };
});
export const binanceSubscription = {
  method: 'SUBSCRIBE',
  params: binanceMarkets.map((market) => `${market.symbol.replace('/', '').toLowerCase()}@depth20@100ms`),
  id: 'northbook-public-depth',
};
const levels = z.array(z.tuple([z.string(), z.string()]));
const snapshotSchema = z.object({ lastUpdateId: z.string().regex(/^\d+$/), bids: levels, asks: levels });

// Node 24 supplies the original token to the reviver. Sequence IDs never pass
// through a Number conversion, even after they exceed the safe integer range.
export function parseWireJson(message: string): unknown {
  return JSON.parse(message, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== 'number') return value;
    if (!context?.source) throw new Error('Lossless JSON parsing requires Node 24 or later.');
    return context.source;
  });
}
function snapshotBook(
  data: z.infer<typeof snapshotSchema>,
  market: Market,
  receivedAt: number,
  replayed: boolean,
) {
  const rows = (items: [string, string][]) => items.map(([price, size]) => ({ price, size }));
  return normaliseBook({
    venue: 'binance',
    market,
    bids: rows(data.bids),
    asks: rows(data.asks),
    sequence: data.lastUpdateId,
    receivedAt,
    replayed,
  });
}

export class BinanceDecoder implements BookDecoder {
  readonly markets = binanceMarkets;
  private sequences = new Map<string, bigint>();
  reset() {
    this.sequences.clear();
  }
  receive(message: string, receivedAt: number, replayed: boolean): OrderBook[] {
    const raw = z
      .object({ stream: z.string().optional(), data: z.unknown().optional(), code: z.string().optional() })
      .passthrough()
      .parse(parseWireJson(message));
    if (raw.code) throw new Error('Binance subscription rejected.');
    if (!raw.stream) return [];
    const market = this.markets.find(
      (item) => `${item.symbol.replace('/', '').toLowerCase()}@depth20@100ms` === raw.stream,
    );
    if (!market) return [];
    const data = snapshotSchema.parse(raw.data);
    const sequence = BigInt(data.lastUpdateId);
    const previous = this.sequences.get(market.symbol);
    if (previous !== undefined && sequence < previous) return [];
    const book = snapshotBook(data, market, receivedAt, replayed);
    // Every message replaces the complete top 20. Gaps need no delta recovery;
    // equal IDs are fresh snapshots of an unchanged book, never extra liquidity.
    this.sequences.set(market.symbol, sequence);
    return [book];
  }
}

export function createBinanceAdapter(options: {
  feeRate: string;
  recording?: Recording;
  loop?: boolean;
  speed?: number;
}) {
  let marketIndex = 0;
  return new FeedAdapter({
    ...options,
    id: 'binance',
    url: 'wss://data-stream.binance.vision/stream',
    subscription: binanceSubscription,
    decoder: new BinanceDecoder(),
    async poll(signal) {
      const market = binanceMarkets[marketIndex++ % binanceMarkets.length]!;
      const url = `https://data-api.binance.vision/api/v3/depth?symbol=${market.symbol.replace('/', '')}&limit=100`;
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
      if (!response.ok) throw new Error('Binance snapshot unavailable.');
      return snapshotBook(
        snapshotSchema.parse(parseWireJson(await response.text())),
        market,
        Date.now(),
        false,
      );
    },
  });
}
