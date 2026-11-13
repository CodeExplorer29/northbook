# Tasks

Ordered as vertical slices: group 2 gets one thin path working end to end with a fixed price, group 3 deploys it, and later groups widen it.

Groups 1 to 7 are the minimum demonstrable product: live prices, a firm quote, acceptance, staff settlement and the ledger. Groups 8 to 11 complete it and can be trimmed if time is short.


A checkbox is ticked only after the verification stated in the task has passed.

## 1. Scaffold

- [x] 1.0 Initialise the repository for public release: `.gitignore`, `.env.example`, MIT licence and a README stub; verify no secrets or private names are present with a secret scan and a text search
- [x] 1.1 Create the pnpm workspace with `apps/web` (Next.js), `apps/server` (Fastify) and `packages/shared`, with TypeScript strict mode, ESLint and Vitest; verify `pnpm build`, `pnpm lint` and an empty `pnpm test` pass
- [x] 1.2 Add Docker Compose for PostgreSQL with an owner role and a restricted application role, Drizzle with migrations run as owner, and one `pnpm dev` command; verify both processes start, the server health endpoint reports the database is reachable, and the application role cannot run DDL
- [x] 1.3 Add structured logging, request ids (response header, error body, log lines) and the shared error shape and codes from design D15 and D16; verify a test that an error response and its log line carry the same request id
- [x] 1.4 Add a GitHub Actions workflow running lint, type-check and tests against a PostgreSQL service, plus secret scanning; verify the workflow definition with a local dry run or `actionlint`
- [x] 1.5 Add the `/api` proxy from `web` to `server` (forwarding the request id and the client address) and a streaming test endpoint; verify a browser page on `web` receives a JSON response and a server-sent event stream from `server` without calling it directly

## 2. Walking skeleton: quote to settled with a fixed price

- [x] 2.1 Implement the money module and the pair, side and rounding conventions from design D14 as shared types and helpers; verify unit tests for rounding in both directions and for which amount rounds which way on BUY and SELL
- [x] 2.2 Implement the state-machine helper and the quote and trade transition tables in `packages/shared`; verify tests for valid, invalid and repeated transitions
- [x] 2.3 Create the schema for organisations, users, quotes, trades and trade events, and a minimal seed with one approved organisation and one staff user; verify migrations and seed run on an empty database
- [x] 2.4 Implement persona sessions (signed cookie naming a seeded user) with role and organisation scoping applied to every route by default; verify tests that a request with no persona gets `not_authenticated`, a client persona is refused staff routes, and another organisation's data returns `not_found`
- [x] 2.5 Implement the idempotency-key middleware and table (same key and body, same key with different body, in-progress key, missing key); verify integration tests for all four cases
- [x] 2.6 Implement quote request and acceptance against a fixed-price stub, with acceptance in a single guarded transaction and the optional `asOf` clock from design D4 unavailable to HTTP handlers; verify an integration test that 20 concurrent acceptances produce one trade, that a late acceptance returns `quote_expired`, and that no request parameter can set the clock
- [x] 2.7 Implement simulated settlement events (funds received, payout sent, payout confirmed, cancel with a required reason); verify tests for the normal path, an invalid transition, a repeated action and a cancel without a reason
- [x] 2.8 Build a bare trading page and a bare staff trade page (unstyled, with a temporary persona selector) that exercise these endpoints through the proxy; verify with a Playwright test that takes a trade from quote to settled in the browser

## 3. First deployment

- [x] 3.1 Add Dockerfiles for `web` and `server` and the Railway config-as-code files (build, start, pre-deploy migration, health check paths), with seed-if-empty on start; verify the production builds start locally outside Docker with `server` reachable only through `web`, and verify both images build and run against Docker Compose PostgreSQL if Docker is available
- [ ] 3.2 Create the Railway project with `web`, `server` and PostgreSQL, set variables (including both database URLs) and private networking, keep `server` at one replica with sleep disabled, and deploy from GitHub; verify the public URL serves the bare pages and `server` has no public domain. Requires the owner to create the GitHub repository and Railway project
- [x] 3.3 Verify on the deployed instance that a trade can be taken from quote to settled and that the streaming test endpoint delivers events through the proxy without buffering

