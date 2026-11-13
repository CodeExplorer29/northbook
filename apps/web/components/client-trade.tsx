'use client';

import { Money, pairCurrencies, tradeDetailSchema, type Currency, type TradeDetail } from '@northbook/shared';
import Link from 'next/link';
import { useSession } from './demo-session';
import { DataTable, KeyValue, StatusChip, Timeline } from './data-display';
import { EmptyState, ResourceFailure } from './feedback';
import { formatAmount, formatPrice } from '../lib/format-money';
import { tradeAmounts, tradeLabels, tradeTimeline, utcTime } from '../lib/trade-presentation';
import { useResource } from '../lib/use-resource';
import styles from './client-trade.module.css';

const isFiat = (currency: Currency) => currency === 'CAD' || currency === 'USD';
const network = (currency: Currency) => (currency === 'BTC' ? 'Bitcoin' : 'Ethereum');
const sampleAddress = (currency: Currency) => (currency === 'BTC' ? 'bc1…SAMPLE…9c1e' : '0x7A3f…SAMPLE…9c1E');
export function payoutReference(id: string) {
  return id.replace(/^NB-T-/, 'NB-P-');
}

function NextStep({ trade, organisation }: { trade: TradeDetail; organisation: string }) {
  const amounts = tradeAmounts(trade);
  const fiat = isFiat(amounts.payCurrency);
  const payoutFiat = isFiat(amounts.receiveCurrency);
  const event = (action: string) => trade.events.find((item) => item.action === action);
  const received = event('funds_received');
  const settled = event('payout_confirmed');
  return (
    <section className={styles.next} aria-label="What happens next">
      <div className={styles.nextHeading}>
        <span className="eyebrow">What happens next</span>
        <span className={trade.state === 'awaiting_client_funds' ? styles.action : styles.noAction}>
          {trade.state === 'awaiting_client_funds' ? 'Action needed from you' : 'Nothing needed from you'}
        </span>
      </div>
      {trade.state === 'awaiting_client_funds' && (
        <>
          <h2>
            Send exactly <span className="figure">{new Money(amounts.payAmount).toFixed()}</span>{' '}
            {amounts.payCurrency}
          </h2>
          <p>
            {fiat
              ? `Send from a bank account held by ${organisation}, using the sample bank details and payment reference below.`
              : `Send from a wallet controlled by ${organisation}, on the ${network(amounts.payCurrency)} network, to the deposit address below.`}
          </p>
          <dl className={styles.values}>
            <KeyValue
              label="Amount"
              value={`${formatAmount(amounts.payAmount, amounts.payCurrency)} ${amounts.payCurrency}`}
              numeric
              copyValue={amounts.payAmount}
            />
            {fiat ? (
              <>
                <KeyValue label="Bank" value="Royal Sample Bank" />
                <KeyValue label="Account name" value="Northbook Demo Desk (sample)" />
                <KeyValue
                  label="Account"
                  value={
                    <>
                      <span className="figure">SAMPLE-0001</span>{' '}
                      <span className={styles.sample}>Sample</span>
                    </>
                  }
                  copyValue="SAMPLE-0001"
                />
              </>
            ) : (
              <>
                <KeyValue label="Network" value={network(amounts.payCurrency)} />
                <KeyValue
                  label="Deposit address"
                  value={
                    <>
                      <span className="figure">{sampleAddress(amounts.payCurrency)}</span>{' '}
                      <span className={styles.sample}>Sample</span>
                    </>
                  }
                  copyValue={sampleAddress(amounts.payCurrency)}
                />
              </>
            )}
            <KeyValue label="Payment reference" value={trade.id} numeric copyValue={trade.id} />
          </dl>
          <p role="note" className={styles.warning}>
            {fiat ? 'Sample bank details. Do not send funds.' : 'Sample address. Do not send funds.'}
          </p>
        </>
      )}
      {trade.state === 'funds_received' && (
        <>
          <h2>We have your funds. Your payout is being prepared.</h2>
          <p>
            Received{' '}
            <span className="figure">
              {formatAmount(amounts.payAmount, amounts.payCurrency)} {amounts.payCurrency}
            </span>
            {received && (
              <>
                {' '}
                at{' '}
                <time className="figure" dateTime={received.createdAt}>
                  {utcTime(received.createdAt)} UTC
                </time>
              </>
            )}
            . Nothing is needed from you.
          </p>
        </>
      )}
      {trade.state === 'payout_sent' && (
        <>
          <h2>
            <span className="figure">{formatAmount(amounts.receiveAmount, amounts.receiveCurrency)}</span>{' '}
            {amounts.receiveCurrency} sent to{' '}
            {payoutFiat ? (
              <>
                your account ending <span className="figure">4471</span>.
              </>
            ) : (
              'your sample wallet.'
            )}
          </h2>
          <p>
            Reference <span className="figure">{payoutReference(trade.id)}</span>.{' '}
            {payoutFiat
              ? 'Use it to match the deposit in your bank statement.'
              : 'Use it to identify this simulated payout.'}
          </p>
        </>
      )}
      {trade.state === 'settled' && (
        <>
          <h2>This trade is complete.</h2>
          <p>
            Settled
            {settled && (
              <>
                {' '}
                at{' '}
                <time className="figure" dateTime={settled.createdAt}>
                  {utcTime(settled.createdAt)} UTC
                </time>
              </>
            )}
            .{' '}
            <span className="figure">
              {formatAmount(amounts.receiveAmount, amounts.receiveCurrency)} {amounts.receiveCurrency}
            </span>{' '}
            paid to {payoutFiat ? 'the account ending 4471' : 'your sample wallet'}.
          </p>
        </>
      )}
      {trade.state === 'cancelled' && (
        <>
          <h2>This trade was cancelled.</h2>
          <p>Reason: {trade.cancellationReason} No funds were exchanged.</p>
        </>
      )}
    </section>
  );
}

