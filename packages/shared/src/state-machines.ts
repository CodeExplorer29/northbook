import { z } from 'zod';

export type Actor = 'client' | 'staff' | 'system';
export interface StateMachine<State extends string> {
  initial: State;
  states: readonly State[];
  transitions: readonly { from: State; event: string; to: State; actor: Actor }[];
}

export const quoteStateSchema = z.enum(['active', 'accepted', 'expired']);
export type QuoteState = z.infer<typeof quoteStateSchema>;
export const quoteMachine: StateMachine<QuoteState> = {
  initial: 'active',
  states: quoteStateSchema.options,
  transitions: [
    { from: 'active', event: 'accept', to: 'accepted', actor: 'client' },
    { from: 'active', event: 'expire', to: 'expired', actor: 'system' },
  ],
};

export const tradeStateSchema = z.enum([
  'awaiting_client_funds',
  'funds_received',
  'payout_sent',
  'settled',
  'cancelled',
]);
export type TradeState = z.infer<typeof tradeStateSchema>;
export const tradeActionSchema = z.enum(['funds_received', 'payout_sent', 'payout_confirmed', 'cancel']);
export type TradeAction = z.infer<typeof tradeActionSchema>;
export const tradeMachine: StateMachine<TradeState> = {
  initial: 'awaiting_client_funds',
  states: tradeStateSchema.options,
  transitions: [
    { from: 'awaiting_client_funds', event: 'funds_received', to: 'funds_received', actor: 'staff' },
    { from: 'funds_received', event: 'payout_sent', to: 'payout_sent', actor: 'staff' },
    { from: 'payout_sent', event: 'payout_confirmed', to: 'settled', actor: 'staff' },
    { from: 'awaiting_client_funds', event: 'cancel', to: 'cancelled', actor: 'staff' },
  ],
};

export const kybStateSchema = z.enum(['draft', 'submitted', 'approved', 'rejected']);
export type KybState = z.infer<typeof kybStateSchema>;
export const kybMachine: StateMachine<KybState> = {
  initial: 'draft',
  states: kybStateSchema.options,
  transitions: [
    { from: 'draft', event: 'submit', to: 'submitted', actor: 'client' },
    { from: 'submitted', event: 'approve', to: 'approved', actor: 'staff' },
    { from: 'submitted', event: 'reject', to: 'rejected', actor: 'staff' },
  ],
};

export class TransitionError extends Error {
  constructor(readonly code: 'invalid_transition' | 'forbidden') {
    super(
      code === 'forbidden'
        ? 'This actor cannot perform the action.'
        : 'This action is not valid in the current state.',
    );
  }
}

// appliedEvents comes from persisted history, allowing retries of earlier events
// after the state has advanced without applying their side effects again.
export function transition<State extends string>(
  machine: StateMachine<State>,
  current: State,
  event: string,
  actor: Actor,
  appliedEvents: readonly string[] = [],
): { state: State; changed: boolean } {
  const candidates = machine.transitions.filter((edge) => edge.event === event);
  if (!machine.states.includes(current) || candidates.length === 0)
    throw new TransitionError('invalid_transition');
  const allowed = candidates.filter((edge) => edge.actor === actor);
  if (allowed.length === 0) throw new TransitionError('forbidden');
  if (appliedEvents.includes(event)) return { state: current, changed: false };
  const next = allowed.find((edge) => edge.from === current);
  if (next) return { state: next.to, changed: true };
  if (allowed.some((edge) => edge.to === current)) return { state: current, changed: false };
  throw new TransitionError('invalid_transition');
}

export function availableActions<State extends string>(
  machine: StateMachine<State>,
  current: State,
  actor: Actor,
) {
  return machine.transitions
    .filter((edge) => edge.from === current && edge.actor === actor)
    .map((edge) => edge.event);
}