## 4. Ledger

- [x] 4.1 Create accounts, ledger transactions and entries with insert-only enforcement and the per-currency balance constraint; verify tests that an unbalanced posting and an UPDATE are rejected by the database
- [x] 4.2 Implement posting templates for trade booked, funds received, payout sent and trade cancelled, posted in the same transaction as their transition and once per event; verify a property-based test that every template balances, a test that a repeated event posts once, and that the booked, funded and paid postings for the sample ETH trade equal those in `05-sample-data.json`
- [x] 4.3 Implement balances and the integrity check; verify it passes after a settled trade and reports a deliberately corrupted fixture

## 5. Real pricing

- [x] 5.1 Define the venue adapter interface and normalised order book, and write a recording script that captures public order book messages from a venue to a fixture file; verify a fake adapter test and that the script produces a replayable Kraken fixture
- [x] 5.2 Implement the Kraken adapter with replay; verify by replaying a recording that includes a disconnect and a resynchronisation
- [x] 5.3 Implement the Coinbase adapter and record its fixture; verify by replay
- [x] 5.4 Implement the Binance adapter on the market-data host and record its fixture; verify by replay, and confirm its market list contains no CAD pairs
- [x] 5.5 Implement depth-walk pricing with venue fees for both fixed-base and fixed-quote amounts; verify unit tests for "deeper venue wins" and "insufficient liquidity"
- [x] 5.6 Implement direct and two-leg route enumeration through USD, USDT and USDC and best-route selection; verify a unit test where a synthetic route beats the direct one, including a leg quoted the other way round
- [x] 5.7 Implement staleness exclusion, runtime venue enable and disable from the database, venue health reporting and replay mode selection; verify tests for one stale venue, all stale venues, and a disabled venue no longer being used
- [x] 5.8 Replace the fixed-price stub: apply tier and size-band spread, size limits and guardrails, and store the route snapshot on the quote; verify the two worked examples in design D14 as tests, plus integration tests for tier pricing, limits, unavailable price, and that client responses contain no route or spread
- [ ] 5.9 Deploy and verify that all three venues are reachable from the deployed region, and if one is blocked, change region or disable that venue in the deployed instance

## 6. Design system and shared components

- [x] 6.1 Port `docs/design/02-tokens.css` into the web app's global stylesheet and Tailwind theme, add the Home-only type sizes and on-dark button variants from design D11, and load Geist Sans and Geist Mono; verify a tokens page renders every colour, type size and button variant, and that text and status colours meet WCAG AA contrast
- [x] 6.2 Build AppHeader (light, dark-over-hero and staff variants), DemoNotice, Footer (multi-column and compact) and the PersonaSwitcher with organisation names, verification status, and the shared-data notice, replacing the temporary selector; verify with a Playwright test switching between visitor, both client organisations and staff
- [x] 6.3 Build StatusChip, KeyValue with copy buttons, Timeline, DataTable (roomy and dense), FilterPills and Tabs; verify component tests
- [x] 6.4 Build SkeletonRows, EmptyState, ErrorState (request id and retry) and RateLimitBanner; verify component tests for each
- [x] 6.5 Build SwapWidget (indicative and firm modes, two-way entry, flip, below-minimum, computing and unavailable states) and QuoteCard in its five states with the countdown ending one second before server expiry; verify component tests for each state

## 7. Core demo flow

Stop for review after this group.

- [x] 7.1 Implement the indicative price endpoint and SSE stream; verify tests for a price, an unavailable pair and identical unit price for different amounts
- [x] 7.2 Build Home at `/` with the live indicative widget, responsive down to 390px by stacking the desktop layout; verify at 1440px against the design, at 390px for no horizontal scrolling, and that prices update in place without layout shift
- [x] 7.3 Build Trade at `/trade`: firm widget, inputs collapsing to a summary once quoted, quote card, client-side idempotency keys, recent quotes and open trades with "Action needed"; verify Playwright tests for accept, for expiry with re-quote, and for the late-acceptance message
- [x] 7.4 Build client trade detail at `/trades/:id` with the "What happens next" block for every state, timeline and sample settlement instructions, omitting the funding window line; verify each state renders its own block and no closing time appears
- [x] 7.5 Build staff trade detail at `/staff/trades/:id`: state-appropriate simulated actions, cancel with inline confirmation and reason, pricing and route, and LedgerGroup postings with the integrity check; verify only valid actions are offered, a double click applies once, and a new ledger group appears after each action
- [x] 7.6 Deploy and run the core flow on the public instance; verify sell 50 ETH for CAD from Home to Settled

