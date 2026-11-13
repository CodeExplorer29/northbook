import { Money, currencySchema, positiveAmountSchema, type Currency } from '@northbook/shared';

export type VenueId = 'kraken' | 'coinbase' | 'binance';
export interface Market {
  symbol: string;
  base: Currency;
  quote: Currency;
}
export interface PriceLevel {
  price: string;
  size: string;
}
export interface OrderBook {
  venue: VenueId;
  market: Market;
  bids: PriceLevel[];
  asks: PriceLevel[];
  receivedAt: number;
  sequence?: string;
  replayed: boolean;
}
export interface VenueHealth {
  venue: VenueId;
  status: 'connecting' | 'connected' | 'resynchronising' | 'disconnected' | 'polling';
  lastUpdate: number | null;
  replayed: boolean;
  detail?: string;
}
export type VenueEvent = { type: 'book'; book: OrderBook } | { type: 'health'; health: VenueHealth };
export type VenueListener = (event: VenueEvent) => void;
export interface VenueAdapter {
  readonly id: VenueId;
  readonly markets: readonly Market[];
  takerFee(market: string): string;
  start(listener: VenueListener): Promise<void>;
  stop(): Promise<void>;
  health(): VenueHealth;
  books(): readonly OrderBook[];
}

export function normaliseBook(input: OrderBook): OrderBook {
  currencySchema.parse(input.market.base);
  currencySchema.parse(input.market.quote);
  if (input.market.base === input.market.quote || !Number.isFinite(input.receivedAt))
    throw new Error('Invalid order book metadata.');
  const normalise = (levels: PriceLevel[], side: 'bids' | 'asks') => {
    const seen = new Set<string>();
    const copy = levels.map((level) => {
      positiveAmountSchema.parse(level.price);
      positiveAmountSchema.parse(level.size);
      const key = new Money(level.price).toFixed();
      if (seen.has(key)) throw new Error('Duplicate order book price level.');
      seen.add(key);
      return { ...level };
    });
    return copy.sort((a, b) => new Money(a.price).cmp(b.price) * (side === 'asks' ? 1 : -1));
  };
  const bids = normalise(input.bids, 'bids');
  const asks = normalise(input.asks, 'asks');
  if (!bids.length || !asks.length || new Money(bids[0]!.price).gt(asks[0]!.price))
    throw new Error('Empty or crossed order book.');
  return { ...input, market: { ...input.market }, bids, asks };
}
