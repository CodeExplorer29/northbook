import { pairCurrencies, type TradeDetail, type TradeResponse, type TradeState } from '@northbook/shared';

import type { TimelineStep } from '../components/data-display';

export const tradeLabels: Record<TradeState, string> = {
  awaiting_client_funds: 'Awaiting client funds',
  funds_received: 'Funds received',
  payout_sent: 'Payout sent',
  settled: 'Settled',
  cancelled: 'Cancelled',
};
export function tradeAmounts(trade: TradeResponse) {
  const { base, quote } = pairCurrencies(trade.pair);
  return trade.side === 'SELL'
    ? {
        payAmount: trade.baseAmount,
        payCurrency: base,
        receiveAmount: trade.quoteAmount,
        receiveCurrency: quote,
      }
    : {
        payAmount: trade.quoteAmount,
        payCurrency: quote,
        receiveAmount: trade.baseAmount,
        receiveCurrency: base,
      };
}
export function utcTime(at: string) {
  return new Date(at).toLocaleTimeString('en-GB', { timeZone: 'UTC' });
}

export function tradeTimeline(trade: TradeDetail): TimelineStep[] {
  const booked = trade.events.find((event) => event.action === 'booked');
  const steps: TimelineStep[] = [
    { id: 'booked', label: 'Trade booked', state: 'done', at: booked?.createdAt ?? trade.createdAt },
    {
      id: 'awaiting',
      label: 'Awaiting client funds',
      state: trade.state === 'awaiting_client_funds' ? 'current' : 'done',
      at: trade.createdAt,
    },
  ];
  if (trade.state === 'cancelled') {
    const cancelled = trade.events.find((event) => event.action === 'cancel');
    steps.push({
      id: 'cancelled',
      label: 'Cancelled',
      state: 'cancelled',
      ...(cancelled ? { at: cancelled.createdAt, simulated: cancelled.simulated } : {}),
    });
    return steps;
  }
  for (const [action, state] of [
    ['funds_received', 'funds_received'],
    ['payout_sent', 'payout_sent'],
    ['payout_confirmed', 'settled'],
  ] as const) {
    const event = trade.events.find((item) => item.action === action);
    steps.push({
      id: action,
      label: tradeLabels[state],
      state: event ? (trade.state === state && state !== 'settled' ? 'current' : 'done') : 'future',
      ...(event ? { at: event.createdAt, simulated: event.simulated } : {}),
    });
  }
  return steps;
}
