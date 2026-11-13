'use client';

import {
  Money,
  pairCurrencies,
  quoteResponseSchema,
  tradeResponseSchema,
  type QuoteResponse,
  type TradeResponse,
} from '@northbook/shared';
import { useState } from 'react';
import Link from 'next/link';
import { useSession } from './demo-session';
import { DataTable, FilterPills, StatusChip, type DataColumn } from './data-display';
import { EmptyState, ResourceFailure } from './feedback';
import { formatAmount, formatPrice } from '../lib/format-money';
import { tradeAmounts, tradeLabels, utcTime } from '../lib/trade-presentation';
import { useResource } from '../lib/use-resource';
import { useNow } from '../lib/use-now';
import styles from './client-history.module.css';

const quotesParser = quoteResponseSchema.array(),
  tradesParser = tradeResponseSchema.array();
function HistoryTime({ value }: { value: string }) {
  return (
    <time className={styles.time} dateTime={value}>
      <span>{utcTime(value)}</span>
      <small>{value.slice(0, 10)}</small>
    </time>
  );
}
const quoteColumns: DataColumn<QuoteResponse>[] = [
  {
    key: 'time',
    heading: 'Time (UTC)',
    mono: true,
    render: (quote) => <HistoryTime value={quote.createdAt} />,
  },
  { key: 'id', heading: 'Quote', mono: true, render: (quote) => quote.id },
  { key: 'pair', heading: 'Pair', render: (quote) => quote.pair },
  { key: 'side', heading: 'Side', render: (quote) => (quote.side === 'BUY' ? 'Buy' : 'Sell') },
  {
    key: 'pay',
    heading: 'You pay',
    numeric: true,
    render: (quote) => `${formatAmount(quote.payAmount, quote.payCurrency)} ${quote.payCurrency}`,
  },
  {
    key: 'receive',
    heading: 'You receive',
    numeric: true,
    render: (quote) => `${formatAmount(quote.receiveAmount, quote.receiveCurrency)} ${quote.receiveCurrency}`,
  },
  {
    key: 'price',
    heading: 'Price',
    numeric: true,
    render: (quote) => formatPrice(quote.clientPrice, pairCurrencies(quote.pair).base),
  },
  {
    key: 'status',
    heading: 'Status',
    render: (quote) => (
      <StatusChip
        tone={quote.status === 'accepted' ? 'positive' : quote.status === 'expired' ? 'danger' : 'neutral'}
      >
        {quote.status[0]!.toUpperCase() + quote.status.slice(1)}
      </StatusChip>
    ),
  },
  {
    key: 'trade',
    heading: 'Trade',
    render: (quote) =>
      quote.status === 'accepted' && quote.tradeId ? (
        <Link href={`/trades/${quote.tradeId}`}>View trade →</Link>
      ) : (
        '—'
      ),
  },
];
const tradeColumns: DataColumn<TradeResponse>[] = [
  {
    key: 'time',
    heading: 'Booked (UTC)',
    mono: true,
    render: (trade) => <HistoryTime value={trade.createdAt} />,
  },
  {
    key: 'id',
    heading: 'Trade',
    mono: true,
    render: (trade) => <Link href={`/trades/${trade.id}`}>{trade.id}</Link>,
  },
  { key: 'pair', heading: 'Pair', render: (trade) => trade.pair },
  { key: 'side', heading: 'Side', render: (trade) => (trade.side === 'BUY' ? 'Buy' : 'Sell') },
  {
    key: 'pay',
    heading: 'You pay',
    numeric: true,
    render: (trade) => {
      const amounts = tradeAmounts(trade);
      return `${formatAmount(amounts.payAmount, amounts.payCurrency)} ${amounts.payCurrency}`;
    },
  },
  {
    key: 'receive',
    heading: 'You receive',
    numeric: true,
    render: (trade) => {
      const amounts = tradeAmounts(trade);
      return `${formatAmount(amounts.receiveAmount, amounts.receiveCurrency)} ${amounts.receiveCurrency}`;
    },
  },
  {
    key: 'state',
    heading: 'Status',
    render: (trade) => (
      <span className={styles.state}>
        <StatusChip
          tone={trade.state === 'settled' ? 'positive' : trade.state === 'cancelled' ? 'danger' : 'neutral'}
        >
          {tradeLabels[trade.state]}
        </StatusChip>
        {trade.state === 'awaiting_client_funds' && <small>Action needed</small>}
      </span>
    ),
  },
];
function Quotes() {
  const resource = useResource('/quotes', quotesParser);
  const now = useNow();
  const [filter, setFilter] = useState('all');
  const all = (resource.data ?? []).map((quote) => ({
    ...quote,
    status:
      quote.status === 'active' && now >= Date.parse(quote.expiresAt) ? ('expired' as const) : quote.status,
  }));
  const rows = all.filter((quote) => filter === 'all' || quote.status === filter);
  const options = [
    { value: 'all', label: 'All' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'expired', label: 'Expired' },
  ];
  return (
    <>
      <FilterPills
        label="Filter quotes"
        value={filter}
        onChange={setFilter}
        options={options.map((option) => ({
          ...option,
          count: all.filter((quote) => option.value === 'all' || quote.status === option.value).length,
        }))}
      />
      <section className={styles.panel}>
        <ResourceFailure error={resource.error} retry={resource.refresh} />
        <DataTable
          label="Quote history"
          rows={rows}
          columns={quoteColumns}
          rowKey={(quote) => quote.id}
          loading={resource.loading}
          empty={
            resource.error ? (
              <span>Quotes are unavailable.</span>
            ) : (
              <EmptyState
                message={
                  all.length
                    ? 'No quotes match this filter.'
                    : 'No quotes yet. Request your first quote on the Trade page.'
                }
                action={{ label: 'Go to Trade', href: '/trade' }}
              />
            )
          }
        />
      </section>
      <p className={styles.note}>
        A quote’s validity is shown when it is issued. Expired quotes are kept here for your records; no trade
        was made.
      </p>
    </>
  );
}
const group = (trade: TradeResponse) =>
  ['settled', 'cancelled'].includes(trade.state) ? trade.state : 'progress';
