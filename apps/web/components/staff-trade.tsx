'use client';

import {
  availableActions,
  ledgerCheckSchema,
  Money,
  pairCurrencies,
  staffTradeDetailSchema,
  tradeActionSchema,
  tradeMachine,
  type StaffTradeDetail,
  type TradeAction,
} from '@northbook/shared';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { formatAmount, formatDecimal, formatPrice } from '../lib/format-money';
import { tradeAmounts, tradeLabels, tradeTimeline, utcTime } from '../lib/trade-presentation';
import { useResource } from '../lib/use-resource';
import { useSession } from './demo-session';
import { DataTable, KeyValue, StatusChip, Timeline } from './data-display';
import { EmptyState, ResourceFailure } from './feedback';
import { LedgerGroup } from './ledger-group';
import styles from './staff-trade.module.css';

const labels: Record<TradeAction, string> = {
  funds_received: 'Simulate funds received',
  payout_sent: 'Simulate payout sent',
  payout_confirmed: 'Simulate payout confirmed',
  cancel: 'Cancel trade',
};
function Pricing({ trade }: { trade: StaffTradeDetail }) {
  const { quote: currency, base } = pairCurrencies(trade.pair);
  const snapshot = trade.pricing;
  const legs = snapshot.route.legs ?? [];
  const revenue = trade.ledger
    .find((group) => group.event.action === 'booked')
    ?.entries.filter((entry) => entry.accountType === 'spread_revenue')
    .reduce(
      (sum, entry) => (entry.direction === 'credit' ? sum.plus(entry.amount) : sum.minus(entry.amount)),
      new Money(0),
    );
  return (
    <div className={styles.column}>
      <section className={styles.card} aria-labelledby="pricing-heading">
        <div className={styles.cardHeading}>
          <h2 id="pricing-heading">Pricing</h2>
          <span>
            {snapshot.route.tier ?? trade.organisation.tier}
            {snapshot.route.band !== undefined && (
              <> · {['Under 100k CAD', '100k to 500k CAD', 'Over 500k CAD'][snapshot.route.band]}</>
            )}
          </span>
        </div>
        <dl className={styles.values}>
          <KeyValue
            label="Client price"
            value={`${formatPrice(trade.clientPrice, base)} ${currency}`}
            numeric
          />
          <KeyValue
            label="Market price"
            value={`${formatPrice(snapshot.marketPrice, base)} ${currency}`}
            numeric
          />
          <KeyValue label="Spread" value={`${new Money(snapshot.spreadBps).toFixed()} bps`} numeric />
          <KeyValue
            label="Spread revenue"
            value={
              revenue ? `${formatAmount(revenue.toFixed(), currency)} ${currency}` : 'No booking posting'
            }
            numeric
          />
        </dl>
      </section>
      <section className={styles.card} aria-labelledby="route-heading">
        <div className={styles.cardHeading}>
          <h2 id="route-heading">Route</h2>
          <StatusChip dense>
            {legs.length > 1
              ? `Synthetic · ${legs.length} legs`
              : legs.length
                ? 'Direct · 1 leg'
                : 'Historical snapshot'}
          </StatusChip>
        </div>
        {legs.length ? (
          <>
            <DataTable
              dense
              label="Execution route"
              rows={legs.map((leg, index) => ({ ...leg, index }))}
              rowKey={(leg) => String(leg.index)}
              columns={[
                { key: 'leg', heading: 'Leg', mono: true, render: (leg) => leg.index + 1 },
                {
                  key: 'venue',
                  heading: 'Venue / market',
                  render: (leg) => (
                    <span className={styles.routeVenue}>
                      {leg.venue}
                      <small className="figure">
                        {leg.market} · {leg.side}
                      </small>
                    </span>
                  ),
                },
                {
                  key: 'price',
                  heading: 'Price',
                  numeric: true,
                  render: (leg) => formatDecimal(leg.marketPrice, 4),
                },
                {
                  key: 'fee',
                  heading: 'Fee',
                  numeric: true,
                  render: (leg) => `${new Money(leg.feeRate).mul(100).toFixed(2)}%`,
                },
              ]}
            />
            <p className={styles.routeNote}>
              Leg prices include venue fees. Market price after fees:{' '}
              <span className="figure">
                {formatPrice(snapshot.marketPrice, base)} {currency}
              </span>
            </p>
          </>
        ) : (
          <p className={styles.routeNote}>Detailed route legs are unavailable for this historical quote.</p>
        )}
        {snapshot.route.source === 'derived-sample' && (
          <p className={styles.routeNote}>
            Sample market price derived from the configured spread; historical venue details were not
            supplied.
          </p>
        )}
      </section>
    </div>
  );
}

