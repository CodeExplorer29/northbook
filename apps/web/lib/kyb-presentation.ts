import { Money, type KybDraft, type KybState } from '@northbook/shared';

export const kybLabels: Record<KybState, string> = {
  draft: 'Draft',
  submitted: 'Under review',
  approved: 'Verified',
  rejected: 'Not approved',
};
export function ownershipTotal(owners: KybDraft['beneficialOwners']) {
  try {
    return owners.reduce((total, owner) => total.plus(owner.ownership || '0'), new Money(0)).toFixed();
  } catch {
    return '—';
  }
}
export const verificationTime = (date: string) => `${date.slice(0, 10)} ${date.slice(11, 16)} UTC`;
