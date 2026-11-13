# Tasks

## 1. Project scaffold

- [ ] 1.1 Create the pnpm workspace with `apps/web` (Next.js), `apps/server` (Fastify, entry points `api`, `pricing` and `chain-watcher`) and `packages/shared`; verify `pnpm build` succeeds for all packages
- [ ] 1.2 Add Docker Compose for PostgreSQL and a local dev chain, and a single `pnpm dev` command; verify all four processes start and the API health endpoint returns ok
- [ ] 1.3 Configure TypeScript strict mode, ESLint, Vitest and Playwright; verify `pnpm lint` and an empty `pnpm test` pass
- [ ] 1.4 Add a GitHub Actions workflow running lint, type-check and tests against a PostgreSQL service; verify the workflow file passes `actionlint` or a dry run

## 2. Database and shared foundations

- [ ] 2.1 Set up Drizzle with migrations and a separate restricted application database role; verify migrations apply to an empty database
- [ ] 2.2 Implement the money module in `packages/shared` (decimal type, per-currency precision, desk-favouring rounding); verify unit tests cover rounding in both directions for each currency
- [ ] 2.3 Implement the generic state-machine helper (transition table, guarded update, event row, repeated-transition handling); verify unit and integration tests cover valid, invalid and repeated transitions
- [ ] 2.4 Implement the idempotency-key middleware and table (same key and body, same key with different body, in-progress key, expiry); verify integration tests cover all four cases
- [ ] 2.5 Add the Postgres-backed job queue and a transactional enqueue helper; verify a test shows a rolled-back transaction enqueues nothing

## 3. Price aggregation

- [ ] 3.1 Define the venue adapter interface and normalised order book type; verify with a fake adapter test
- [ ] 3.2 Implement the Kraken adapter (WebSocket book, REST fallback, health); verify by replaying recorded messages including a sequence gap and a disconnect
- [ ] 3.3 Implement the Coinbase adapter; verify by recorded-message replay
- [ ] 3.4 Implement the Binance adapter on the market-data host; verify by recorded-message replay
- [ ] 3.5 Implement the venue registry driven by the `venues` table with runtime enable and disable; verify an integration test shows a disabled venue stops being used within 5 seconds
- [ ] 3.6 Implement depth-walk pricing with venue fees; verify unit tests for the "deeper venue wins" and "insufficient liquidity" scenarios
- [ ] 3.7 Implement direct and two-leg synthetic route enumeration and best-route selection; verify a unit test where a synthetic BTC/CAD route beats the direct one
- [ ] 3.8 Implement staleness exclusion and outlier protection; verify unit tests for one stale venue, all stale venues and an off-market venue
- [ ] 3.9 Expose the internal pricing HTTP endpoints (firm price, indicative mid, venue health) and a recorded-feed replay mode; verify the API process gets a price from the pricing process in replay mode

## 4. Public pricing and site

- [ ] 4.1 Implement the public indicative price endpoint and SSE stream with per-source rate limiting; verify integration tests for price, unavailable and rate-limited responses
- [ ] 4.2 Build the public site shell (home, navigation, demo notice) with light and dark themes; verify it renders at phone width without horizontal scrolling
- [ ] 4.3 Build the swap-style widget (pay and receive fields, asset selectors, indicative label, last-updated time, unavailable state); verify component tests for two-way amount entry and unsupported pairs
- [ ] 4.4 Wire the widget's main action to sign-up for visitors; verify a Playwright test that no quote is created when logged out

## 5. Client accounts

- [ ] 5.1 Implement sign-up, email verification (logged to console in development), login, logout and session expiry with argon2id hashing; verify integration tests including the duplicate-email case
- [ ] 5.2 Implement login throttling; verify a test that repeated failures are temporarily refused
- [ ] 5.3 Implement organisations, member invitations and the admin, trader and viewer roles; verify authorisation tests for each role
- [ ] 5.4 Enforce organisation scoping on every client data route; verify a test that cross-organisation access returns not found for quotes, trades and documents
- [ ] 5.5 Implement separate staff accounts and login with operations, compliance and admin roles, plus a seed script; verify a client session cannot reach any staff route
- [ ] 5.6 Build the client portal shell with onboarding-status gating of the trading screen; verify a Playwright test for the "logged in, not approved" view

