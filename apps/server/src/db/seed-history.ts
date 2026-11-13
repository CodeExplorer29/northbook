import { Money, pairSchema, type TradeEventRequest } from '@northbook/shared';
import { sql } from 'drizzle-orm';
import type { Transaction } from './client.js';
import { acceptQuote, issueQuote } from '../quoting.js';
import { applyTradeEvent } from '../settlement.js';
import { sampleNumber, type readSample } from './sample-data.js';

type Sample = Awaited<ReturnType<typeof readSample>>;
export async function seedHistory(tx: Transaction, sample: Sample) {
  const date = sample.trade.booked.split(' ')[0]!;
  const yesterday = new Date(`${date}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const time = (value: string) =>
    value === 'Yesterday'
      ? new Date(`${yesterday.toISOString().slice(0, 10)}T12:00:00Z`)
      : new Date(`${date}T${value}Z`);
  const recent = sample.recentQuotes;
  const quoteIds = ['NB-Q-000342', 'NB-Q-000339', 'NB-Q-000337', 'NB-Q-000336', 'NB-Q-000335', 'NB-Q-000332'];
  const records = sample.blotterTrades.map((trade, index) => ({
    ...trade,
    quoteId: quoteIds[index]!,
    issued: recent.find((quote) => quote.id === quoteIds[index])?.time,
  }));
  // The accepted quote 331 is in client history but outside the six-row blotter preview.
  records.push({
    id: 'NB-T-000122',
    quoteId: 'NB-Q-000331',
    organisation: sample.organisations[0]!.name,
    pair: 'BTC/CAD',
    side: 'Buy',
    base: '1',
    quote: '95,402.10',
    clientPrice: '95,402.10',
    status: 'Settled',
    booked: 'Yesterday',
    issued: 'Yesterday',
  });
  for (const record of records) {
    const orgIndex = sample.organisations.findIndex((org) => org.name === record.organisation);
    const organisationId = ['maple', 'harbourline'][orgIndex]!;
    const actor = { organisationId, userId: `${organisationId}-trader` };
    const booked = time(record.booked);
    const issued =
      record.issued && record.issued !== 'Yesterday'
        ? time(record.issued)
        : new Date(booked.getTime() - 6000);
    const side = record.side === 'Buy' ? 'BUY' : 'SELL';
    const base = sampleNumber(record.base),
      quote = sampleNumber(record.quote);
    const clientPrice = new Money(quote).div(base);
    const supplied =
      record.quoteId === sample.activeQuote.id
        ? sample.activeQuote.staffView
        : record.quoteId === sample.buyQuoteExample.id
          ? sample.buyQuoteExample.staffView
          : null;
    const band = new Money(quote).lt(100000) ? 0 : new Money(quote).lte(500000) ? 1 : 2;
    const bps =
      supplied?.spreadBps ??
      sample.configuration.spreadsBps.tiers.find(
        (tier) => tier.tier === sample.organisations[orgIndex]!.tier,
      )!.values[band]!;
    const marketPrice = supplied
      ? new Money(sampleNumber(supplied.marketPrice))
      : clientPrice.div(new Money(1).plus(new Money(bps).div(10000).mul(side === 'BUY' ? 1 : -1)));
    const marketQuoteAmount = marketPrice
      .mul(base)
      .toFixed(2, side === 'BUY' ? Money.ROUND_CEIL : Money.ROUND_FLOOR);
    const route = {
      mode: 'historical',
      source: supplied ? 'sample' : 'derived-sample',
      marketQuoteAmount,
      tier: sample.organisations[orgIndex]!.tier,
      band,
      ...(supplied
        ? {
            legs: supplied.route.map((leg) => ({
              venue: leg.venue.toLowerCase(),
              market: leg.market,
              side: leg.action.startsWith('Buy') ? 'BUY' : 'SELL',
              feeRate: new Money(sampleNumber(leg.fee)).div(100).toFixed(),
              replayed: false,
              marketPrice: new Money(sampleNumber(leg.price))
                .mul(
                  new Money(1).plus(
                    new Money(sampleNumber(leg.fee)).div(100).mul(leg.action.startsWith('Buy') ? 1 : -1),
                  ),
                )
                .toFixed(),
            })),
          }
        : {}),
    };
    // Reconstruct the exact price from authoritative amounts, retaining sample
    // cents rather than multiplying the rounded informational BUY price.
    const issuedQuote = await issueQuote(
      tx,
      { pair: pairSchema.parse(record.pair), side, fixed: 'base', amount: base },
      actor,
      {
        id: record.quoteId,
        asOf: issued,
        lifetimeSeconds: sample.configuration.quoteLifetimeSeconds,
        suppliedPrice: {
          clientPrice: clientPrice.toFixed(),
          marketPrice: marketPrice.toFixed(18),
          spreadBps: String(bps),
          route,
        },
      },
    );
    if (!new Money(issuedQuote.quoteAmount).eq(quote))
      throw new Error(`Seed amount mismatch for ${record.quoteId}`);
    const trade = await acceptQuote(tx, issuedQuote.id, actor, { id: record.id, asOf: booked });
    const actions: TradeEventRequest[] =
      record.status === 'Cancelled'
        ? [{ action: 'cancel', reason: 'Sample cancellation: client no longer needs this conversion.' }]
        : record.status === 'Awaiting client funds'
          ? []
          : [
              { action: 'funds_received' },
              ...(record.status === 'Funds received' ? [] : [{ action: 'payout_sent' } as const]),
              ...(record.status === 'Settled' ? [{ action: 'payout_confirmed' } as const] : []),
            ];
    for (const [index, action] of actions.entries())
      await applyTradeEvent(tx, trade.id, action, 'staff', {
        asOf: new Date(booked.getTime() + (index + 1) * 60000),
      });
  }
  for (const quote of recent.filter((row) => row.status === 'Expired')) {
    const side = quote.side === 'Buy' ? 'BUY' : 'SELL';
    const base = sampleNumber(side === 'BUY' ? quote.youReceive : quote.youPay);
    const clientPrice = sampleNumber(quote.price);
    const bps = new Money(clientPrice).mul(base).lt(100000) ? 45 : 35;
    await issueQuote(
      tx,
      { pair: pairSchema.parse(quote.pair), side, fixed: 'base', amount: base },
      { organisationId: 'maple', userId: 'maple-trader' },
      {
        id: quote.id,
        asOf: time(quote.time),
        suppliedPrice: {
          clientPrice,
          spreadBps: String(bps),
          marketPrice: new Money(clientPrice)
            .div(new Money(1).plus(new Money(bps).div(10000).mul(side === 'BUY' ? 1 : -1)))
            .toFixed(18),
          route: { mode: 'historical', source: 'derived-sample' },
        },
      },
    );
  }
  // Transactional sequence restart: a failed reset cannot leave identifiers reused.
  await tx.execute(sql`ALTER SEQUENCE quote_number RESTART WITH 343`);
  await tx.execute(sql`ALTER SEQUENCE trade_number RESTART WITH 129`);
}
