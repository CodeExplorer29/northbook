'use client';

import { useState } from 'react';
import type { QuoteRequest, QuoteResponse, TradeResponse } from '@northbook/shared';
import { QuoteCard } from '../../components/quote-card';
import { SwapWidget, type WidgetPrice } from '../../components/swap-widget';
import { api } from '../../lib/api';
import styles from './quotes.module.css';

function quoteAt(created: number, status: QuoteResponse['status'] = 'active'): QuoteResponse {
  return {
    id: `NB-Q-${created}`,
    pair: 'ETH/CAD',
    side: 'SELL',
    fixed: 'base',
    requestedAmount: '50',
    baseAmount: '50',
    quoteAmount: '207892.50',
    clientPrice: '4157.85',
    payCurrency: 'ETH',
    payAmount: '50',
    receiveCurrency: 'CAD',
    receiveAmount: '207892.50',
    status,
    createdAt: new Date(created).toISOString(),
    expiresAt: new Date(created + 15000).toISOString(),
    replayed: true,
  };
}
function tradeFor(quote: QuoteResponse): TradeResponse {
  return {
    id: 'NB-T-000128',
    quoteId: quote.id,
    organisationId: 'maple',
    pair: quote.pair,
    side: quote.side,
    baseAmount: quote.baseAmount,
    quoteAmount: quote.quoteAmount,
    clientPrice: quote.clientPrice,
    state: 'awaiting_client_funds',
    cancellationReason: null,
    createdAt: '2026-11-12T14:42:07.000Z',
  };
}
function CardExample({
  name,
}: {
  name: 'Active' | 'Ending' | 'Accepting' | 'Expired' | 'Accepted' | 'Late acceptance';
}) {
  const [quote, setQuote] = useState(() =>
    quoteAt(
      Date.now() - (name === 'Ending' ? 11000 : name === 'Expired' || name === 'Late acceptance' ? 16000 : 0),
      name === 'Expired' || name === 'Late acceptance' ? 'expired' : 'active',
    ),
  );
  const [dismissed, setDismissed] = useState(false);
  return (
    <section aria-label={`${name} example`} className={styles.example}>
      <h2 className="type-h3">{name}</h2>
      {dismissed ? (
        <p>Quote dismissed.</p>
      ) : (
        <QuoteCard
          key={quote.id}
          quote={quote}
          {...(name === 'Accepted' ? { trade: tradeFor(quote) } : {})}
          accepting={name === 'Accepting'}
          lateExpired={name === 'Late acceptance'}
          onAccept={async () => {
            await api(`/test/echo?pattern=accept&scenario=${name}`);
            return tradeFor(quote);
          }}
          onCancel={() => {
            setDismissed(true);
          }}
          onRequote={() => {
            setQuote(quoteAt(Date.now()));
          }}
        />
      )}
    </section>
  );
}
function WidgetExample({
  name,
}: {
  name: 'Indicative' | 'Firm' | 'Computing' | 'Unavailable' | 'Below minimum';
}) {
  const [value, setValue] = useState<QuoteRequest>({
    pair: 'ETH/CAD',
    side: 'SELL',
    fixed: 'base',
    amount: name === 'Below minimum' ? '2' : '50',
  });
  const [updatedAt] = useState(() => new Date().toISOString());
  const [moved, setMoved] = useState(false);
  const [action, setAction] = useState('');
  const price: WidgetPrice =
    name === 'Computing'
      ? { status: 'computing' }
      : name === 'Unavailable'
        ? { status: 'unavailable' }
        : {
            status: 'ready',
            unitPrice: value.pair.startsWith('BTC')
              ? '95012.40'
              : value.pair.startsWith('ETH')
                ? moved
                  ? '4200'
                  : '4183.20'
                : '1.3951',
            updatedAt,
            replayed: false,
            cadPerQuote: '1',
          };
  return (
    <section className={styles.example} aria-label={`${name} widget`}>
      <h2 className="type-h3">{name}</h2>
      <SwapWidget
        mode={name === 'Firm' ? 'firm' : 'indicative'}
        value={value}
        onChange={setValue}
        price={price}
        onAction={(request) => {
          setAction(
            name === 'Firm'
              ? `${request.side} ${request.amount} ${request.fixed} · ${request.pair}`
              : 'Choose a client persona to continue.',
          );
        }}
      />
      {action && <p role="status">{action}</p>}
      {name === 'Indicative' && (
        <button
          className="button-secondary"
          type="button"
          onClick={() => {
            setMoved(!moved);
          }}
        >
          Move indicative market
        </button>
      )}
    </section>
  );
}
export default function QuoteComponentsPage() {
  return (
    <main className={styles.page}>
      <div>
        <p className="eyebrow">Northbook / Trading components</p>
        <h1 className="type-h1">One amount. One firm price.</h1>
        <p>Review fixtures. No quote or trade is created by this page.</p>
      </div>
      <div className={styles.grid}>
        {(['Indicative', 'Firm', 'Computing', 'Unavailable', 'Below minimum'] as const).map((name) => (
          <WidgetExample key={name} name={name} />
        ))}
      </div>
      <div className={styles.grid}>
        {(['Active', 'Ending', 'Accepting', 'Expired', 'Accepted', 'Late acceptance'] as const).map(
          (name) => (
            <CardExample key={name} name={name} />
          ),
        )}
      </div>
    </main>
  );
}
