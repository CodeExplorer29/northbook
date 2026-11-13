'use client';

import {
  Money,
  pairCurrencies,
  quoteResponseSchema,
  tradeResponseSchema,
  type QuoteRequest,
  type QuoteResponse,
  type Session,
  type TradeResponse,
} from '@northbook/shared';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '../../components/demo-session';
import { api, ApiError } from '../../lib/api';
import { formatAmount, formatDecimal, formatPrice } from '../../lib/format-money';
import { tradeAmounts, tradeLabels, utcTime } from '../../lib/trade-presentation';
import { useIndicativePrice } from '../../lib/use-indicative-price';
import { useResource } from '../../lib/use-resource';
import { useNow } from '../../lib/use-now';
import { DataTable, StatusChip } from '../../components/data-display';
import { EmptyState, ResourceFailure } from '../../components/feedback';
import { SwapWidget } from '../../components/swap-widget';
import { QuoteCard } from '../../components/quote-card';
import { UnverifiedTrade } from '../../components/unverified-trade';
import styles from './trade.module.css';

const quotesParser = quoteResponseSchema.array();
const tradesParser = tradeResponseSchema.array();
function Activity({ currentId }: { currentId?: string }) {
  const quotes = useResource('/quotes', quotesParser);
  const trades = useResource('/trades', tradesParser);
  const now = useNow();
  const recent = (quotes.data ?? [])
    .filter(
      (quote) =>
        quote.id !== currentId || quote.status !== 'active' || now >= Date.parse(quote.expiresAt) - 1000,
    )
    .slice(0, 5);
  const open = (trades.data ?? []).filter((trade) => !['settled', 'cancelled'].includes(trade.state));
  return (
    <aside className={styles.activity} aria-label="Trading activity">
      <section className={styles.panel} aria-labelledby="recent-title">
        <div className={styles.panelHeading}>
          <h2 id="recent-title">Recent quotes</h2>
          <Link href="/quotes">All quotes</Link>
        </div>
        {quotes.error !== null && <ResourceFailure error={quotes.error} retry={quotes.refresh} />}
        <DataTable
          label="Recent quotes"
          rows={recent}
          rowKey={(quote) => quote.id}
          loading={quotes.loading}
          empty={<EmptyState message="Your recent quotes will appear here." />}
          columns={[
            {
              key: 'time',
              heading: 'Time (UTC)',
              mono: true,
              render: (quote) => (
                <time dateTime={quote.createdAt} title={quote.createdAt}>
                  {utcTime(quote.createdAt)}
                </time>
              ),
            },
            {
              key: 'pair',
              heading: 'Pair',
              render: (quote) => (
                <span className={styles.pair}>
                  {quote.pair}
                  <small>{quote.side === 'SELL' ? 'Sell' : 'Buy'}</small>
                  <time className={`figure ${styles.mobileTime}`} dateTime={quote.createdAt}>
                    {utcTime(quote.createdAt)}
                  </time>
                </span>
              ),
            },
            {
              key: 'pay',
              heading: 'You pay',
              numeric: true,
              render: (quote) => (
                <span
                  className={styles.compactAmount}
                  title={`${formatAmount(quote.payAmount, quote.payCurrency)} ${quote.payCurrency}`}
                >
                  {formatAmount(quote.payAmount, quote.payCurrency)} {quote.payCurrency}
                </span>
              ),
            },
            {
              key: 'status',
              heading: 'Status',
              render: (quote) => {
                const status =
                  quote.status === 'active' && now >= Date.parse(quote.expiresAt) ? 'expired' : quote.status;
                return (
                  <StatusChip
                    tone={status === 'accepted' ? 'positive' : status === 'expired' ? 'danger' : 'neutral'}
                  >
                    {status[0]!.toUpperCase() + status.slice(1)}
                  </StatusChip>
                );
              },
            },
          ]}
        />
      </section>
      <section className={styles.panel} aria-labelledby="open-title">
        <div className={styles.panelHeading}>
          <h2 id="open-title">Open trades</h2>
          <Link href="/trades">All trades</Link>
        </div>
        {trades.error !== null && <ResourceFailure error={trades.error} retry={trades.refresh} />}
        {trades.loading ? (
          <DataTable
            label="Open trades"
            rows={[]}
            columns={[
              { key: 'trade', heading: 'Trade', render: () => null },
              { key: 'status', heading: 'Status', render: () => null },
            ]}
            rowKey={() => ''}
            loading
          />
        ) : open.length === 0 ? (
          <EmptyState message="No open trades. Accept a quote to book a trade." />
        ) : (
          <ul className={styles.openTrades}>
            {open.map((trade) => {
              const amounts = tradeAmounts(trade);
              return (
                <li key={trade.id}>
                  <Link href={`/trades/${trade.id}`}>
                    <div className={styles.tradeIdentity}>
                      <span className="figure">{trade.id}</span>
                      <StatusChip>{tradeLabels[trade.state]}</StatusChip>
                    </div>
                    <span className={styles.tradePair}>
                      {trade.pair} · {trade.side === 'SELL' ? 'Sell' : 'Buy'}
                    </span>
                    <span className={`figure ${styles.tradeAmounts}`}>
                      {formatAmount(amounts.payAmount, amounts.payCurrency)} {amounts.payCurrency} →{' '}
                      {formatAmount(amounts.receiveAmount, amounts.receiveCurrency)} {amounts.receiveCurrency}
                    </span>
                    {trade.state === 'awaiting_client_funds' && (
                      <span className={styles.action}>
                        Action needed · Send {new Money(amounts.payAmount).toFixed()} {amounts.payCurrency}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}

function ApprovedTrade({ organisation }: { organisation: NonNullable<Session['organisation']> }) {
  const [value, setValue] = useState<QuoteRequest>({
    pair: 'ETH/CAD',
    side: 'SELL',
    fixed: 'base',
    amount: '50',
  });
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [trade, setTrade] = useState<TradeResponse | null>(null);
  const [indicative, setIndicative] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const issueKey = useRef<{ body: string; key: string } | null>(null);
  const acceptanceKeys = useRef(new Map<string, string>());
  const {
    price,
    minimumCad,
    error: priceError,
    retry: retryPrice,
  } = useIndicativePrice(value.pair, value.side);
  const now = useNow();
  const limited =
    failure instanceof ApiError && failure.code === 'rate_limited' && now < (failure.retryAt ?? Infinity);
  async function issue(request: QuoteRequest) {
    if (lock.current || limited) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    const body = JSON.stringify(request);
    if (issueKey.current?.body !== body) issueKey.current = { body, key: crypto.randomUUID() };
    try {
      const result = quoteResponseSchema.parse(
        await api('/quotes', { method: 'POST', body, headers: { 'idempotency-key': issueKey.current.key } }),
      );
      setQuote(result);
      setTrade(null);
      setIndicative(price.status === 'ready' ? price.unitPrice : null);
      issueKey.current = null;
      setRevision((value) => value + 1);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code !== 'internal_error' &&
        error.code !== 'idempotency_in_progress'
      )
        issueKey.current = null;
      setFailure(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function accept(): Promise<TradeResponse> {
    if (!quote) throw new Error('No quote is selected.');
    let key = acceptanceKeys.current.get(quote.id);
    if (!key) {
      key = crypto.randomUUID();
      acceptanceKeys.current.set(quote.id, key);
    }
    const result = tradeResponseSchema.parse(
      await api(`/quotes/${quote.id}/accept`, {
        method: 'POST',
        body: '{}',
        headers: { 'idempotency-key': key },
      }),
    );
    setTrade(result);
    setRevision((value) => value + 1);
    return result;
  }
  function renew() {
    setQuote(null);
    setTrade(null);
    void issue(value);
  }
  const currencies = pairCurrencies(value.pair);
  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">
            {organisation.name} ·{' '}
            {organisation.tier === 'tier_1'
              ? 'Tier 1'
              : organisation.tier === 'standard'
                ? 'Standard'
                : organisation.tier}
          </span>
          <h1>Trade</h1>
        </div>
        <div className={styles.limits}>
          <span>
            Minimum <strong className="figure">{formatDecimal(minimumCad, 0)} CAD</strong>
          </span>
          <span>
            Maximum <strong className="figure">{formatDecimal(organisation.maxTradeSize, 0)} CAD</strong>
          </span>
          <span>
            Quote validity{' '}
            <strong className="figure">
              {quote ? `${(Date.parse(quote.expiresAt) - Date.parse(quote.createdAt)) / 1000}s` : 'On quote'}
            </strong>
          </span>
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.conversion}>
          <ResourceFailure error={failure} retry={() => issue(value)} />
          {!quote && <ResourceFailure error={priceError} retry={retryPrice} />}
          {quote ? (
            <>
              <div className={styles.summary}>
                <span>
                  {quote.side === 'SELL' ? 'Sell' : 'Buy'}{' '}
                  <span className="figure">{new Money(quote.baseAmount).toFixed()}</span> {currencies.base}{' '}
                  {quote.side === 'SELL' ? 'for' : 'with'} {currencies.quote}
                </span>
                {indicative && (
                  <small>
                    Indicative was <span className="figure">{formatPrice(indicative, currencies.base)}</span>
                  </small>
                )}
              </div>
              <QuoteCard
                key={quote.id}
                quote={quote}
                {...(trade ? { trade } : {})}
                onAccept={accept}
                onCancel={() => {
                  setQuote(null);
                  setTrade(null);
                  setFailure(null);
                }}
                onRequote={renew}
              />
            </>
          ) : (
            <SwapWidget
              mode="firm"
              value={value}
              onChange={setValue}
              price={price}
              minimumCad={minimumCad}
              busy={busy}
              actionDisabled={limited}
              onAction={issue}
            />
          )}
        </div>
        <Activity key={revision} {...(quote?.status === 'active' && !trade ? { currentId: quote.id } : {})} />
      </div>
    </main>
  );
}

export default function TradePage() {
  const { persona, loading, openPersonas } = useSession();
  if (loading)
    return (
      <main className={styles.page}>
        <h1>Trade</h1>
        <DataTable
          label="Loading trading account"
          rows={[]}
          columns={[{ key: 'account', heading: 'Account', render: () => null }]}
          rowKey={() => ''}
          loading
        />
      </main>
    );
  if (persona?.user.role !== 'client' || !persona.organisation)
    return (
      <main className={styles.page}>
        <h1>Trade</h1>
        <EmptyState message="Choose a client persona to request a quote." />
        <button className="button-primary" onClick={openPersonas}>
          Choose persona
        </button>
      </main>
    );
  if (persona.organisation.kybState !== 'approved')
    return <UnverifiedTrade organisation={persona.organisation} />;
  return <ApprovedTrade organisation={persona.organisation} />;
}
