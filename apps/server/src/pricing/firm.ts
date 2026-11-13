import { Money, pairCurrencies, quoteAmounts, roundAmount, type QuoteRequest } from '@northbook/shared';
import { eq } from 'drizzle-orm';
import type { Transaction } from '../db/client.js';
import { organisations, settings, spreadBands } from '../db/schema.js';
import { AppError } from '../errors.js';
import type { PricedBook } from './depth.js';
import { priceCurrencyPair, selectRoute } from './routes.js';

export function guardClientPrice(
  side: QuoteRequest['side'],
  baseAmount: string,
  quoteAmount: string,
  marketPrice: string,
) {
  const client = new Money(quoteAmount).div(baseAmount);
  const market = new Money(marketPrice);
  if (
    !client.isFinite() ||
    !market.isFinite() ||
    market.lte(0) ||
    (side === 'BUY' ? client.lt(market) : client.gt(market))
  ) {
    throw new AppError('price_unavailable', 'Waiting for price updates.');
  }
}

export async function firmPrice(
  tx: Transaction,
  input: QuoteRequest,
  organisation: typeof organisations.$inferSelect,
  books: readonly PricedBook[],
) {
  const [config] = await tx.select().from(settings).where(eq(settings.id, 'default'));
  if (!config) throw new AppError('price_unavailable', 'Pricing configuration unavailable.');
  const { quote: quoteCurrency } = pairCurrencies(input.pair);
  const cadValue = (amount: string) =>
    quoteCurrency === 'CAD'
      ? new Money(amount)
      : new Money(priceCurrencyPair(books, 'USD', 'CAD', { side: 'BUY', fixed: 'base', amount }).quoteAmount);
  const initial = selectRoute(books, input);
  const notionalCad = cadValue(initial.quoteAmount);
  if (notionalCad.lt(config.minimumTradeCad))
    throw new AppError(
      'below_minimum',
      `Minimum trade is ${new Money(config.minimumTradeCad).toFixed(0)} CAD equivalent.`,
    );
  if (notionalCad.gt(organisation.maxTradeSize))
    throw new AppError(
      'above_maximum',
      `Maximum trade is ${new Money(organisation.maxTradeSize).toFixed(0)} CAD equivalent.`,
    );
  const band = notionalCad.lt('100000') ? 0 : notionalCad.lte('500000') ? 1 : 2;
  const spreads = await tx.select().from(spreadBands).where(eq(spreadBands.tier, organisation.tier));
  const spread = spreads.find((row) => row.band === band);
  if (!spread) throw new AppError('price_unavailable', 'Pricing tier unavailable.');
  const factor = new Money(1)[input.side === 'BUY' ? 'plus' : 'minus'](new Money(spread.bps).div(10000));
  if (factor.lte(0)) throw new AppError('price_unavailable', 'Invalid pricing configuration.');
  // Fixed quote is the client's all-in amount. Walk the market budget after
  // removing the spread so depth and fees are evaluated at the actual size.
  const priced =
    input.fixed === 'base'
      ? initial
      : selectRoute(books, { ...input, amount: new Money(input.amount).div(factor).toFixed() });
  const clientPrice = new Money(priced.marketPrice).mul(factor).toFixed();
  const amounts = quoteAmounts({ ...input, price: clientPrice });
  // Rounding the base can cross a depth boundary. Reprice that final amount,
  // validate its liquidity and lock its exact market notional in the snapshot.
  const finalMarket = selectRoute(books, { ...input, fixed: 'base', amount: amounts.baseAmount });
  guardClientPrice(input.side, amounts.baseAmount, amounts.quoteAmount, finalMarket.marketPrice);
  const maximumCad = Money.max(cadValue(finalMarket.quoteAmount), cadValue(amounts.quoteAmount));
  if (maximumCad.gt(organisation.maxTradeSize))
    throw new AppError(
      'above_maximum',
      `Maximum trade is ${new Money(organisation.maxTradeSize).toFixed(0)} CAD equivalent.`,
    );
  const marketQuoteAmount = roundAmount(
    finalMarket.quoteAmount,
    quoteCurrency,
    input.side === 'BUY' ? 'up' : 'down',
  );
  return {
    amounts,
    lifetimeSeconds: config.quoteLifetimeSeconds,
    snapshot: {
      marketPrice: finalMarket.marketPrice,
      clientPrice,
      spreadBps: spread.bps,
      route: {
        ...finalMarket,
        mode: finalMarket.replayed ? 'replay' : 'live',
        marketQuoteAmount,
        notionalCad: notionalCad.toFixed(),
        tier: organisation.tier,
        band,
      },
    },
  };
}