## 8. Onboarding and seed

- [x] 8.1 Implement the KYB application (fields, lifecycle, idempotent submit, staff approve and reject) and gate firm quotes on approval; verify tests for missing fields, double submit, invalid transition and `kyb_not_approved`
- [x] 8.2 Build Onboarding at `/onboarding` in its draft, submitted, approved and rejected states, and the unverified Trade variant; verify a Playwright test that an unverified organisation sees indicative prices and its status, and that validation lists missing fields
- [x] 8.3 Wire the Home "Start with verification" form to switch to the not-yet-verified organisation and open onboarding with the entered values; verify no user or organisation is created
- [x] 8.4 Implement the full seed from `docs/design/05-sample-data.json` through the real domain functions with supplied clock and prices (design D4); verify seeded screens show the sample figures and the integrity check passes on seeded data

## 9. Remaining pages

- [x] 9.1 Build Quotes at `/quotes` and Trades at `/trades` with filters and empty states; verify organisation scoping and that accepted quotes link to their trade
- [x] 9.2 Build Approvals at `/staff/approvals` with the side panel, approve, and reject with a required reason; verify approving unlocks quoting for that organisation and the switcher shows it as verified
- [x] 9.3 Build the Blotter at `/staff/blotter`: Trades and Quotes tabs, filters, summary row and the "Next step" column; verify next-step text for each state and that the quotes tab shows market price and spread
- [x] 9.4 Build Configuration at `/staff/configuration`: spread grid, quote settings, organisation tiers, venue toggles and status, and the sticky save bar; verify invalid values are refused, a changed lifetime applies to new quotes only, and disabling a venue takes effect
- [x] 9.5 Build Desk at `/staff/desk`: net position per currency valued in CAD at current prices, and spread revenue in total, today and per client, all read from the ledger; verify tests that figures equal the ledger sums, that client rows add up to the total, that a missing price yields no value, and a browser test that booking a trade moves the position

## 10. Architecture page

- [x] 10.1 Generate the quote, trade and KYB state-machine diagrams as SVG from the shared transition tables at build time; verify a test that each diagram contains every state in its table
- [x] 10.2 Build Architecture at `/architecture` with a sticky section list, the overview and price-path diagrams, the idempotency and ledger sections, the "Real / Mocked / In the blueprint" table, and real text for the "Planned" and "Technology" placeholders; verify every item required by the `architecture-page` spec is present and the page is readable at 390px

## 11. Hardening and release

- [x] 11.1 Implement rate limits on public price and quote endpoints using the client address forwarded by the proxy; verify tests that limits return `rate_limited`, that two different client addresses are limited separately, and that the forwarded header is ignored when the request does not come through the proxy
- [x] 11.2 Keep viewer data: no scheduled or interface reset, with a reset route available only when enabled for tests; verify a test that the route is absent by default and that a cancelled trade stays cancelled
- [x] 11.3 Apply loading, empty, error and rate-limited states to every screen and check Home and Trade at 390px; verify each screen with the server stopped, with an empty database and under a forced rate limit
- [ ] 11.4 Add the end-to-end Playwright test in replay mode: approved client sells ETH for CAD, staff settles, integrity check passes; verify it passes locally and in CI
- [x] 11.5 Add the end-to-end test for the buy direction with the amount fixed on the receive side (client receives exactly 2 BTC and pays CAD); verify the paid amount is rounded up, the trade settles and the integrity check passes
- [ ] 11.6 Write the README with a placeholder for the live link, setup, the one-command start, replay mode, the five-step walkthrough and screenshots taken from `docs/review/`; verify every documented command works on a clean clone of the repository
- [ ] 11.7 Run the five-step walkthrough against the deployed instance and put the live link in the README; verify the public instance completes the walkthrough
