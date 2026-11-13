'use client';

import { blotterSchema, Money, pairSchema, pairCurrencies, type Blotter } from '@northbook/shared';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '../../../components/demo-session';
import { DataTable, KeyValue, StatusChip, Tabs, type DataColumn } from '../../../components/data-display';
import { EmptyState } from '../../../components/feedback';
import { ResourceFailure } from '../../../components/feedback';
import { useResource } from '../../../lib/use-resource';
import { formatAmount, formatPrice } from '../../../lib/format-money';
import { tradeLabels, utcTime } from '../../../lib/trade-presentation';
import styles from './blotter.module.css';

type Trade = Blotter['trades'][number];
type Quote = Blotter['quotes'][number];
const nextStep = {
  awaiting_client_funds: 'Confirm client funds',
  funds_received: 'Send payout',
  payout_sent: 'Confirm payout',
  settled: '—',
  cancelled: '—',
};
const quoteLabel = { active: 'Active', accepted: 'Accepted', expired: 'Expired' };
function Status({ state }: { state: string }) {
  return (
    <StatusChip
      dense
      tone={
        ['settled', 'accepted'].includes(state)
          ? 'positive'
          : ['cancelled', 'expired'].includes(state)
            ? 'danger'
            : 'neutral'
      }
    >
      {tradeLabels[state as Trade['state']] ?? quoteLabel[state as Quote['status']]}
    </StatusChip>
  );
}
function Time({ value }: { value: string }) {
  return (
    <time dateTime={value} title={`${value} UTC`} className={styles.time}>
      {utcTime(value)}
      <small>{value.slice(0, 10)}</small>
    </time>
  );
}
const tradeColumns: DataColumn<Trade>[] = [
  { key: 'time', heading: 'Booked (UTC)', mono: true, render: (row) => <Time value={row.createdAt} /> },
  {
    key: 'id',
    heading: 'Trade ID',
    mono: true,
    render: (row) => <Link href={`/staff/trades/${row.id}`}>{row.id}</Link>,
  },
  { key: 'org', heading: 'Organisation', render: (row) => row.organisation.name },
  { key: 'pair', heading: 'Pair', mono: true, render: (row) => row.pair },
  { key: 'side', heading: 'Side', render: (row) => (row.side === 'BUY' ? 'Buy' : 'Sell') },
  {
    key: 'base',
    heading: 'Base amount',
    numeric: true,
    render: (row) => formatAmount(row.baseAmount, pairCurrencies(row.pair).base),
  },
  {
    key: 'quote',
    heading: 'Quote amount',
    numeric: true,
    render: (row) => formatAmount(row.quoteAmount, pairCurrencies(row.pair).quote),
  },
  {
    key: 'price',
    heading: 'Client price',
    numeric: true,
    render: (row) => formatPrice(row.clientPrice, pairCurrencies(row.pair).base),
  },
  { key: 'status', heading: 'Status', render: (row) => <Status state={row.state} /> },
  {
    key: 'next',
    heading: 'Next step',
    render: (row) =>
      nextStep[row.state] === '—' ? '—' : <Link href={`/staff/trades/${row.id}`}>{nextStep[row.state]}</Link>,
  },
];
function QuoteDetail({ quote, close }: { quote: Quote; close: () => void }) {
  const { base, quote: currency } = pairCurrencies(quote.pair);
  return (
    <section className={styles.detail} aria-label={`Quote ${quote.id}`}>
      <div className={styles.heading}>
        <h2 className="figure">{quote.id}</h2>
        <button className="button-secondary" onClick={close}>
          Close quote
        </button>
      </div>
      <p>
        {quote.organisation.name} · {quote.pair} · {quote.side === 'BUY' ? 'Buy' : 'Sell'}
      </p>
      <dl>
        <KeyValue
          label="Client price"
          numeric
          value={`${formatPrice(quote.clientPrice, base)} ${currency}`}
        />
        <KeyValue
          label="Market price"
          numeric
          value={`${formatPrice(quote.marketPrice, base)} ${currency}`}
        />
        <KeyValue label="Spread" numeric value={`${new Money(quote.spreadBps).toFixed()} bps`} />
      </dl>
      {quote.route.legs?.length ? (
        <DataTable
          dense
          label="Quote route"
          rows={quote.route.legs.map((leg, index) => ({ ...leg, index }))}
          rowKey={(leg) => String(leg.index)}
          columns={[
            { key: 'leg', heading: 'Leg', mono: true, render: (leg) => leg.index + 1 },
            { key: 'venue', heading: 'Venue', render: (leg) => leg.venue },
            { key: 'market', heading: 'Market', mono: true, render: (leg) => `${leg.market} · ${leg.side}` },
            { key: 'price', heading: 'Price after fees', numeric: true, render: (leg) => leg.marketPrice },
          ]}
        />
      ) : (
        <p>Detailed route legs are unavailable for this historical quote.</p>
      )}
      {quote.route.source === 'derived-sample' && (
        <p>
          Sample market price derived from the configured spread; historical venue details were not supplied.
        </p>
      )}
      {quote.tradeId && <Link href={`/staff/trades/${quote.tradeId}`}>View trade →</Link>}
    </section>
  );
}
function BlotterContent() {
  const resource = useResource('/staff/blotter', blotterSchema);
  const [tab, setTab] = useState<'trades' | 'quotes'>('trades');
  const [org, setOrg] = useState('all'),
    [pair, setPair] = useState('all'),
    [status, setStatus] = useState('all'),
    [days, setDays] = useState('2');
  const [selected, setSelected] = useState<string | null>(null);
  const data = resource.data;
  const start = data ? Date.parse(`${data.asOf.slice(0, 10)}T00:00:00Z`) - (Number(days) - 1) * 86400000 : 0;
  const end = data ? Date.parse(`${data.asOf.slice(0, 10)}T00:00:00Z`) + 86400000 : 0;
  const matches = (row: Trade | Quote) =>
    (org === 'all' || row.organisation.id === org) &&
    (pair === 'all' || row.pair === pair) &&
    (status === 'all' || ('state' in row ? row.state : row.status) === status) &&
    (days === 'all' || (Date.parse(row.createdAt) >= start && Date.parse(row.createdAt) < end));
  const trades = data?.trades.filter(matches) ?? [],
    quotes = data?.quotes.filter(matches) ?? [];
  const organisations = [
    ...new Map(
      [...(data?.trades ?? []), ...(data?.quotes ?? [])].map((row) => [
        row.organisation.id,
        row.organisation,
      ]),
    ).values(),
  ];
  const selectedQuote = data?.quotes.find((quote) => quote.id === selected);
  const quoteColumns: DataColumn<Quote>[] = [
    { key: 'time', heading: 'Time (UTC)', mono: true, render: (row) => <Time value={row.createdAt} /> },
    {
      key: 'id',
      heading: 'Quote ID',
      mono: true,
      render: (row) => (
        <button
          className={styles.quoteLink}
          onClick={() => setSelected(row.id)}
          aria-expanded={selected === row.id}
        >
          {row.id}
        </button>
      ),
    },
    { key: 'org', heading: 'Organisation', render: (row) => row.organisation.name },
    { key: 'pair', heading: 'Pair', mono: true, render: (row) => row.pair },
    { key: 'side', heading: 'Side', render: (row) => (row.side === 'BUY' ? 'Buy' : 'Sell') },
    {
      key: 'client',
      heading: 'Client price',
      numeric: true,
      render: (row) => formatPrice(row.clientPrice, pairCurrencies(row.pair).base),
    },
    {
      key: 'market',
      heading: 'Market price',
      numeric: true,
      render: (row) => formatPrice(row.marketPrice, pairCurrencies(row.pair).base),
    },
    {
      key: 'spread',
      heading: 'Spread (bps)',
      numeric: true,
      render: (row) => new Money(row.spreadBps).toFixed(),
    },
    { key: 'status', heading: 'Status', render: (row) => <Status state={row.status} /> },
  ];
  const filters = (
    <div className={styles.filters}>
      <label htmlFor="blotter-org">
        Organisation
        <select
          id="blotter-org"
          aria-label="Organisation"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
        >
          <option value="all">All organisations</option>
          {organisations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="blotter-pair">
        Pair
        <select id="blotter-pair" aria-label="Pair" value={pair} onChange={(e) => setPair(e.target.value)}>
          <option value="all">All pairs</option>
          {pairSchema.options.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label htmlFor="blotter-status">
        Status
        <select
          id="blotter-status"
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {Object.entries(tab === 'trades' ? tradeLabels : quoteLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="blotter-date">
        Date range
        <select
          id="blotter-date"
          aria-label="Date range"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        >
          <option value="2">Today and yesterday</option>
          <option value="1">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="all">All dates</option>
        </select>
      </label>
      <span>{tab === 'trades' ? trades.length : quotes.length} shown</span>
    </div>
  );
  return (
    <>
      <div className={styles.heading}>
        <h1>Blotter</h1>
        <span>
          {data?.asOf.slice(0, 10)} UTC · auto-refresh <span className="figure">5s</span>
        </span>
      </div>
      <ResourceFailure error={resource.error} retry={resource.refresh} />
      <dl className={styles.summary}>
        <div>
          <dt>In progress</dt>
          <dd>{data?.summary.inProgress ?? '—'}</dd>
        </div>
        <div>
          <dt>Settled today</dt>
          <dd>{data?.summary.settledToday ?? '—'}</dd>
        </div>
        <div>
          <dt>Spread revenue today</dt>
          <dd>
            {data ? (
              data.summary.revenue.length ? (
                data.summary.revenue.map((item) => (
                  <span key={item.currency}>
                    {formatAmount(item.amount, item.currency)} <small>{item.currency}</small>
                  </span>
                ))
              ) : (
                <span>
                  0.00 <small>CAD</small>
                </span>
              )
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className={styles.attention}>
          <dt>Awaiting client funds</dt>
          <dd>
            {data?.summary.awaitingFunds ?? '—'}{' '}
            {data?.trades
              .filter((trade) => trade.state === 'awaiting_client_funds')
              .map((trade) => (
                <Link key={trade.id} href={`/staff/trades/${trade.id}`}>
                  {trade.id}
                </Link>
              ))}
          </dd>
        </div>
      </dl>
      <section className={styles.panel}>
        <Tabs
          label="Blotter"
          value={tab}
          onChange={(value) => {
            setTab(value);
            setStatus('all');
            setSelected(null);
          }}
          options={[
            {
              value: 'trades',
              label: 'Trades',
              count: data?.trades.length ?? 0,
              panel: (
                <>
                  {tab === 'trades' && filters}
                  <DataTable
                    dense
                    label="Staff trades"
                    rows={trades}
                    columns={tradeColumns}
                    rowKey={(row) => row.id}
                    loading={resource.loading}
                    empty={
                      <EmptyState
                        message={
                          resource.error
                            ? 'Trades are unavailable.'
                            : data?.trades.length
                              ? 'Nothing matches these filters.'
                              : 'No trades yet. A client can accept a quote to book the first trade.'
                        }
                        action={{ label: 'Go to Trade', href: '/trade' }}
                      />
                    }
                  />
                </>
              ),
            },
            {
              value: 'quotes',
              label: 'Quotes',
              count: data?.quotes.length ?? 0,
              panel: (
                <>
                  {tab === 'quotes' && filters}
                  <DataTable
                    dense
                    label="Staff quotes"
                    rows={quotes}
                    columns={quoteColumns}
                    rowKey={(row) => row.id}
                    loading={resource.loading}
                    empty={
                      <EmptyState
                        message={
                          resource.error
                            ? 'Quotes are unavailable.'
                            : data?.quotes.length
                              ? 'Nothing matches these filters.'
                              : 'No quotes yet. Choose a client persona to request a quote.'
                        }
                        action={{ label: 'Go to Trade', href: '/trade' }}
                      />
                    }
                  />
                </>
              ),
            },
          ]}
        />
      </section>
      {tab === 'quotes' && selectedQuote && (
        <QuoteDetail quote={selectedQuote} close={() => setSelected(null)} />
      )}
      <p className={styles.note}>
        Summary uses all organisations and UTC dates. Revenue is net posted spread, including reversals, shown
        separately per currency.
      </p>
    </>
  );
}
export default function BlotterPage() {
  const { persona, loading, openPersonas } = useSession();
  return (
    <div className={styles.background}>
      <main className={styles.page}>
        {loading ? (
          <>
            <h1>Blotter</h1>
            <DataTable
              label="Loading blotter"
              rows={[]}
              columns={[{ key: 'trade', heading: 'Trade', render: () => null }]}
              rowKey={() => ''}
              loading
            />
          </>
        ) : persona?.user.role === 'staff' ? (
          <BlotterContent />
        ) : (
          <>
            <h1>Blotter</h1>
            <EmptyState message="Choose the staff persona to view the blotter." />
            <button className="button-primary" onClick={openPersonas}>
              Choose persona
            </button>
          </>
        )}
      </main>
    </div>
  );
}
