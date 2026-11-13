'use client';

import { Money, type LedgerGroupData } from '@northbook/shared';
import { DataTable, StatusChip } from './data-display';
import { formatAmount } from '../lib/format-money';
import { utcTime } from '../lib/trade-presentation';
import styles from './staff-trade.module.css';

export const eventLabels: Record<string, string> = {
  booked: 'Trade booked',
  funds_received: 'Funds received',
  payout_sent: 'Payout sent',
  payout_confirmed: 'Payout confirmed',
  cancel: 'Trade cancelled',
};
const accountLabels = {
  client_receivable: 'Client receivable',
  client_payable: 'Client payable',
  desk_bank: 'Desk bank',
  desk_wallet: 'Desk wallet',
  spread_revenue: 'Spread revenue',
  trading_position: 'Trading position',
};
export function LedgerGroup({ group, organisation }: { group: LedgerGroupData; organisation: string }) {
  const currencies = [...new Set(group.entries.map((entry) => entry.currency))];
  return (
    <section className={styles.ledgerGroup} aria-label={`${eventLabels[group.event.action]} ledger group`}>
      <div className={styles.groupHeading}>
        <strong>
          {eventLabels[group.event.action]}{' '}
          {group.event.simulated && <span className={styles.sample}>Simulated</span>}
        </strong>
        <time className="figure" dateTime={group.event.createdAt}>
          {utcTime(group.event.createdAt)}
        </time>
      </div>
      {group.entries.length > 0 ? (
        <>
          <DataTable
            dense
            label={`${eventLabels[group.event.action]} postings`}
            rows={group.entries}
            rowKey={(entry) => entry.id}
            columns={[
              {
                key: 'account',
                heading: 'Account',
                render: (entry) => (
                  <span title={entry.accountId}>
                    {accountLabels[entry.accountType]}
                    {entry.organisationId && <small className={styles.accountOwner}>{organisation}</small>}
                  </span>
                ),
              },
              {
                key: 'debit',
                heading: 'Debit',
                numeric: true,
                render: (entry) =>
                  entry.direction === 'debit' ? formatAmount(entry.amount, entry.currency) : '—',
              },
              {
                key: 'credit',
                heading: 'Credit',
                numeric: true,
                render: (entry) =>
                  entry.direction === 'credit' ? formatAmount(entry.amount, entry.currency) : '—',
              },
              { key: 'currency', heading: 'Cur.', mono: true, render: (entry) => entry.currency },
            ]}
          />
          <div className={styles.balances}>
            {currencies.map((currency) => {
              const difference = group.entries
                .filter((entry) => entry.currency === currency)
                .reduce(
                  (sum, entry) =>
                    entry.direction === 'debit' ? sum.plus(entry.amount) : sum.minus(entry.amount),
                  new Money(0),
                );
              return (
                <StatusChip
                  dense
                  key={currency}
                  tone={difference.isZero() ? 'positive' : 'danger'}
                >{`${difference.isZero() ? 'Balanced' : 'Unbalanced'} ${currency}`}</StatusChip>
              );
            })}
          </div>
        </>
      ) : (
        <p className={group.event.action === 'payout_confirmed' ? styles.noPosting : styles.failure}>
          {group.event.action === 'payout_confirmed'
            ? 'Confirmation only. No additional monetary posting.'
            : 'Expected monetary posting is missing. Run the integrity check.'}
        </p>
      )}
      {group.reversesTransactionId && (
        <p className={styles.reversal}>
          Reverses booking <span className="figure">{group.reversesTransactionId}</span>
        </p>
      )}
    </section>
  );
}
