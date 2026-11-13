'use client';

import { useState } from 'react';
import { DataTable, StatusChip, type DataColumn } from '../../components/data-display';
import { EmptyState, ErrorState, RateLimitBanner } from '../../components/feedback';
import { api } from '../../lib/api';
import styles from './states.module.css';

const rows = [
  { time: '14:42:01', pair: 'ETH/CAD', amount: '50.00000000', status: 'Accepted' },
  { time: '14:40:22', pair: 'ETH/CAD', amount: '50.00000000', status: 'Expired' },
  { time: '11:15:48', pair: 'USDT/CAD', amount: '250,000.000000', status: 'Accepted' },
];
const columns: DataColumn<(typeof rows)[number]>[] = [
  { key: 'time', heading: 'Time', mono: true, render: (row) => row.time },
  { key: 'pair', heading: 'Pair', render: (row) => row.pair },
  { key: 'amount', heading: 'Amount', numeric: true, render: (row) => row.amount },
  {
    key: 'status',
    heading: 'Status',
    render: (row) => (
      <StatusChip tone={row.status === 'Accepted' ? 'positive' : 'danger'}>{row.status}</StatusChip>
    ),
  },
];
export default function StatesPage() {
  const [retryAt] = useState(() => Date.now() + 5000);
  const [recovered, setRecovered] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  return (
    <main className={styles.page}>
      <div>
        <p className="eyebrow">Northbook / State patterns</p>
        <h1 className="type-h1">A clear next step.</h1>
        <p>Loading, empty, error and rate-limited views.</p>
      </div>
      <div className={styles.grid}>
        <section aria-label="Loading pattern">
          <h2 className="type-h3">Loading</h2>
          <p>Skeleton rows keep the table’s shape. Header stays real.</p>
          <div className={styles.panel}>
            <DataTable
              loading
              label="Loading quotes"
              columns={columns}
              rows={[]}
              rowKey={(row) => row.time}
            />
          </div>
        </section>
        <section aria-label="Empty pattern">
          <h2 className="type-h3">Empty</h2>
          <p>Say what is missing and where to go next.</p>
          <div className={styles.panel}>
            <DataTable
              label="Empty quotes"
              columns={columns}
              rows={[]}
              rowKey={(row) => row.time}
              empty={
                <EmptyState
                  message="No quotes yet. Request your first quote on the Trade page."
                  action={{ label: 'Go to Trade', href: '/trade' }}
                />
              }
            />
          </div>
        </section>
        <section aria-label="Error pattern">
          <h2 className="type-h3">Error</h2>
          <p>A reference for support and one retry action.</p>
          <div className={styles.panel}>
            {recovered ? (
              <p className={styles.recovered} role="status">
                Connection restored.
              </p>
            ) : (
              <ErrorState
                requestId="req_8f2c41"
                onRetry={async () => {
                  await api('/test/echo?pattern=error');
                  setRecovered(true);
                }}
              />
            )}
          </div>
        </section>
        <section aria-label="Rate-limit pattern">
          <h2 className="type-h3">Rate limited</h2>
          <p>Existing data stays visible while requests pause.</p>
          <div className={styles.panel}>
            {!refreshed && (
              <RateLimitBanner
                retryAt={retryAt}
                onRetry={async () => {
                  await api('/test/echo?pattern=rate');
                  setRefreshed(true);
                }}
              />
            )}
            {refreshed && (
              <p className={styles.recovered} role="status">
                Quotes refreshed.
              </p>
            )}
            <DataTable label="Last loaded quotes" columns={columns} rows={rows} rowKey={(row) => row.time} />
          </div>
        </section>
      </div>
    </main>
  );
}
