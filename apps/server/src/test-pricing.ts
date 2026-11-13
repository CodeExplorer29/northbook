import type { QuoteRequest } from '@northbook/shared';
import type { Transaction } from './db/client.js';
import { issueQuote, type QuoteActor, type QuoteOptions } from './quoting.js';
import type { PricedBook } from './pricing/depth.js';

// Deterministic market inputs for domain/HTTP tests. Production has no fixed
// price fallback; it must receive fresh adapter books or refuse the quote.
export function testBooks(): PricedBook[] {
  return [
    { symbol: 'ETH/CAD', base: 'ETH', quote: 'CAD', bid: '4172.45', ask: '4172.45', feeRate: '0' },
    { symbol: 'BTC/CAD', base: 'BTC', quote: 'CAD', bid: '94900', ask: '95000', feeRate: '0.0026' },
    { symbol: 'USD/CAD', base: 'USD', quote: 'CAD', bid: '1.39', ask: '1.4', feeRate: '0' },
    { symbol: 'ETH/USD', base: 'ETH', quote: 'USD', bid: '2990', ask: '3000', feeRate: '0.006' },
  ].map((market) => ({
    feeRate: market.feeRate,
    book: {
      venue: 'kraken',
      market: { symbol: market.symbol, base: market.base, quote: market.quote },
      bids: [{ price: market.bid, size: '10000000' }],
      asks: [{ price: market.ask, size: '10000000' }],
      receivedAt: Date.now(),
      replayed: true,
    },
  })) as PricedBook[];
}
export const testMarketData = {
  mode: 'replay' as const,
  freshBooks: testBooks,
  health: () => [],
  async stop() {},
  async refreshConfiguration() {},
};
export function issueTestQuote(
  tx: Transaction,
  input: QuoteRequest,
  actor: QuoteActor,
  options: QuoteOptions = {},
) {
  return issueQuote(tx, input, actor, { books: testBooks(), ...options });
}
