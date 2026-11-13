'use client';

import { pairCurrencies, type QuoteResponse, type TradeResponse } from '@northbook/shared';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ApiError, errorMessage } from '../lib/api';
import { formatAmount, formatPrice } from '../lib/format-money';
import { useNow } from '../lib/use-now';
import { StatusChip } from './data-display';
import styles from './trading.module.css';

// Mount with key={quote.id}: a newly issued quote has a new acceptance lifecycle.
export function QuoteCard({
  quote,
  trade: suppliedTrade,
  accepting = false,
  lateExpired = false,
  onAccept,
  onCancel,
  onRequote,
  payoutLabel,
}: {
  quote: QuoteResponse;
  trade?: TradeResponse;
  accepting?: boolean;
  lateExpired?: boolean;
  onAccept: () => Promise<TradeResponse>;
  onCancel: () => void;
  onRequote: () => void;
  payoutLabel?: string;
}) {
  const now = useNow();
  const [pending, setPending] = useState(false);
  const [trade, setTrade] = useState<TradeResponse | null>(null);
  const [late, setLate] = useState(false);
  const [failure, setFailure] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const deadline = Date.parse(quote.expiresAt) - 1000;
  const duration = Math.max(1, deadline - Date.parse(quote.createdAt));
  const remainingMs = now ? Math.max(0, deadline - now) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const booked = suppliedTrade ?? trade;
  const busy = accepting || pending;
  const accepted = !!booked || quote.status === 'accepted';
  const expired =
    !accepted &&
    !busy &&
    (late || lateExpired || quote.status === 'expired' || (now !== 0 && remainingMs === 0));
  const ending = !expired && !accepted && seconds <= 3 && now !== 0;
  const { base, quote: quoteCurrency } = pairCurrencies(quote.pair);
  async function accept() {
    if (lock.current || busy || accepted || expired || !now || Date.now() >= deadline) return;
    lock.current = true;
    setPending(true);
    setFailure('');
    try {
      setTrade(await onAccept());
      setUncertain(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'quote_expired') {
        setLate(true);
        setUncertain(false);
      } else {
        setFailure(errorMessage(error));
        setUncertain(!(error instanceof ApiError) || error.code === 'internal_error');
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <section
      className={`${styles.quoteCard} ${expired ? styles.expired : ''}`}
      aria-label="Firm quote"
      data-state={
        accepted ? 'accepted' : busy ? 'accepting' : expired ? 'expired' : ending ? 'ending' : 'active'
      }
    >
      <progress
        className={`${styles.countdown} ${ending ? styles.ending : ''}`}
        aria-label="Quote time remaining"
        value={accepted ? duration : remainingMs}
        max={duration}
      />
      <div className={styles.quoteHeading}>
        <span className="eyebrow">Firm quote</span>
        {accepted ? (
          <StatusChip tone="positive">Accepted</StatusChip>
        ) : expired ? (
          <StatusChip tone="danger">Expired</StatusChip>
        ) : (
          <span className={`figure ${ending ? styles.endingText : ''}`}>
            {now ? `Valid for ${seconds}s` : 'Checking expiry…'}
          </span>
        )}
      </div>
      <div className={styles.quoteAmounts}>
        {[
          [quote.payAmount, quote.payCurrency, 'You pay'],
          [quote.receiveAmount, quote.receiveCurrency, 'You receive'],
        ].map(([amount, currency, label]) => (
          <div key={label}>
            <span className={styles.amountLabel}>{label}</span>
            <div className={styles.displayAmount}>
              <span className={`figure ${styles.amountNumber}`}>
                {formatAmount(amount!, currency as QuoteResponse['payCurrency'])}
              </span>
              <span className={`figure ${styles.currency}`}>{currency}</span>
            </div>
          </div>
        ))}
      </div>
      <dl className={styles.quoteDetails}>
        <div>
          <dt>Price</dt>
          <dd className={`figure ${styles.unitPrice}`}>
            1 {base} = {formatPrice(quote.clientPrice, base)} {quoteCurrency}
          </dd>
        </div>
        <div>
          <dt>Payout to</dt>
          <dd>
            {payoutLabel ??
              (quote.receiveCurrency === 'CAD' || quote.receiveCurrency === 'USD'
                ? 'Bank ···· 4471'
                : 'Demo wallet')}{' '}
            <span className={styles.sampleTag}>Sample</span>
          </dd>
        </div>
      </dl>
      {failure && (
        <p className={styles.alert} role="alert">
          {failure}
        </p>
      )}
      {accepted ? (
        <>
          <div className={styles.booked}>
            <strong>Trade booked</strong>
            {booked && (
              <span className="figure">
                {booked.id} · {new Date(booked.createdAt).toLocaleTimeString('en-GB', { timeZone: 'UTC' })}{' '}
                UTC
              </span>
            )}
          </div>
          <Link
            className={`button-primary ${styles.fullWidth}`}
            href={booked ? `/trades/${booked.id}` : '/trades'}
          >
            View trade
          </Link>
        </>
      ) : uncertain ? (
        <>
          <p className={styles.alert} role="alert">
            Acceptance could not be confirmed. Check your trades before requesting another quote.
          </p>
          <Link className={`button-secondary ${styles.fullWidth}`} href="/trades">
            Check trades
          </Link>
        </>
      ) : expired ? (
        <>
          <p className={late || lateExpired ? styles.alert : styles.expiryMessage} role="status">
            {late || lateExpired
              ? 'This quote expired before we received your acceptance. No trade was made.'
              : 'This quote has expired. No trade was made.'}
          </p>
          <button type="button" className={`button-primary ${styles.fullWidth}`} onClick={onRequote}>
            Request new quote
          </button>
        </>
      ) : (
        <>
          <div className={styles.quoteActions}>
            <button
              type="button"
              className={`button-primary ${styles.fullWidth}`}
              disabled={busy || !now}
              onClick={() => {
                void accept();
              }}
            >
              {busy ? 'Accepting…' : 'Accept quote'}
            </button>
            <button type="button" className={styles.cancel} disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          </div>
          <p className={styles.disclaimer}>This price is guaranteed until the timer ends.</p>
        </>
      )}
    </section>
  );
}