function StaffContent({ id }: { id: string }) {
  const resource = useResource(`/staff/trades/${encodeURIComponent(id)}`, staffTradeDetailSchema);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; count: number; signature: string } | null>(null);
  const [checkFailure, setCheckFailure] = useState('');
  const lock = useRef(false);
  const checkLock = useRef(false);
  const keys = useRef(new Map<string, string>());
  const trade = resource.data;
  async function apply(value: string) {
    if (lock.current || !trade) return;
    const action = tradeActionSchema.parse(value);
    if (
      !availableActions(tradeMachine, trade.state, 'staff').includes(action) ||
      (action === 'cancel' && !reason.trim())
    )
      return;
    lock.current = true;
    setBusy(true);
    setFailure('');
    const body = JSON.stringify({ action, ...(action === 'cancel' ? { reason: reason.trim() } : {}) });
    let key = keys.current.get(body);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(body, key);
    }
    try {
      await api(`/staff/trades/${encodeURIComponent(id)}/events`, {
        method: 'POST',
        body,
        headers: { 'idempotency-key': key },
      });
      await resource.refreshAfterWrite();
      setConfirming(false);
      setCheck(null);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function runCheck() {
    if (checkLock.current || !trade) return;
    checkLock.current = true;
    setChecking(true);
    setCheckFailure('');
    try {
      const result = ledgerCheckSchema.parse(await api('/staff/ledger/check'));
      setCheck({
        ok: result.ok,
        count: result.discrepancies.length,
        signature: trade.events.map((event) => event.id).join(':'),
      });
    } catch (error) {
      setCheckFailure(errorMessage(error));
    } finally {
      checkLock.current = false;
      setChecking(false);
    }
  }
  if (!trade)
    return (
      <main className={styles.page}>
        <h1 className="figure">{id}</h1>
        {resource.error !== null ? (
          <ResourceFailure
            error={resource.error}
            retry={resource.refresh}
            missing={{
              message: 'This trade is no longer available.',
              action: { label: 'View trades', href: '/staff/blotter' },
            }}
          />
        ) : (
          <DataTable
            dense
            label="Staff trade"
            rows={[]}
            columns={[
              { key: 'trade', heading: 'Trade', render: () => null },
              { key: 'details', heading: 'Details', render: () => null },
            ]}
            rowKey={() => ''}
            loading
          />
        )}
      </main>
    );
  const amounts = tradeAmounts(trade);
  const { base, quote: currency } = pairCurrencies(trade.pair);
  const actions = availableActions(tradeMachine, trade.state, 'staff');
  const signature = trade.events.map((event) => event.id).join(':');
  const freshCheck = check?.signature === signature ? check : null;
  return (
    <div className={styles.surface}>
      <main className={styles.page}>
        <div className={styles.heading}>
          <nav aria-label="Breadcrumb">
            <Link href="/staff/blotter">Blotter</Link>
            <span aria-hidden="true">/</span>
            <span>Trades</span>
            <span aria-hidden="true">/</span>
            <span className="figure" aria-current="page">
              {trade.id}
            </span>
          </nav>
          <div className={styles.title}>
            <h1 className="figure">{trade.id}</h1>
            <span data-testid="trade-state">
              <StatusChip
                tone={
                  trade.state === 'settled' ? 'positive' : trade.state === 'cancelled' ? 'danger' : 'neutral'
                }
              >
                {tradeLabels[trade.state]}
              </StatusChip>
            </span>
          </div>
          <p>
            <strong>{trade.organisation.name}</strong> · {trade.organisation.tier} · {trade.pair}{' '}
            {trade.side === 'SELL' ? 'Sell' : 'Buy'} · Booked{' '}
            <time className="figure" dateTime={trade.createdAt}>
              {trade.createdAt.slice(0, 10)} {utcTime(trade.createdAt)} UTC
            </time>{' '}
            · Quote <span className="figure">{trade.quoteId}</span>
          </p>
        </div>
        {resource.error !== null && <ResourceFailure error={resource.error} retry={resource.refresh} />}
        <div className={styles.columns}>
          <div className={styles.column}>
            <section className={styles.card} aria-labelledby="trade-heading">
              <div className={styles.cardHeading}>
                <h2 id="trade-heading">Trade</h2>
                <span>
                  {trade.pair} · {trade.side === 'SELL' ? 'Sell' : 'Buy'}
                </span>
              </div>
              <div className={styles.amounts}>
                <div>
                  <span>Client pays</span>
                  <strong className="figure">
                    {formatAmount(amounts.payAmount, amounts.payCurrency)}{' '}
                    <small>{amounts.payCurrency}</small>
                  </strong>
                </div>
                <div>
                  <span>Client receives</span>
                  <strong className="figure">
                    {formatAmount(amounts.receiveAmount, amounts.receiveCurrency)}{' '}
                    <small>{amounts.receiveCurrency}</small>
                  </strong>
                </div>
              </div>
              <dl className={styles.values}>
                <KeyValue label="Trade ID" value={trade.id} numeric copyValue={trade.id} />
                <KeyValue
                  label="Client price"
                  value={`1 ${base} = ${formatPrice(trade.clientPrice, base)} ${currency}`}
                  numeric
                />
                <KeyValue label="Payout reference" value={trade.id.replace(/^NB-T-/, 'NB-P-')} numeric />
              </dl>
            </section>
            <section className={styles.card} aria-labelledby="actions-heading">
              <div className={styles.cardHeading}>
                <h2 id="actions-heading">Settlement actions</h2>
                <span className={styles.sample}>Simulated</span>
              </div>
              <div className={styles.actions}>
                {failure && (
                  <p className={styles.failure} role="alert">
                    {failure}
                  </p>
                )}
                {actions
                  .filter((action) => action !== 'cancel')
                  .map((action) => (
                    <button
                      type="button"
                      key={action}
                      className="button-primary"
                      disabled={busy || confirming}
                      onClick={() => {
                        void apply(action);
                      }}
                    >
                      {busy ? 'Applying…' : labels[tradeActionSchema.parse(action)]}
                    </button>
                  ))}
                {actions.includes('cancel') &&
                  (confirming ? (
                    <form
                      role="alertdialog"
                      aria-labelledby="cancel-title"
                      className={styles.confirmation}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void apply('cancel');
                      }}
                    >
                      <p id="cancel-title">
                        Cancel <span className="figure">{trade.id}</span>? No funds have been received. This
                        cannot be undone.
                      </p>
                      <label>
                        Cancellation reason
                        <textarea
                          autoFocus
                          maxLength={500}
                          value={reason}
                          disabled={busy}
                          required
                          onChange={(event) => {
                            setReason(event.target.value);
                          }}
                        />
                      </label>
                      <div>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={busy}
                          onClick={() => {
                            setConfirming(false);
                          }}
                        >
                          Keep trade
                        </button>
                        <button className={styles.dangerButton} disabled={busy || !reason.trim()}>
                          {busy ? 'Applying…' : 'Confirm cancellation'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={busy}
                      onClick={() => {
                        setConfirming(true);
                      }}
                    >
                      Cancel trade
                    </button>
                  ))}
                {!actions.length && (
                  <p>
                    No actions available. This trade is {trade.state === 'settled' ? 'settled' : 'cancelled'}.
                  </p>
                )}
                {trade.cancellationReason && <p>Reason: {trade.cancellationReason}</p>}
              </div>
              <div className={styles.timeline}>
                <h3 className="eyebrow">Timeline</h3>
                <Timeline steps={tradeTimeline(trade)} />
              </div>
            </section>
          </div>
          <Pricing trade={trade} />
          <section className={styles.card} aria-labelledby="ledger-heading">
            <div className={styles.cardHeading}>
              <h2 id="ledger-heading">Ledger</h2>
              <span>
                <span className="figure">{trade.ledger.length}</span> events ·{' '}
                <span className="figure">
                  {trade.ledger.reduce((sum, group) => sum + group.entries.length, 0)}
                </span>{' '}
                postings
              </span>
            </div>
            {trade.ledger.map((group) => (
              <LedgerGroup key={group.event.id} group={group} organisation={trade.organisation.name} />
            ))}
            <div className={styles.integrity}>
              <p
                role="status"
                className={freshCheck?.ok ? styles.positive : freshCheck ? styles.failure : undefined}
              >
                {checking
                  ? 'Checking ledger…'
                  : freshCheck
                    ? freshCheck.ok
                      ? 'Integrity check passed'
                      : `${freshCheck.count} integrity discrepancies found`
                    : 'Run the ledger integrity check'}
              </p>
              <button
                type="button"
                className="button-secondary"
                disabled={checking || busy}
                onClick={() => {
                  void runCheck();
                }}
              >
                Run check
              </button>
              {checkFailure && (
                <p className={styles.failure} role="alert">
                  {checkFailure}
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
export function StaffTrade({ id }: { id: string }) {
  const { persona, loading } = useSession();
  if (loading)
    return (
      <main className={styles.page}>
        <h1>Staff trade</h1>
        <DataTable
          label="Staff account"
          rows={[]}
          columns={[{ key: 'account', heading: 'Account', render: () => null }]}
          rowKey={() => ''}
          loading
        />
      </main>
    );
  if (persona?.user.role !== 'staff')
    return (
      <main className={styles.page}>
        <h1>Staff trade</h1>
        <EmptyState message="Choose the staff persona to view settlement operations." />
      </main>
    );
  return <StaffContent key={id} id={id} />;
}
