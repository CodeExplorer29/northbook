'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { homeVerificationSchema, type QuoteRequest } from '@northbook/shared';
import { useSession } from '../components/demo-session';
import { ResourceFailure } from '../components/feedback';
import { SwapWidget } from '../components/swap-widget';
import { useIndicativePrice } from '../lib/use-indicative-price';
import styles from './home.module.css';

const reasons = [
  ['Price Certainty', 'One firm price for your full amount, held while you decide.'],
  ['Deep Liquidity', 'Aggregated across multiple exchanges and market makers, priced for your full size.'],
  [
    'All-in pricing, no added fees',
    'One number covers everything. What you see is what you pay and what you receive.',
  ],
  ['One click, one trade', 'Double clicks, retries and timeouts can never book the same quote twice.'],
];
const benefits = [
  [
    'Verified counterparties',
    'Every business is reviewed before it can request a firm quote.',
    'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z M9 12l2 2 4-4',
  ],
  [
    'Ledger-backed settlement',
    'Every movement of funds posts to a balanced double-entry ledger.',
    'M4 4h16v16H4z M12 4v16M4 10h16',
  ],
  [
    'Fiat and crypto, both ways',
    'BTC, ETH, USDC and USDT against CAD or USD, buy or sell.',
    'M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4',
  ],
];
const promises = [
  ['Firm Quote', 'Locked on request and honoured in full. The quote never changes once shown.'],
  ['Best-route execution', 'Direct and two-leg routes compared on every request, venue fees included.'],
  [
    'Clear funding, referenced payout',
    'Exact instructions on the way in, a traceable payout on the way out.',
  ],
  [
    'Real logic, simulated rails',
    'Pricing and ledger are real. Identity checks, bank transfers and chain transfers are simulated.',
  ],
];
const questions = [
  [
    'When should I use an OTC desk instead of an order book?',
    'When your size would move the market. You get one price for the full amount instead of filling across many levels.',
  ],
  [
    'Is the quoted price final?',
    'Yes. A firm quote is honoured at the quoted price if you accept it before it expires.',
  ],
  [
    'What are the trade-size limits?',
    'Each quote must fall between the desk’s minimum and maximum, shown when you request a price.',
  ],
  ['Which assets can I trade?', 'BTC, ETH, USDC and USDT against CAD or USD.'],
  [
    'Who can request a firm quote?',
    'Any business that has completed verification. Visitors see indicative prices only.',
  ],
  [
    'How does settlement work?',
    'You send funds using the instructions on your trade page. The desk confirms receipt, sends your payout and marks the trade settled.',
  ],
];
export default function HomePage() {
  const { persona, openPersonas, startVerification } = useSession();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const startLock = useRef(false);
  const router = useRouter();
  const [request, setRequest] = useState<QuoteRequest>({
    pair: 'ETH/CAD',
    side: 'SELL',
    fixed: 'base',
    amount: '50',
  });
  const {
    price,
    minimumCad,
    error: priceError,
    retry: retryPrice,
  } = useIndicativePrice(request.pair, request.side);
  function startQuote() {
    if (persona?.user.role === 'client') router.push('/trade');
    else openPersonas();
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (startLock.current) return;
    const data = new FormData(event.currentTarget);
    const fields = homeVerificationSchema.safeParse({
      legalName: String(data.get('businessName') ?? ''),
      workEmail: String(data.get('workEmail') ?? '').trim(),
      monthlyVolume: String(data.get('monthlyVolume') ?? ''),
    });
    if (!fields.success) {
      setStartError(fields.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    startLock.current = true;
    setStarting(true);
    setStartError('');
    try {
      if (!(await startVerification(fields.data)))
        setStartError('Could not start verification. Please retry.');
    } catch {
      setStartError('Could not start verification. Please retry.');
    } finally {
      startLock.current = false;
      setStarting(false);
    }
  }
  return (
    <main className={styles.home}>
      <div className={styles.heroBand}>
        <section className={`${styles.wrap} ${styles.hero}`} aria-labelledby="hero-heading">
          <div className={styles.heroCopy}>
            <h1 id="hero-heading" className="type-display-xl">
              OTC trading,
              <br />
              priced to the last cent.
            </h1>
            <p>
              Firm RFQ quotes for businesses moving size between digital assets and fiat. One all-in price, no
              last look, and settlement you can follow from booking to payout.
            </p>
            <div className={styles.actions}>
              <button type="button" className="button-primary-on-dark" onClick={startQuote}>
                Get a firm quote
              </button>
              <a href="#how" className="button-secondary-on-dark">
                How it works
              </a>
            </div>
          </div>
          <div className={styles.priceWidget}>
            <ResourceFailure error={priceError} retry={retryPrice} />
            <SwapWidget
              mode="indicative"
              value={request}
              onChange={setRequest}
              price={price}
              minimumCad={minimumCad}
              onAction={startQuote}
            />
          </div>
        </section>
      </div>
      <section className={styles.why}>
        <div className={styles.wrap}>
          <h2 className="eyebrow">Why Northbook</h2>
          <ol className={styles.reasons}>
            {reasons.map(([title, copy], index) => (
              <li key={title}>
                <span className="figure">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className={styles.built}>
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.sectionCopy}>
            <p className="eyebrow">Solutions for size</p>
            <h2 className="type-section">
              Deep books.
              <br />
              Exact settlement.
            </h2>
            <p>
              Northbook walks live order books for your full amount, picks the best route, and tracks the
              trade until the payout lands.
            </p>
          </div>
          <ul className={styles.benefits}>
            {benefits.map(([title, copy, path]) => (
              <li key={title}>
                <span className={styles.benefitIcon}>
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d={path} />
                  </svg>
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className={styles.desk}>
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={styles.sectionCopy}>
            <p className={`eyebrow ${styles.mint}`}>The desk</p>
            <h2 className="type-section">
              Bespoke pricing
              <br />
              for meaningful size.
            </h2>
            <p>
              Built for payments firms, fintechs and money services businesses. Spreads follow your tier and
              trade size, and every quote arrives as a single all-in price with a clear window to accept it.
            </p>
            <Link href="/architecture">
              Read the architecture <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ul className={styles.promises}>
            {promises.map(([title, copy]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section id="how" className={styles.how}>
        <div className={styles.wrap}>
          <div className={styles.sectionCopy}>
            <p className="eyebrow">How it works</p>
            <h2 className="type-section">
              From RFQ to payout
              <br />
              in three steps.
            </h2>
            <p>Transparent pricing, live venue data and a process built for treasury teams.</p>
          </div>
          <ol className={styles.steps}>
            <li>
              <span className="figure">01 · Verify</span>
              <div>
                <h3>Get verified</h3>
                <p>
                  Submit your business and its owners once. The desk reviews and approves your organisation.
                </p>
              </div>
            </li>
            <li>
              <span className="figure">02 · Quote</span>
              <div>
                <h3>Lock your price</h3>
                <p>Request a firm quote and accept it before the timer ends.</p>
              </div>
            </li>
            <li>
              <span className="figure">03 · Settle</span>
              <div>
                <h3>Follow it through</h3>
                <p>Send funds as instructed and track every stage until your payout arrives.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>
      <section className={styles.faq} aria-labelledby="faq-heading">
        <div className={styles.wrap}>
          <h2 id="faq-heading" className="type-section">
            Frequently asked questions
          </h2>
          <div className={styles.questions}>
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className={styles.start}>
        <div className={styles.wrap}>
          <div className={`band-dark ${styles.cta}`}>
            <div className={styles.sectionCopy}>
              <h2 className="type-section">Ready to start?</h2>
              <p>
                Tell us about your business and what you expect to trade. Once verified, firm quotes are
                available whenever you need them.
              </p>
            </div>
            <form
              onSubmit={(event) => {
                void verify(event);
              }}
            >
              <label htmlFor="business-name" className={styles.srOnly}>
                Business legal name
              </label>
              <input
                id="business-name"
                name="businessName"
                placeholder="Business legal name"
                autoComplete="organization"
                maxLength={200}
                disabled={starting}
              />
              <label htmlFor="work-email" className={styles.srOnly}>
                Work email
              </label>
              <input
                id="work-email"
                name="workEmail"
                type="email"
                placeholder="Work email"
                autoComplete="email"
                maxLength={254}
                disabled={starting}
              />
              <label htmlFor="monthly-volume" className={styles.srOnly}>
                Expected monthly volume
              </label>
              <select id="monthly-volume" name="monthlyVolume" defaultValue="" disabled={starting}>
                <option value="" disabled>
                  Expected monthly volume
                </option>
                <option>Under 250,000 CAD</option>
                <option>250,000 to 1,000,000 CAD</option>
                <option>Over 1,000,000 CAD</option>
              </select>
              {startError && <p role="alert">{startError}</p>}
              <button className="button-primary" type="submit" disabled={starting}>
                {starting ? 'Opening application…' : 'Start verification'}
              </button>
              <p>Demonstration only. Identity checks are simulated.</p>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
