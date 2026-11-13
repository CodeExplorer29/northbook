import { currencySchema } from '@northbook/shared';
import { z } from 'zod';
import { FeedAdapter, type BookDecoder } from './feed-adapter.js';
import { PriceLevels } from './price-levels.js';
import type { Recording } from './recording.js';
import { normaliseBook, type Market, type OrderBook } from './venue.js';

// Public product catalogue checked when recording; delisted USDC crypto pairs
// are excluded. There is no BTC/CAD or ETH/CAD market at this venue.
export const coinbaseMarkets: readonly Market[] = [
  'BTC/USD',
  'ETH/USD',
  'BTC/USDT',
  'ETH/USDT',
  'USDT/USD',
  'USDC/CAD',
  'USDT/USDC',
].map((symbol) => {
  const [base, quote] = symbol.split('/');
  return { symbol, base: currencySchema.parse(base), quote: currencySchema.parse(quote) };
});
const level = z.tuple([z.string(), z.string()]);
const snapshotSchema = z.object({
  type: z.literal('snapshot'),
  product_id: z.string(),
  asks: z.array(level),
  bids: z.array(level),
});
const updateSchema = z.object({
  type: z.literal('l2update'),
  product_id: z.string(),
  time: z.string(),
  changes: z.array(z.tuple([z.enum(['buy', 'sell']), z.string(), z.string()])),
});

export class CoinbaseDecoder implements BookDecoder {
  readonly markets = coinbaseMarkets;
  private books = new Map<string, { bids: PriceLevels; asks: PriceLevels }>();
  reset() {
    this.books.clear();
  }
  receive(message: string, receivedAt: number, replayed: boolean): OrderBook[] {
    const raw = z
      .object({ type: z.string(), product_id: z.string().optional() })
      .passthrough()
      .parse(JSON.parse(message));
    if (raw.type === 'error') throw new Error('Coinbase subscription rejected.');
    if (raw.type !== 'snapshot' && raw.type !== 'l2update') return [];
    const market = this.markets.find((item) => item.symbol === raw.product_id?.replace('-', '/'));
    if (!market) return [];
    if (raw.type === 'snapshot') {
      const snapshot = snapshotSchema.parse(raw);
      const book = { bids: new PriceLevels(true), asks: new PriceLevels(false) };
      book.bids.replace(snapshot.bids);
      book.asks.replace(snapshot.asks);
      this.books.set(market.symbol, book);
    } else {
      const update = updateSchema.parse(raw);
      const book = this.books.get(market.symbol);
      if (!book) return [];
      for (const [side, price, size] of update.changes)
        book[side === 'buy' ? 'bids' : 'asks'].set(price, size);
    }
    const book = this.books.get(market.symbol)!;
    return [
      normaliseBook({
        venue: 'coinbase',
        market,
        bids: book.bids.top(100),
        asks: book.asks.top(100),
        receivedAt,
        replayed,
      }),
    ];
  }
}

export function createCoinbaseAdapter(options: {
  feeRate: string;
  recording?: Recording;
  loop?: boolean;
  speed?: number;
}) {
  let marketIndex = 0;
  return new FeedAdapter({
    ...options,
    id: 'coinbase',
    url: 'wss://ws-feed.exchange.coinbase.com',
    decoder: new CoinbaseDecoder(),
    subscription: {
      type: 'subscribe',
      product_ids: coinbaseMarkets.map((market) => market.symbol.replace('/', '-')),
      channels: ['level2_batch', 'heartbeat'],
    },
    async poll(signal) {
      const market = coinbaseMarkets[marketIndex++ % coinbaseMarkets.length]!;
      const url = `https://api.exchange.coinbase.com/products/${market.symbol.replace('/', '-')}/book?level=2`;
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
      if (!response.ok) throw new Error('Coinbase snapshot unavailable.');
      const row = z.tuple([z.string(), z.string(), z.number()]);
      const data = z.object({ bids: z.array(row), asks: z.array(row) }).parse(await response.json());
      const levels = (rows: [string, string, number][]) =>
        rows.slice(0, 100).map(([price, size]) => ({ price, size }));
      return normaliseBook({
        venue: 'coinbase',
        market,
        bids: levels(data.bids),
        asks: levels(data.asks),
        receivedAt: Date.now(),
        replayed: false,
      });
    },
  });
}