function Trades() {
  const resource = useResource('/trades', tradesParser);
  const [filter, setFilter] = useState('all');
  const all = resource.data ?? [],
    rows = all.filter((trade) => filter === 'all' || group(trade) === filter);
  const options = [
    { value: 'all', label: 'All' },
    { value: 'progress', label: 'In progress' },
    { value: 'settled', label: 'Settled' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
  const attention = all.filter((trade) => trade.state === 'awaiting_client_funds');
  return (
    <>
      {attention.map((trade, index) => {
        const amounts = tradeAmounts(trade);
        return (
          <Link key={trade.id} href={`/trades/${trade.id}`} className={styles.attention}>
            <span className={styles.dot} aria-hidden="true" />
            <span>
              {index === 0 && (
                <strong>
                  {attention.length} {attention.length === 1 ? 'trade needs' : 'trades need'} your
                  action.{' '}
                </strong>
              )}
              Send{' '}
              <span className="figure">
                {new Money(amounts.payAmount).toFixed()} {amounts.payCurrency}
              </span>{' '}
              for <span className="figure">{trade.id}</span>.
            </span>
            <span>View instructions →</span>
          </Link>
        );
      })}
      <FilterPills
        label="Filter trades"
        value={filter}
        onChange={setFilter}
        options={options.map((option) => ({
          ...option,
          count: all.filter((trade) => option.value === 'all' || group(trade) === option.value).length,
        }))}
      />
      <section className={`${styles.panel} ${styles.trades}`}>
        <ResourceFailure error={resource.error} retry={resource.refresh} />
        <DataTable
          label="Trade history"
          rows={rows}
          columns={tradeColumns}
          rowKey={(trade) => trade.id}
          loading={resource.loading}
          empty={
            resource.error ? (
              <span>Trades are unavailable.</span>
            ) : (
              <EmptyState
                message={
                  filter === 'cancelled'
                    ? 'No cancelled trades.'
                    : all.length
                      ? 'No trades match this filter.'
                      : 'No trades yet. Accept a quote on the Trade page to book your first trade.'
                }
                action={{ label: 'Go to Trade', href: '/trade' }}
              />
            )
          }
        />
      </section>
    </>
  );
}
export function ClientHistory({ kind }: { kind: 'quotes' | 'trades' }) {
  const { persona, loading, openPersonas } = useSession();
  const title = kind === 'quotes' ? 'Quotes' : 'Trades';
  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          {persona?.organisation && <span className="eyebrow">{persona.organisation.name}</span>}
          <h1>{title}</h1>
        </div>
        {persona?.user.role === 'client' && (
          <Link href="/trade">{kind === 'quotes' ? 'Request a quote' : 'New trade'} →</Link>
        )}
      </div>
      {loading ? (
        <DataTable
          label={`Loading ${kind}`}
          rows={[]}
          columns={[{ key: 'record', heading: title, render: () => null }]}
          rowKey={() => ''}
          loading
        />
      ) : persona?.user.role === 'client' && persona.organisation ? (
        kind === 'quotes' ? (
          <Quotes />
        ) : (
          <Trades />
        )
      ) : (
        <>
          <EmptyState message={`Choose a client persona to see its ${kind}.`} />
          <button type="button" className="button-primary" onClick={openPersonas}>
            Choose persona
          </button>
        </>
      )}
    </main>
  );
}