## 6. KYB onboarding

- [ ] 6.1 Create the KYB schema (application, beneficial owners, documents, provider checks) and the application state machine; verify transition tests
- [ ] 6.2 Implement document storage behind an interface with authorised download; verify operations-role staff and other organisations are refused
- [ ] 6.3 Build the multi-step application form with save and resume and validation; verify a Playwright test that incomplete submission lists missing items
- [ ] 6.4 Implement idempotent submission and the verification provider interface with a simulator; verify a double submit starts one verification
- [ ] 6.5 Implement the signed provider webhook endpoint with deduplication; verify tests for duplicate and unsigned notifications
- [ ] 6.6 Build the applicant status page including the needs-information loop; verify the note from staff is shown and the requested sections become editable

## 7. Ledger

- [ ] 7.1 Create accounts, ledger transactions and ledger entries with insert-only enforcement and the per-currency balance constraint; verify tests that an unbalanced posting and an UPDATE are both rejected by the database
- [ ] 7.2 Implement the posting API with one-posting-per-source-event and reversal support; verify a test that processing the same event twice yields one transaction
- [ ] 7.3 Define posting templates for trade booked, funds received, payout sent, payout failed or returned, and trade cancelled; verify a property-based test that every template balances for random amounts
- [ ] 7.4 Implement balance queries and the integrity check; verify the check reports a deliberately corrupted fixture

## 8. RFQ quoting

- [ ] 8.1 Create the quotes schema including the stored route snapshot, and the pricing configuration tables (tiers, size bands, limits, quote lifetime); verify migrations and seed data
- [ ] 8.2 Implement the quote request endpoint (either-side amount, tier and size-band spread, rounding, size limits, guardrails, throttling); verify integration tests for each scenario in the `rfq-quoting` spec
- [ ] 8.3 Implement quote acceptance as a single transaction creating the trade, the booking ledger posting, the event and the deadline job; verify a test firing 20 concurrent acceptances yields one trade and one posting
- [ ] 8.4 Verify server-side expiry with a test that accepts just after `expires_at` and receives `quote_expired`
- [ ] 8.5 Build the trading screen: the widget in firm mode, quote card with countdown, accept action, expired state with re-quote; verify a Playwright test for accept and for expiry
- [ ] 8.6 Build the quote history view; verify it lists accepted and expired quotes for the organisation only

## 9. Deposit addresses and chain watcher

- [ ] 9.1 Create the schema for deposit addresses, source wallets, chain cursors and deposits (unique on network, transaction hash, log index); verify migrations and the uniqueness constraint with a test
- [ ] 9.2 Implement deposit address derivation from an extended public key with a per-network index sequence, assigned on KYB approval; verify derived addresses match known test vectors and are unique per organisation
- [ ] 9.3 Define the chain watcher and RPC client interfaces and the Tron stub; verify with a scripted fake RPC client
- [ ] 9.4 Implement the EVM watcher's authoritative pass over finalized blocks (native transfers and supported ERC-20 logs) with the cursor advanced in the same transaction; verify a test that re-processing a block records nothing new and a restart mid-range skips no block
- [ ] 9.5 Implement the advisory pass for detected-but-not-final transfers including withdrawal on reorg; verify with a scripted reorg
- [ ] 9.6 Implement the per-network advisory lock and lag reporting; verify a second watcher instance stays idle and lag is written for the ops console
- [ ] 9.7 Implement sender checks (registered source wallet, screening) and deposit-to-trade matching; verify tests for exact match, several matching trades, no match, unregistered sender and high-risk sender
- [ ] 9.8 Add an end-to-end test against a local dev chain (anvil): send ETH and a test ERC-20 to a deposit address and observe confirmed deposits; verify it runs in CI without external network
- [ ] 9.9 Document Sepolia setup (RPC URL, faucet, test token addresses) in `docs/chain-watcher.md`; verify the watcher detects a real Sepolia transfer following the documented steps

## 10. Trade settlement