function TradeContent({ id, organisation }: { id: string; organisation: string }) {
  const {
    data: trade,
    error,
    loading,
    refresh,
  } = useResource(`/trades/${encodeURIComponent(id)}`, tradeDetailSchema);
  if (!trade)
    return (
      <main className={styles.page}>
        <h1>
          Trade <span className="figure">{id}</span>
        </h1>
        {error !== null ? (
          <ResourceFailure
            error={error}
            retry={refresh}
            missing={{
              message: 'This trade is no longer available.',
              action: { label: 'View trades', href: '/trades' },
            }}
          />
        ) : (
          <DataTable
            label="Trade details"
            loading={loading}
            rows={[]}
            rowKey={() => ''}
            columns={[
              { key: 'field', heading: 'Trade', render: () => null },
              { key: 'value', heading: 'Details', render: () => null },
            ]}
          />
        )}
      </main>
    );
  const amounts = tradeAmounts(trade);
  const currencies = pairCurrencies(trade.pair);
  const payoutFiat = isFiat(amounts.receiveCurrency);
  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <nav aria-label="Breadcrumb">
          <Link href="/trades">Trades</Link>
          <span aria-hidden="true">/</span>
          <span className="figure" aria-current="page">
            {trade.id}
          </span>
        </nav>
        <div className={styles.title}>
          <h1>
            Trade <span className="figure">{trade.id}</span>
          </h1>
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
          Booked{' '}
          <time className="figure" dateTime={trade.createdAt}>
            {trade.createdAt.slice(0, 10)} {utcTime(trade.createdAt)} UTC
          </time>{' '}
          · {trade.side === 'SELL' ? 'Sell' : 'Buy'} {currencies.base}{' '}
          {trade.side === 'SELL' ? 'for' : 'with'} {currencies.quote}
        </p>
      </div>
      {error !== null && <ResourceFailure error={error} retry={refresh} />}
      <section className={styles.summary} aria-label="Summary">
        <div className={styles.summaryGrid}>
          <div className={styles.amount}>
            <span>You pay</span>
            <div>
              <strong className="figure">{formatAmount(amounts.payAmount, amounts.payCurrency)}</strong>
              <span className="figure">{amounts.payCurrency}</span>
            </div>
          </div>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
          <div className={styles.amount}>
            <span>You receive</span>
            <div>
              <strong className="figure">
                {formatAmount(amounts.receiveAmount, amounts.receiveCurrency)}
              </strong>
              <span className="figure">{amounts.receiveCurrency}</span>
            </div>
          </div>
          <dl className={styles.summaryDetails}>
            <div>
              <dt>Price</dt>
              <dd className="figure">
                1 {currencies.base} = {formatPrice(trade.clientPrice, currencies.base)} {currencies.quote}
              </dd>
            </div>
            <div>
              <dt>Quote</dt>
              <dd className="figure">{trade.quoteId}</dd>
            </div>
            <div>
              <dt>Fees</dt>
              <dd>Included</dd>
            </div>
          </dl>
        </div>
      </section>
      <div className={styles.grid}>
        <div className={styles.column}>
          <NextStep trade={trade} organisation={organisation} />
          <section className={styles.destination} aria-labelledby="payout-heading">
            <div className={styles.destinationHeading}>
              <h2 id="payout-heading">Payout destination</h2>
              <span className={styles.sample}>{payoutFiat ? 'Sample bank account' : 'Sample wallet'}</span>
            </div>
            <dl className={styles.values}>
              {payoutFiat ? (
                <>
                  <KeyValue label="Bank" value="Royal Sample Bank" />
                  <KeyValue label="Account name" value={organisation} />
                  <KeyValue label="Account" value="···· 4471" numeric />
                </>
              ) : (
                <>
                  <KeyValue label="Network" value={network(amounts.receiveCurrency)} />
                  <KeyValue label="Wallet owner" value={organisation} />
                  <KeyValue label="Address" value={sampleAddress(amounts.receiveCurrency)} numeric />
                </>
              )}
              <KeyValue label="Currency" value={amounts.receiveCurrency} numeric />
              <KeyValue
                label="Payout reference"
                value={payoutReference(trade.id)}
                numeric
                copyValue={payoutReference(trade.id)}
              />
            </dl>
          </section>
        </div>
        <section className={styles.timeline} aria-labelledby="timeline-heading">
          <h2 id="timeline-heading">Timeline</h2>
          <Timeline steps={tradeTimeline(trade)} />
        </section>
      </div>
    </main>
  );
}

export function ClientTrade({ id }: { id: string }) {
  const { persona, loading } = useSession();
  if (loading)
    return (
      <main className={styles.page}>
        <h1>Trade</h1>
        <DataTable
          label="Trading account"
          loading
          rows={[]}
          rowKey={() => ''}
          columns={[{ key: 'account', heading: 'Account', render: () => null }]}
        />
      </main>
    );
  if (persona?.user.role !== 'client' || !persona.organisation)
    return (
      <main className={styles.page}>
        <h1>Trade</h1>
        <EmptyState message="Choose a client persona to view its trades." />
      </main>
    );
  return <TradeContent key={id} id={id} organisation={persona.organisation.name} />;
}
