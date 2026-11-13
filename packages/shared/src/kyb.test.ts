import { expect, it } from 'vitest';
import { homeVerificationSchema, kybDraftSchema, kybSubmissionSchema } from './kyb.js';
import { availableActions, kybMachine, transition } from './state-machines.js';

const complete = {
  legalName: ' Sample company ',
  registrationNumber: 'DEMO-1',
  jurisdiction: 'Ontario, Canada',
  natureOfBusiness: 'Payments',
  beneficialOwners: [
    { name: 'Owner one', ownership: '33.333333' },
    { name: 'Owner two', ownership: '66.666667' },
  ],
};
it('allows incomplete drafts but lists every missing required submission field', () => {
  const empty = {
    legalName: '',
    registrationNumber: '',
    jurisdiction: '',
    natureOfBusiness: '',
    beneficialOwners: [],
  };
  expect(kybDraftSchema.parse(empty)).toEqual(empty);
  const result = kybSubmissionSchema.safeParse(empty);
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toEqual(Object.keys(empty));
  expect(kybSubmissionSchema.parse(complete).legalName).toBe('Sample company');
});
it('requires named beneficial owners with exact percentages totalling 100', () => {
  for (const ownership of ['0', '-1', '101', '1e2', '100.0000001', '99.999999', '']) {
    expect(
      kybSubmissionSchema.safeParse({ ...complete, beneficialOwners: [{ name: 'Owner', ownership }] })
        .success,
    ).toBe(false);
  }
  expect(
    kybSubmissionSchema.safeParse({ ...complete, beneficialOwners: [{ name: ' ', ownership: '100' }] })
      .success,
  ).toBe(false);
  expect(kybDraftSchema.safeParse({ ...complete, state: 'approved' }).success).toBe(false);
});
it('keeps Home intake bounded and optional, preserving incomplete email only in drafts', () => {
  expect(
    homeVerificationSchema.parse({
      legalName: '  Demo  ',
      workEmail: 'desk@example.com',
      monthlyVolume: 'Under 250,000 CAD',
    }).legalName,
  ).toBe('Demo');
  expect(
    homeVerificationSchema.safeParse({ legalName: 'Demo', workEmail: 'invalid', monthlyVolume: '' }).success,
  ).toBe(false);
  expect(
    homeVerificationSchema.safeParse({
      legalName: 'Demo',
      workEmail: '',
      monthlyVolume: 'unbounded arbitrary choice',
    }).success,
  ).toBe(false);
  expect(kybDraftSchema.safeParse({ ...complete, workEmail: 'typing@' }).success).toBe(true);
  expect(kybSubmissionSchema.safeParse({ ...complete, workEmail: 'typing@' }).success).toBe(false);
  expect(kybSubmissionSchema.safeParse({ ...complete, workEmail: '', monthlyVolume: '' }).success).toBe(true);
});
it('permits one submission and a staff decision, with terminal decisions and role enforcement', () => {
  expect(transition(kybMachine, 'draft', 'submit', 'client')).toEqual({ state: 'submitted', changed: true });
  expect(transition(kybMachine, 'submitted', 'submit', 'client').changed).toBe(false);
  for (const [event, state] of [
    ['approve', 'approved'],
    ['reject', 'rejected'],
  ] as const) {
    expect(transition(kybMachine, 'submitted', event, 'staff')).toEqual({ state, changed: true });
    expect(transition(kybMachine, state, event, 'staff').changed).toBe(false);
    expect(availableActions(kybMachine, state, 'staff')).toEqual([]);
    expect(() => transition(kybMachine, 'draft', event, 'staff')).toThrow('not valid');
    expect(() => transition(kybMachine, 'submitted', event, 'client')).toThrow('cannot perform');
  }
  expect(() => transition(kybMachine, 'rejected', 'approve', 'staff')).toThrow('not valid');
});
