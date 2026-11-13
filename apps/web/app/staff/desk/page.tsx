'use client';

import { deskSchema, Money, type Desk } from '@northbook/shared';
import { useSession } from '../../../components/demo-session';
import { DataTable, type DataColumn } from '../../../components/data-display';
import { EmptyState, ResourceFailure } from '../../../components/feedback';
import { formatAmount } from '../../../lib/format-money';
import { useResource } from '../../../lib/use-resource';
import styles from '../blotter/blotter.module.css';

type Position = Desk['positions'][number];
type Client = Desk['clients'][number];

function signed(value: string, currency: Position['currency']) {
  const amount = new Money(value);
  if (amount.isZero()) return formatAmount('0', currency);
  return `${amount.gt(0) ? '+' : '−'}${formatAmount(amount.abs().toFixed(), currency)}`;
}
const positionColumns: DataColumn<Position>[] = [
  { key: 'currency', heading: 'Currency', mono: true, render: (row) => row.currency },
  {
    key: 'side',
    heading: 'Desk holds',
    render: (row) => {
      const amount = new Money(row.quantity);
      return amount.isZero() ? 'Flat' : amount.gt(0) ? 'Long (holds)' : 'Short (owes)';
    },
  },
  {
    key: 'quantity',
    heading: 'Quantity',
    mono: true,
    numeric: true,
    render: (row) => signed(row.quantity, row.currency),
  },
  {
    key: 'price',
    heading: 'Market price (CAD)',
    mono: true,
    numeric: true,
    render: (row) => (row.priceCad ? formatAmount(row.priceCad, 'CAD') : 'Waiting for price'),
  },
  {
    key: 'value',
    heading: 'Value (CAD)',
    mono: true,
    numeric: true,
    render: (row) => (row.valueCad ? signed(row.valueCad, 'CAD') : '—'),
  },
];
const clientColumns: DataColumn<Client>[] = [
  { key: 'name', heading: 'Organisation', render: (row) => row.name },
  { key: 'trades', heading: 'Trades', mono: true, numeric: true, render: (row) => row.trades },
  {
    key: 'revenue',
    heading: 'Spread revenue',
    mono: true,
    numeric: true,
    render: (row) => `${formatAmount(row.revenue, row.currency)} ${row.currency}`,
  },
];

function DeskView() {
  const { data, error, loading, refresh } = useResource('/staff/desk', deskSchema);
  return (
    <>
      <div className={styles.heading}>
        <h1>Desk</h1>
        <span>Position and spread revenue, derived from the ledger</span>
      </div>
      <ResourceFailure error={error} retry={refresh} />
      <dl className={styles.summary}>
        <div>
          <dt>Unrealised result on open position</dt>
          <dd>
            {data?.unrealisedCad ? signed(data.unrealisedCad, 'CAD') : '—'} <small>CAD</small>
          </dd>
        </div>
        <div>
          <dt>Spread revenue today (UTC)</dt>
          <dd>
            {data?.revenue.length
              ? data.revenue.map((item) => (
                  <span key={item.currency}>
                    {formatAmount(item.today, item.currency)} <small>{item.currency}</small>
                  </span>
                ))
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Spread revenue to date</dt>
          <dd>
            {data?.revenueCad ? formatAmount(data.revenueCad, 'CAD') : '—'} <small>CAD equivalent</small>
          </dd>
        </div>
      </dl>
      <section className={styles.panel} aria-labelledby="desk-position">
        <h2 id="desk-position" className={styles.panelTitle}>
          Open position
        </h2>
        <DataTable
          label="Desk position"
          rows={data?.positions ?? []}
          columns={positionColumns}
          rowKey={(row) => row.currency}
          dense
          loading={loading && !data}
          empty={<EmptyState message="No trades have been booked yet." />}
        />
      </section>
      <section className={styles.panel} aria-labelledby="desk-revenue">
        <h2 id="desk-revenue" className={styles.panelTitle}>
          Spread revenue by client
        </h2>
        <DataTable
          label="Spread revenue by client"
          rows={data?.clients ?? []}
          columns={clientColumns}
          rowKey={(row) => `${row.organisationId}:${row.currency}`}
          dense
          loading={loading && !data}
          empty={<EmptyState message="No spread revenue has been earned yet." />}
        />
      </section>
      <p className={styles.note}>
        Each trade leaves the desk long what the client sold and short what the client received, at the market
        price when the quote was issued. This demo does not hedge, so the position stays open and its value
        moves with the market. Spread revenue is earned at booking and reversed if a trade is cancelled.
        Sample trades were booked at their historical prices, which is why the opening result is not zero.
      </p>
    </>
  );
}

export default function DeskPage() {
  const { persona, loading } = useSession();
  return (
    <div className={styles.background}>
      <main className={styles.page}>
        {loading ? null : persona?.user.role === 'staff' ? (
          <DeskView />
        ) : (
          <EmptyState message="The desk view is available to Northbook staff." />
        )}
      </main>
    </div>
  );
}
