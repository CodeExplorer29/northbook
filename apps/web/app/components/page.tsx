'use client';

import { useState } from 'react';
import {
  DataTable,
  FilterPills,
  KeyValue,
  StatusChip,
  Tabs,
  Timeline,
  type DataColumn,
  type TimelineStep,
} from '../../components/data-display';
import styles from './review.module.css';

const rows = [
  {
    id: 'NB-T-000128',
    pair: 'ETH/CAD',
    side: 'Sell',
    base: '50.00000000',
    quote: '207,892.50',
    state: 'Awaiting client funds',
    next: 'Confirm client funds',
  },
  {
    id: 'NB-T-000125',
    pair: 'USDC/USD',
    side: 'Buy',
    base: '400,000.000000',
    quote: '400,480.00',
    state: 'Settled',
    next: '—',
  },
];
const columns: DataColumn<(typeof rows)[number]>[] = [
  { key: 'id', heading: 'Trade ID', mono: true, render: (row) => row.id },
  { key: 'pair', heading: 'Pair', mono: true, render: (row) => row.pair },
  { key: 'side', heading: 'Side', render: (row) => row.side },
  { key: 'base', heading: 'Base amount', numeric: true, render: (row) => row.base },
  { key: 'quote', heading: 'Quote amount', numeric: true, render: (row) => row.quote },
  {
    key: 'state',
    heading: 'Status',
    render: (row) => (
      <StatusChip tone={row.state === 'Settled' ? 'positive' : 'neutral'}>{row.state}</StatusChip>
    ),
  },
  { key: 'next', heading: 'Next step', render: (row) => row.next },
];
const steps: TimelineStep[] = [
  { id: 'booked', label: 'Trade booked', state: 'done', at: '2026-11-12T14:42:07Z' },
  { id: 'funded', label: 'Funds received', state: 'done', at: '2026-11-12T14:58:31Z', simulated: true },
  { id: 'sent', label: 'Payout sent', state: 'current' },
  { id: 'settled', label: 'Settled', state: 'future' },
];
export default function ComponentsPage() {
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('trades');
  return (
    <main className={styles.page}>
      <div>
        <p className="eyebrow">Northbook / Shared components</p>
        <h1 className="type-h1">Every detail has a place.</h1>
      </div>
      <section className={styles.section}>
        <h2 className="type-h2">Status</h2>
        <div className={styles.row}>
          <StatusChip tone="positive">Settled</StatusChip>
          <StatusChip>Awaiting client funds</StatusChip>
          <StatusChip tone="danger">Cancelled</StatusChip>
          <StatusChip tone="indicative">Indicative</StatusChip>
        </div>
      </section>
      <div className={styles.detailGrid}>
        <section className="card">
          <h2 className="type-h3">Settlement details</h2>
          <dl>
            <KeyValue label="Amount" value="50.00000000 ETH" copyValue="50.00000000" numeric />
            <KeyValue label="Network" value="Ethereum" />
            <KeyValue
              label="Deposit address"
              value="0x7A3f…SAMPLE…9c1E"
              copyValue="0x7A3f…SAMPLE…9c1E"
              numeric
            />
            <KeyValue label="Reference" value="NB-P-000128" copyValue="NB-P-000128" numeric />
          </dl>
          <p className={styles.sample}>Sample address. Do not send funds.</p>
        </section>
        <section className="card">
          <h2 className="type-h3">Timeline</h2>
          <Timeline steps={steps} />
        </section>
      </div>
      <section className={styles.section}>
        <h2 className="type-h2">Client table</h2>
        <FilterPills
          label="Trade status"
          options={[
            { value: 'all', label: 'All', count: 2 },
            { value: 'open', label: 'In progress', count: 1 },
            { value: 'settled', label: 'Settled', count: 1 },
            { value: 'cancelled', label: 'Cancelled', count: 0 },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className={styles.tableCard}>
          <DataTable
            label="Client trades"
            rows={rows.filter(
              (row) =>
                filter === 'all' ||
                (filter === 'open' && row.state !== 'Settled') ||
                (filter === 'settled' && row.state === 'Settled'),
            )}
            columns={columns}
            rowKey={(row) => row.id}
          />
        </div>
      </section>
      <section className={styles.section}>
        <h2 className="type-h2">Staff table</h2>
        <div className={styles.tableCard}>
          <Tabs
            label="Blotter"
            value={tab}
            onChange={setTab}
            options={[
              {
                value: 'trades',
                label: 'Trades',
                count: 2,
                panel: (
                  <DataTable
                    label="Staff trades"
                    dense
                    rows={rows}
                    columns={columns.map((column): DataColumn<(typeof rows)[number]> =>
                      column.key === 'state'
                        ? {
                            ...column,
                            render: (row) => (
                              <StatusChip dense tone={row.state === 'Settled' ? 'positive' : 'neutral'}>
                                {row.state}
                              </StatusChip>
                            ),
                          }
                        : column,
                    )}
                    rowKey={(row) => row.id}
                  />
                ),
              },
              {
                value: 'quotes',
                label: 'Quotes',
                count: 0,
                panel: (
                  <DataTable
                    label="Staff quotes"
                    dense
                    rows={[]}
                    columns={columns}
                    rowKey={(row) => row.id}
                  />
                ),
              },
            ]}
          />
        </div>
      </section>
      <section className={styles.section}>
        <h2 className="type-h3">Cancelled timeline</h2>
        <Timeline
          label="Cancelled trade timeline"
          steps={[
            steps[0]!,
            { id: 'cancelled', label: 'Cancelled', state: 'cancelled', at: '2026-11-12T15:42:00Z' },
          ]}
        />
      </section>
    </main>
  );
}
