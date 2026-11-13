import { crc32 } from 'node:zlib';
import { Money, currencySchema } from '@northbook/shared';
import { z } from 'zod';
import { FeedAdapter, type BookDecoder } from './feed-adapter.js';
import type { Recording } from './recording.js';
import { normaliseBook, type Market, type OrderBook, type PriceLevel } from './venue.js';

export const krakenMarkets: readonly Market[] = [
  'BTC/CAD',
  'ETH/CAD',
  'USDC/CAD',
  'USDT/CAD',
  'BTC/USD',
  'ETH/USD',
  'USDC/USD',
  'USDT/USD',
  'USD/CAD',
].map((symbol) => {
  const [base, quote] = symbol.split('/');
  return { symbol, base: currencySchema.parse(base), quote: currencySchema.parse(quote) };
});
const wireSymbol = (symbol: string) => symbol.replace('BTC/', 'XBT/');
const levelSchema = z.tuple([z.string(), z.string(), z.union([z.string(), z.number()])]).rest(z.string());
const updateSchema = z.object({
  as: z.array(levelSchema).optional(),
  bs: z.array(levelSchema).optional(),
  a: z.array(levelSchema).optional(),
  b: z.array(levelSchema).optional(),
  c: z.string().optional(),
});
type Level = z.infer<typeof levelSchema>;
type LocalBook = { bids: Map<string, PriceLevel>; asks: Map<string, PriceLevel> };
const sorted = (levels: Map<string, PriceLevel>, descending = false) =>
  [...levels.values()].sort((a, b) => new Money(a.price).cmp(b.price) * (descending ? -1 : 1));

export function krakenChecksum(asks: PriceLevel[], bids: PriceLevel[]) {
  const digits = (value: string) => value.replace('.', '').replace(/^0+/, '');
  return String(
    crc32(
      [...asks.slice(0, 10), ...bids.slice(0, 10)]
        .map((level) => digits(level.price) + digits(level.size))
        .join(''),
    ),
  );
}

export class KrakenDecoder implements BookDecoder {
  readonly markets = krakenMarkets;
  private books = new Map<string, LocalBook>();
  reset() {
    this.books.clear();
  }
  receive(message: string, receivedAt: number, replayed: boolean): OrderBook[] {
    const raw: unknown = JSON.parse(message);
    if (!Array.isArray(raw)) {
      if (raw && typeof raw === 'object' && 'status' in raw && raw.status === 'error')
        throw new Error('Kraken subscription rejected.');
      return [];
    }
    const symbol = String(raw.at(-1)).replace('XBT/', 'BTC/');
    const market = this.markets.find((item) => item.symbol === symbol);
    if (!market || raw.at(-2) !== 'book-100') return [];
    const updates = raw.slice(1, -2).map((part) => updateSchema.parse(part));
    const snapshot = updates.some((update) => update.as && update.bs);
    if (snapshot) this.books.set(symbol, { bids: new Map(), asks: new Map() });
    const book = this.books.get(symbol);
    if (!book) return [];
    const apply = (levels: Level[] | undefined, side: Map<string, PriceLevel>) => {
      for (const [price, size] of levels ?? []) {
        const key = new Money(price).toFixed();
        if (new Money(size).isZero()) side.delete(key);
        else side.set(key, { price, size });
      }
    };
    let checksum: string | undefined;
    for (const update of updates) {
      apply(update.as ?? update.a, book.asks);
      apply(update.bs ?? update.b, book.bids);
      checksum = update.c ?? checksum;
    }
    const asks = sorted(book.asks).slice(0, 100);
    const bids = sorted(book.bids, true).slice(0, 100);
    book.asks = new Map(asks.map((level) => [new Money(level.price).toFixed(), level]));
    book.bids = new Map(bids.map((level) => [new Money(level.price).toFixed(), level]));
    if (checksum && krakenChecksum(asks, bids) !== checksum) {
      this.reset();
      throw new Error(`Kraken checksum mismatch for ${symbol}.`);
    }
    return [normaliseBook({ venue: 'kraken', market, asks, bids, receivedAt, replayed })];
  }
}

export function createKrakenAdapter(options: {
  feeRate: string;
  recording?: Recording;
  loop?: boolean;
  speed?: number;
}) {
  let marketIndex = 0;
  return new FeedAdapter({
    ...options,
    id: 'kraken',
    url: 'wss://ws.kraken.com',
    decoder: new KrakenDecoder(),
    subscription: {
      event: 'subscribe',
      pair: krakenMarkets.map((market) => wireSymbol(market.symbol)),
      subscription: { name: 'book', depth: 100 },
    },
    async poll(signal) {
      const market = krakenMarkets[marketIndex++ % krakenMarkets.length]!;
      const url = new URL('https://api.kraken.com/0/public/Depth');
      url.searchParams.set('pair', wireSymbol(market.symbol).replace('/', ''));
      url.searchParams.set('count', '100');
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
      if (!response.ok) throw new Error('Kraken snapshot unavailable.');
      const result = z
        .object({
          error: z.array(z.string()),
          result: z.record(z.string(), z.object({ asks: z.array(levelSchema), bids: z.array(levelSchema) })),
        })
        .parse(await response.json());
      if (result.error.length) throw new Error('Kraken snapshot rejected.');
      const book = Object.values(result.result)[0];
      if (!book) throw new Error('Kraken snapshot missing.');
      const levels = (rows: Level[]) => rows.map(([price, size]) => ({ price, size }));
      return normaliseBook({
        venue: 'kraken',
        market,
        asks: levels(book.asks),
        bids: levels(book.bids),
        receivedAt: Date.now(),
        replayed: false,
      });
    },
  });
}
