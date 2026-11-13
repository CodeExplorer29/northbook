import { readFile } from 'node:fs/promises';
import Image from 'next/image';
import { quoteMachine, tradeMachine, kybMachine, type StateMachine } from '@northbook/shared';
import styles from './architecture.module.css';

export const metadata = {
  title: 'Architecture · Northbook',
  description: 'How market data becomes a firm quote, one trade and an exact, balanced ledger.',
};
export const dynamic = 'force-static';
const sections = [
  ['overview', 'Overview'],
  ['pricing', 'From order book to quote'],
  ['quote-life', 'Quote lifecycle'],
  ['trade-life', 'Trade lifecycle'],
  ['once', 'Exactly one trade per quote'],
  ['ledger', 'Ledger'],
  ['real', 'Real, mocked, planned'],
  ['tech', 'Technology'],
];
async function StateDiagram({
  name,
  title,
  machine,
}: {
  name: string;
  title: string;
  machine: StateMachine<string>;
}) {
  const source = await readFile(`${process.cwd()}/public/diagrams/${name}.svg`, 'utf8');
  const dimensions = source.match(/width="(\d+)" height="(\d+)"/);
  if (!dimensions) throw new Error('Generated diagram has no dimensions. Run pnpm diagrams:generate.');
  const alt = `${title}: ${machine.transitions.map((edge) => `${edge.from.replaceAll('_', ' ')} → ${edge.to.replaceAll('_', ' ')} via ${edge.event.replaceAll('_', ' ')} (${edge.actor})`).join('; ')}.`;
  return (
    <figure className={styles.diagram}>
      <div role="region" aria-label={`${title} diagram`} tabIndex={0} className={styles.diagramScroll}>
        <Image
          src={`/diagrams/${name}.svg`}
          width={Number(dimensions[1])}
          height={Number(dimensions[2])}
          alt={alt}
          unoptimized
          className={styles.stateImage}
        />
      </div>
      <figcaption>
        Generated from the same transition table used by the application. Scroll within the diagram on small
        screens.
      </figcaption>
    </figure>
  );
}
function Box({ title, detail, simulated = false }: { title: string; detail: string; simulated?: boolean }) {
  return (
    <div className={`${styles.box} ${simulated ? styles.simulated : ''}`}>
      <strong>{title}</strong>
      <small>{detail}</small>
    </div>
  );
}
const ledger = [
  ['Client receivable · Maple Ridge', '50.00000000', '—', 'ETH'],
  ['Trading position', '—', '50.00000000', 'ETH'],
  ['Trading position', '208,622.50', '—', 'CAD'],
  ['Client payable · Maple Ridge', '—', '207,892.50', 'CAD'],
  ['Spread revenue', '—', '730.00', 'CAD'],
];
const built = [
  ['01 · Specify', 'Requirements written as testable scenarios in OpenSpec before any code.'],
  ['02 · Design', 'Recorded decisions with their trade-offs: data model, idempotency, rounding, deployment.'],
  ['03 · Implement', 'AI coding agents build each task against the spec, under review and direction.'],
  ['04 · Verify', 'Unit, integration and browser tests check each requirement end to end.'],
];
export default function ArchitecturePage() {
  return (
    <>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <span className="eyebrow">Technology demo</span>
          <h1>An OTC trading desk, built spec-first with AI.</h1>
          <p>
            Northbook is a working demonstration of how I take a product from requirements to running
            software: written specifications, explicit design decisions, AI coding agents for implementation,
            and tests that verify every requirement. This page explains what was built and why.
          </p>
          <ol className={styles.built} aria-label="How it was built">
            {built.map(([step, copy]) => (
              <li key={step}>
                <span className="figure">{step}</span>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </header>
      <main className={`${styles.wrap} ${styles.main}`}>
        <nav className={styles.toc} aria-label="On this page">
          <span className="eyebrow">On this page</span>
          {sections.map(([id, title], index) => (
            <a key={id} href={`#${id}`}>
              <span className="figure">{String(index + 1).padStart(2, '0')}</span>
              {title}
            </a>
          ))}
        </nav>
        <article className={styles.article}>
          <section id="overview" className={styles.section}>
            <span className="eyebrow">01</span>
            <h2>Overview</h2>
            <p>
              Northbook reads order books from Kraken, Coinbase and Binance, prices the best available route,
              and turns an accepted quote into exactly one trade. Identity checks and money movement are
              simulated; pricing, authorisation, trade transitions and ledger postings execute real
              application logic.
            </p>
            <div
              className={styles.diagram}
              role="img"
              aria-label="System overview: client app and staff console use the Next.js web proxy. A single Fastify server holds market data, pricing, quotes, trades and ledger logic, with PostgreSQL storage. Kraken, Coinbase and Binance provide public market data. Identity, bank and chain events are simulated."
            >
              <span className={styles.label}>People · browser → Next.js web proxy</span>
              <div className={styles.two}>
                <Box title="Client app" detail="Indicative prices · firm quotes · tracking" />
                <Box title="Staff console" detail="Approvals · blotter · settlement · settings" />
              </div>
              <div className={styles.arrow} aria-hidden="true">
                ↓
              </div>
              <span className={styles.label}>One Fastify server · real domain logic</span>
              <div className={styles.flow}>
                <Box title="Market data" detail="Fresh, normalised order books" />
                <span aria-hidden="true">→</span>
                <Box title="Pricing & routing" detail="Depth · fees · spread" />
                <span aria-hidden="true">→</span>
                <Box title="Quote → trade" detail="Guarded acceptance" />
                <span aria-hidden="true">→</span>
                <Box title="Ledger" detail="Balanced postings" />
              </div>
              <Box
                title="PostgreSQL"
                detail="Exact numeric amounts · guarded transactions · append-only entries"
              />
              <div className={styles.two}>
                <div>
                  <span className={styles.label}>Public market data · live or replay</span>
                  <div className={styles.sources}>
                    <Box title="Kraken" detail="Direct and cross markets" />
                    <Box title="Coinbase" detail="Public order books" />
                    <Box title="Binance" detail="Market-data host" />
                  </div>
                </div>
                <div>
                  <span className={styles.label}>Simulated boundaries</span>
                  <div className={styles.sources}>
                    <Box title="Identity" detail="Persona and KYB checks" simulated />
                    <Box title="Bank" detail="Funding and payouts" simulated />
                    <Box title="Chain" detail="Deposits and confirmations" simulated />
                  </div>
                </div>
              </div>
            </div>
            <p>
              Only web receives browser traffic. It proxies REST and server-sent events to the private server.
              Pricing holds long-lived venue connections in that single server process; PostgreSQL owns
              durable state. Replay mode reads recorded public messages, so the same flow works offline.
            </p>
          </section>
          <section id="pricing" className={styles.section}>
            <span className="eyebrow">02</span>
            <h2>From order book to quote</h2>
            <p>
              Each firm request fixes either the base amount or the quote amount. Pricing compares direct
              markets and two-leg routes through USD, USDT or USDC, walking the full requested depth. BUY
              walks asks and adds fees; SELL walks bids and deducts fees. Reversed markets are inverted per
              leg. Stale or disabled venues are excluded; unavailable depth produces no quote.
            </p>
            <div
              className={styles.diagram}
              role="img"
              aria-label="SELL example: best fee-inclusive market price 4,172.45 CAD per ETH, less 35 basis points, yields an unrounded client price of 4,157.846425. Selling 50 ETH receives 207,892.32 CAD after rounding down."
            >
              <span className={styles.label}>Worked SELL example · Tier 1 · 50 ETH for CAD</span>
              <div className={styles.pricePath}>
                <Box title="4,172.45 CAD" detail="Best market price after venue fees" />
                <span aria-hidden="true">− 35 bps →</span>
                <Box title="4,157.846425" detail="Unrounded CAD per ETH" />
                <span aria-hidden="true">× 50 →</span>
                <Box title="207,892.32 CAD" detail="Client receives · rounded down" />
              </div>
              <p className={styles.note}>
                A market price of 4,172.45 beats the sample direct route at 4,169.13 for this SELL. The client
                sees one all-in price; only staff see the route and spread.
              </p>
            </div>
            <p>
              Tier and pre-spread CAD size choose the spread band. Limits and a final market-cost guardrail
              protect each quote. Decimal arithmetic keeps intermediate values unrounded: a computed payment
              rounds up, a computed receipt rounds down, and the fixed amount stays exact.
            </p>
            <p>
              In the BUY example, receiving exactly <span className="figure">2 BTC</span> at a market cost of{' '}
              <span className="figure">95,247.00 CAD</span> per BTC plus{' '}
              <span className="figure">35 bps</span> requires <span className="figure">191,160.73 CAD</span>,
              rounded up. Public indicative pricing instead uses one fee-inclusive midpoint and reference
              spread, independent of amount and client tier. It refreshes every two seconds and is never
              executable.
            </p>
          </section>
          <section id="quote-life" className={styles.section}>
            <span className="eyebrow">03</span>
            <h2>Quote lifecycle</h2>
            <p>
              A firm quote’s amounts, price and expiry stay fixed once issued. The default lifetime is 15
              seconds; configuration changes affect new quotes only. The client countdown ends one second
              before server expiry, but network delay can still make an acceptance late. The database clock
              decides validity.
            </p>
            <StateDiagram name="quote" title="Quote lifecycle" machine={quoteMachine} />
            <p>
              Expiry is a time comparison on reads and acceptance, with no expiry job queue. A timely
              acceptance is honoured at the locked price even if the market has moved.
            </p>
          </section>
          <section id="trade-life" className={styles.section}>
            <span className="eyebrow">04</span>
            <h2>Trade lifecycle</h2>
            <p>
              Staff trigger funds received, payout sent and payout confirmed as simulated events. Each
              permitted transition records its actor and time. Only a trade awaiting client funds can be
              cancelled, and cancellation requires a client-visible reason. There is no unenforced funding
              deadline.
            </p>
            <StateDiagram name="trade" title="Trade lifecycle" machine={tradeMachine} />
            <h3>Verification lifecycle</h3>
            <p>
              Clients submit the seeded organisation’s application. A staff decision approves or rejects it;
              only approval unlocks firm quoting. Required fields and beneficial ownership totals are
              validated, while actual identity and KYB checks remain simulated.
            </p>
            <StateDiagram name="kyb" title="KYB lifecycle" machine={kybMachine} />
          </section>
          <section id="once" className={styles.section}>
            <span className="eyebrow">05</span>
            <h2>Exactly one trade per quote</h2>
            <p>
              Quote requests and acceptances carry an <code>Idempotency-Key</code>. The server reserves the
              key with a hash of the request. The same key and body return the stored response; different
              content returns <code>idempotency_conflict</code>. An in-progress key returns{' '}
              <code>idempotency_in_progress</code>, so callers can retry without applying another action.
            </p>
            <p>
              Acceptance uses one transaction: a guarded update requires an active, unexpired quote, then
              creates the trade, its event and its booking posting. A <code>UNIQUE (quote_id)</code>{' '}
              constraint is the final defence. Concurrent acceptances with different keys converge on the same
              trade; failed booking rolls everything back. Integration tests race 20 acceptances.
            </p>
            <pre className={styles.code}>{`POST /api/quotes/NB-Q-000342/accept  200  NB-T-000128
Same quote, retried acceptance       200  NB-T-000128
Late acceptance of an expired quote  410  quote_expired`}</pre>
            <p>
              The client receives: “This quote expired before we received your acceptance. No trade was made.”
              An uncertain network result is treated separately and can be retried with the same key.
            </p>
          </section>
          <section id="ledger" className={styles.section}>
            <span className="eyebrow">06</span>
            <h2>Ledger</h2>
            <p>
              Booking, funds received, payout sent and cancellation each post a balanced ledger transaction in
              the same database transaction as their event, at most once per event. Payout confirmation
              records a lifecycle event without another money movement. Debits equal credits within each
              currency, never across currencies.
            </p>
            <p>
              Historical booking <span className="figure">NB-T-000128</span> uses the supplied sample price of{' '}
              <span className="figure">4,157.85 CAD</span>. Its exact amounts below differ from the live
              rounding example above because the historical seed supplies that already rounded price.
            </p>
            <div className={styles.tableScroll} role="region" aria-label="Sample booking ledger" tabIndex={0}>
              <table className={styles.table}>
                <caption>Historical sample · 50 ETH sold for 207,892.50 CAD</caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Debit</th>
                    <th scope="col">Credit</th>
                    <th scope="col">Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(([account, debit, credit, currency]) => (
                    <tr key={`${account}:${currency}`}>
                      <th scope="row">{account}</th>
                      <td className="figure">{debit}</td>
                      <td className="figure">{credit}</td>
                      <td className="figure">{currency}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Balanced</th>
                    <td colSpan={3}>
                      ETH <span className="figure">50 = 50</span> · CAD{' '}
                      <span className="figure">208,622.50 = 208,622.50</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p>
              PostgreSQL numeric columns and decimal strings preserve exact amounts. Role privileges and
              triggers refuse UPDATE and DELETE on posted entries; corrections are linked reversing
              transactions. A deferred constraint checks per-currency balance at commit. The integrity check
              independently finds unbalanced or missing postings and ensures settled trades’ client
              obligations net to zero.
            </p>
          </section>
          <section id="real" className={styles.section}>
            <span className="eyebrow">07</span>
            <h2>What is real, mocked, and planned</h2>
            <div className={styles.scopeCards}>
              <div>
                <h3>Real</h3>
                <p>
                  Market adapters and replay, depth routing, exact money, tiered quoting, authorisation, state
                  machines, concurrency guards, ledger postings and integrity checks.
                </p>
              </div>
              <div>
                <h3>Mocked</h3>
                <p>
                  Sign-in through shared demo personas, identity and KYB verification, bank transfers,
                  on-chain deposits, confirmations and wallet screening. No real funds move.
                </p>
              </div>
              <div>
                <h3>In the blueprint</h3>
                <p>
                  Production identity and settlement integrations, member access, payout approvals, hedging,
                  reconciliation, exceptions, audit history and notifications.
                </p>
              </div>
            </div>
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Real mocked and blueprint comparison"
              tabIndex={0}
            >
              <table className={styles.comparison}>
                <caption>How the demonstration relates to the full blueprint</caption>
                <thead>
                  <tr>
                    <th scope="col">Capability</th>
                    <th scope="col">Real</th>
                    <th scope="col">Mocked</th>
                    <th scope="col">In the blueprint</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Pricing and execution</th>
                    <td>Venue feeds, replay, routes, spread, quotes and ledger</td>
                    <td>No market hedge is executed</td>
                    <td>Positions, automated hedging and risk controls</td>
                  </tr>
                  <tr>
                    <th scope="row">Identity and access</th>
                    <td>Server roles and organisation isolation</td>
                    <td>Persona switcher replaces authentication</td>
                    <td>Registration, email verification, members and two-factor authentication</td>
                  </tr>
                  <tr>
                    <th scope="row">Business verification</th>
                    <td>Application validation and approval lifecycle</td>
                    <td>Staff decisions stand in for KYB checks</td>
                    <td>Documents and verification vendors</td>
                  </tr>
                  <tr>
                    <th scope="row">Bank and chain settlement</th>
                    <td>Transitions, exact obligations and postings</td>
                    <td>Staff simulate deposits, payouts and confirmations</td>
                    <td>Bank webhooks, chain watchers, wallet screening and payout approval workflow</td>
                  </tr>
                  <tr>
                    <th scope="row">Operations</th>
                    <td>Approvals, blotter, pricing configuration and integrity check</td>
                    <td>Fictional organisations and settlement instructions</td>
                    <td>Reconciliation, exceptions queue, audit log and notifications</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Every persona shares this demo’s data, and changes are kept. The blueprint describes a
              production system; the deferred capabilities above are not implemented here. Northbook is an
              independent demonstration, not affiliated with any company.
            </p>
          </section>
          <section id="tech" className={styles.section}>
            <span className="eyebrow">08</span>
            <h2>Technology</h2>
            <dl className={styles.technology}>
              <div>
                <dt>Client and console</dt>
                <dd>
                  Next.js and React provide the public site and interactive screens in one web app. The
                  same-origin proxy keeps session cookies first-party and streams prices without exposing the
                  server.
                </dd>
              </div>
              <div>
                <dt>API and pricing</dt>
                <dd>
                  TypeScript and Fastify provide shared contracts and explicit request boundaries. A
                  long-lived Node.js process owns venue connections and in-memory order books; pricing can
                  later be split behind the same interface.
                </dd>
              </div>
              <div>
                <dt>Storage and money</dt>
                <dd>
                  PostgreSQL provides transactions, guarded updates, uniqueness and deferred ledger
                  constraints. Drizzle keeps schema and migrations close to TypeScript. Decimal.js avoids
                  binary floating-point rounding.
                </dd>
              </div>
              <div>
                <dt>Shared correctness</dt>
                <dd>
                  Zod validates request and response contracts. Shared transition tables drive the application
                  and the SVGs above, preventing hand-maintained diagrams from drifting.
                </dd>
              </div>
              <div>
                <dt>Verification</dt>
                <dd>
                  Vitest covers domain and real PostgreSQL integration tests; property-based checks exercise
                  balanced posting templates. Playwright tests browser journeys against recorded market data.
                </dd>
              </div>
              <div>
                <dt>Deployment design</dt>
                <dd>
                  Dockerfiles and Railway configuration define public web, one private server replica and
                  PostgreSQL. One server keeps in-memory pricing coherent.
                </dd>
              </div>
              <div>
                <dt>Type and interface</dt>
                <dd>
                  Locally hosted Geist Sans and Geist Mono, shared CSS tokens and tabular figures keep labels
                  and exact amounts legible without a font-service dependency.
                </dd>
              </div>
            </dl>
            <p className={styles.note}>
              Source repository:{' '}
              <a href="https://github.com/CodeExplorer29/northbook">github.com/CodeExplorer29/northbook</a>
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
