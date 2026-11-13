import { describe, expect, it } from 'vitest';
import {
  availableActions,
  quoteMachine,
  tradeMachine,
  transition,
  type TradeState,
} from './state-machines.js';

describe('state machines', () => {
  it('accepts and expires active quotes, with idempotent repeat transitions', () => {
    expect(transition(quoteMachine, 'active', 'accept', 'client')).toEqual({
      state: 'accepted',
      changed: true,
    });
    expect(transition(quoteMachine, 'accepted', 'accept', 'client')).toEqual({
      state: 'accepted',
      changed: false,
    });
    expect(transition(quoteMachine, 'active', 'expire', 'system')).toEqual({
      state: 'expired',
      changed: true,
    });
    expect(transition(quoteMachine, 'expired', 'expire', 'system').changed).toBe(false);
    expect(() => transition(quoteMachine, 'expired', 'accept', 'client')).toThrow('not valid');
    expect(() => transition(quoteMachine, 'accepted', 'expire', 'system')).toThrow('not valid');
  });

  it('takes the normal settlement path and ignores persisted repeats after later progress', () => {
    let state: TradeState = tradeMachine.initial;
    const events: string[] = [];
    for (const action of ['funds_received', 'payout_sent', 'payout_confirmed']) {
      const result = transition(tradeMachine, state, action, 'staff', events);
      expect(result.changed).toBe(true);
      state = result.state;
      events.push(action);
      expect(transition(tradeMachine, state, action, 'staff', events)).toEqual({ state, changed: false });
    }
    expect(state).toBe('settled');
    expect(transition(tradeMachine, state, 'funds_received', 'staff', events)).toEqual({
      state,
      changed: false,
    });
  });

  it('permits cancellation only before funding', () => {
    expect(transition(tradeMachine, 'awaiting_client_funds', 'cancel', 'staff')).toEqual({
      state: 'cancelled',
      changed: true,
    });
    expect(transition(tradeMachine, 'cancelled', 'cancel', 'staff').changed).toBe(false);
    for (const state of ['funds_received', 'payout_sent', 'settled'] as const) {
      expect(() => transition(tradeMachine, state, 'cancel', 'staff')).toThrow('not valid');
    }
  });

  it('refuses out-of-order events, unknown events and unauthorised actors including retries', () => {
    expect(() => transition(tradeMachine, 'awaiting_client_funds', 'payout_sent', 'staff')).toThrow(
      'not valid',
    );
    expect(() => transition(tradeMachine, 'settled', 'unknown', 'staff')).toThrow('not valid');
    expect(() =>
      transition(tradeMachine, 'funds_received', 'funds_received', 'client', ['funds_received']),
    ).toThrow('cannot perform');
    expect(() => transition(quoteMachine, 'active', 'accept', 'staff')).toThrow('cannot perform');
  });

  it('offers only forward actions for the current state and role', () => {
    expect(availableActions(tradeMachine, 'awaiting_client_funds', 'staff')).toEqual([
      'funds_received',
      'cancel',
    ]);
    expect(availableActions(tradeMachine, 'funds_received', 'staff')).toEqual(['payout_sent']);
    expect(availableActions(tradeMachine, 'settled', 'staff')).toEqual([]);
    expect(availableActions(tradeMachine, 'awaiting_client_funds', 'client')).toEqual([]);
  });
});