- [ ] 10.1 Create the trades, payouts, incoming bank payments and payout destinations schema with the trade and payout state machines; verify transition tests
- [ ] 10.2 Implement payout destinations (bank accounts, wallet addresses) with the wallet screening interface and simulator; verify low-risk approval, high-risk flagging, and refusal to accept a quote without an approved destination
- [ ] 10.3 Implement settlement instructions: unique payment references for bank funding, and the organisation's fixed deposit address with permitted source wallets for on-chain funding; verify both cases and that acceptance is refused without an approved source wallet
- [ ] 10.4 Implement the bank and on-chain payout provider interfaces with simulators delivering signed webhooks; verify duplicate and out-of-order deliveries are handled
- [ ] 10.5 Implement funds confirmation as one code path used by both bank webhooks and matched chain deposits, with exact-amount matching and single application of each payment; verify mismatch and duplicate tests for both sources
- [ ] 10.6 Implement payout sending with a deterministic reference, retry, and unknown-outcome handling by status query; verify a test that a timed-out send followed by a retry produces one payout
- [ ] 10.7 Implement separate bank and on-chain funding windows, the settlement deadline job and read-time deadline enforcement; verify cancellation with a reversing ledger posting, refusal of a late payout, and that a trade with a detected but not final deposit is not cancelled
- [ ] 10.8 Implement failed and returned payout handling; verify a return after settlement marks the trade failed and posts to the ledger
- [ ] 10.9 Build the client trade list and trade detail with state history and instructions; verify a Playwright test of the detail page

## 11. Operations console

- [ ] 11.1 Build the console shell with role-based navigation and the audit log writer applied to every mutating staff route; verify a test that a mutating route without an audit entry fails
- [ ] 11.2 Build the KYB review queue and decision actions; verify only the compliance role can decide and each decision is audited
- [ ] 11.3 Build organisation management (tier, maximum trade size, suspend); verify a tier change affects new quotes only
- [ ] 11.4 Build pricing configuration with validation; verify invalid values are refused and changes are audited with before and after values
- [ ] 11.5 Build the venue status and control page and the chain monitoring status view; verify the last-venue warning, that toggling takes effect, and that watcher lag is shown
- [ ] 11.6 Build the quote and trade blotter with filters and the quote route detail; verify the route, market price and spread are shown to staff and absent from client responses
- [ ] 11.7 Build settlement actions and simulator controls (incoming payment, payout confirmation, failure, duplicate delivery); verify a double-clicked action takes effect once
- [ ] 11.8 Build the exceptions queue including assigning or returning unmatched and held deposits; verify mismatched payments, unmatched deposits, unknown payouts, near-deadline trades and flagged wallets appear
- [ ] 11.9 Build the ledger browser and integrity check action; verify navigation from an entry to its trade
- [ ] 11.10 Build the audit log viewer including document-access records; verify the application role cannot update or delete audit rows

## 12. Architecture page

- [ ] 12.1 Generate state-machine diagrams as SVG from the shared transition tables at build time; verify a test that the diagram contains every state in the tables
- [ ] 12.2 Author the system overview and price-path diagrams and the sections on idempotency, ledger and technology choices; verify each item required by the `architecture-page` spec is present
- [ ] 12.3 Add the page to site navigation and add demo notices to trading, settlement and onboarding pages; verify with a Playwright test
- [ ] 12.4 Verify the page at phone width and in dark mode, and that it contains no configured spread values or internal addresses

## 13. Integration checks

- [ ] 13.1 Add the full end-to-end Playwright tests for both directions: buy crypto funded by simulated wire, and sell ETH funded by a deposit on the local dev chain, each through to settled with the ledger check passing
- [ ] 13.2 Add a failure-path end-to-end test: duplicate webhook, payout timeout and retry, deadline cancellation; verify ledger integrity check passes afterwards
- [ ] 13.3 Run the whole suite in CI in recorded-feed mode; verify the workflow is green
- [ ] 13.4 Write the README with setup, the one-command demo and a seeded walkthrough; verify the documented commands work on a clean checkout

## Workflow follow-up

- Archive the change after review so the specs become the project's source of truth.
