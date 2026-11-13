# Design: Demo Slice

## Context

See `proposal.md` for scope. This is a reduced build of the blueprint in `docs/blueprint/design.md`; decisions there that still apply are referenced by number (for example "blueprint D6") instead of being repeated.

Constraints: one developer, a short timeline, must run locally with one command and survive a live demo without network access.

## Goals / Non-Goals

**Goals:**

- A viewer can complete the whole journey in a few minutes with no typing beyond trade amounts.
- The parts that are real (pricing, acceptance, ledger) are built to production standard and tested for concurrency.
- The mocked parts sit behind the same seams the blueprint defines, so replacing a mock does not change its callers.

**Non-Goals:**

- Security of the persona switcher. It is a demo convenience and is labelled as such.
- Multi-instance deployment.

## Decisions

### D1. Two processes: Next.js web and one Node.js server

```
Browser ──► Next.js web ──REST + SSE──► Node.js server (Fastify) ──► PostgreSQL
                                           ├─ api module
                                           └─ pricing module ──WS/REST──► Kraken · Coinbase · Binance
```

A pnpm workspace with `apps/web`, `apps/server` and `packages/shared`. Pricing runs inside the server process as a module with the same interface the blueprint gives the separate pricing process (blueprint D1), so it can be split out later without touching callers.

- **Why not Next.js alone**: the pricing module holds long-lived WebSocket connections and in-memory order books.
- **Why not three processes**: one fewer thing to start and deploy; the failure isolation it buys does not matter in a demo.

### D2. PostgreSQL only; no job queue

There is no job queue in this slice: quotes expire by time comparison at read and accept (blueprint D6), and settlement is staff-driven. One in-process timer exists and nothing else runs in the background: the pricing module polls venue configuration every 2 seconds. It is safe because the server runs as a single instance.

### D3. Persona sessions

Choosing a persona sets a signed, httpOnly session cookie naming a seeded user. From there everything is ordinary: the server resolves the user, role and organisation from the session and applies the same authorisation and organisation scoping a real login would feed. Only the "prove who you are" step is skipped.

- **Alternative considered**: client-side role toggle with no server session. Rejected because it would make authorisation fake, and server-side authorisation is one of the things being demonstrated.

### D4. Seed

A single seed module defines organisations (one approved on a good tier, one approved on the default tier, one with a draft application), users, pricing configuration and a handful of historical quotes and trades. Its inputs — organisation names, people, pairs, amounts, client prices, market prices, routes, spreads and timestamps — come from `docs/design/05-sample-data.json`, so the running demo shows the same figures as the design.

Historical quotes and trades are written by calling the real domain functions, so their state events and ledger entries are produced by the real transition and posting code, not hand-written rows. Two things differ from a live request and are available only to the seed and to tests, never to an HTTP handler:

- **An explicit clock.** Domain functions take an optional `asOf` timestamp. Live requests never pass it, so expiry is judged by the database clock (D6); the seed passes the historical time, which is what lets a quote issued "yesterday" be accepted within its own lifetime.
- **A supplied price.** The seed gives the market price and route recorded in the sample data instead of asking the pricing module, since live books cannot reproduce historical figures.

Historical identifiers are supplied internally alongside the clock and price, never accepted from HTTP. The sample data’s explicit 2026-11-12 date is preserved; “Yesterday” means 2026-11-11. The accepted quote 331 also receives a settled trade outside the six-row blotter preview. Missing historical market prices are back-calculated using the sample tier/spread configuration and marked as derived sample data; unavailable venue depth is not invented. Displayed historical unit prices are informational; exact pay/receive amounts determine the supplied price.

The running demo keeps its data: nothing restores the seed on a schedule and the interface has no reset action. A reset operation exists for local development and tests only (`pnpm db:reset`, and a `POST /demo/reset` route that is registered only when `DEMO_RESET=enabled`, which the browser tests set). It truncates all application tables and re-runs the seed in one transaction under an advisory lock, and an overlapping reset returns `reset_in_progress`. Because the ledger is append-only for the application role, reset runs under the owner role.

### D5. Pricing

As blueprint D3 to D5: adapter per venue with a normalised order book, direct and two-leg routes through USD, USDT and USDC, depth-walk VWAP including taker fees, staleness exclusion. Outlier protection is left out of this slice.

Replay mode: adapters can read a recorded message file and loop it, selected by an environment variable. The same recordings are the adapter test fixtures.

Public indicative prices use the midpoint of the best fee-inclusive top-of-book bid and ask across the same direct/two-leg routes, without walking an entered amount. Apply the single reference spread below the midpoint for SELL and above it for BUY. Report the oldest contributing book timestamp and replay status; USD amounts use the aggregated USD/CAD midpoint for indicative CAD equivalents. HTTP prices and SSE messages expose no route or spread. SSE emits a fresh snapshot every two seconds, including an unavailable message when no fresh route exists.

### D6. Quote acceptance, idempotency, state machines, money

Unchanged from the blueprint and the core of the demo:

- Acceptance is one transaction with a guarded `UPDATE ... WHERE status = 'active' AND expires_at > COALESCE($asOf, now())` (`$asOf` is null for every live request; see D4), `UNIQUE (quote_id)` on trades, and the booking ledger posting (blueprint D6).
- `Idempotency-Key` header with stored request hash and response, plus natural uniqueness in the data (blueprint D7).
- Transition tables in `packages/shared` drive both the transition function and the diagrams (blueprint D8).
- `numeric` in PostgreSQL, decimal strings over the wire, desk-favouring rounding (blueprint D11).

### D7. Ledger

As blueprint D10: accounts, transactions and entries; insert-only enforced by role privileges and a trigger; a deferred constraint trigger checks per-currency balance at commit; one transaction per source event.

Posting templates in this slice: trade booked, funds received, payout sent, trade cancelled. Payout confirmation records a lifecycle event without another monetary posting; the staff ledger view shows that event as a confirmation-only group.

### D8. Simulated settlement

Each simulate action is a staff API call that applies one trade transition and its ledger posting in a single transaction, and records `simulated = true` on the event. In the blueprint the same transition function is called by bank webhooks and the chain watcher; here the button is the only caller.

### D9. Architecture page

Statically rendered. State-machine diagrams are SVG generated at build time from the shared transition tables; the overview diagram is hand-authored. A "Real / Mocked / In the blueprint" table is maintained in the page source.

### D10. Tests

- Unit (Vitest): depth walk, route selection, rounding, transition tables, posting templates balance (property-based).
- Integration (Vitest, real PostgreSQL): 20 concurrent acceptances produce one trade and one posting; late acceptance is refused; idempotency key cases; repeated simulate action applies once; ledger rejects UPDATE.
- End to end (Playwright, replay mode): approved client sells ETH for CAD, staff settles it, integrity check passes.

### D11. Name and visual language

The demo is called **Northbook**. Its interface uses a restrained institutional style: white and deep green, flat surfaces, pill controls and monospaced figures. The name, logo, imagery and copy are original, and the footer states that Northbook is an independent demonstration not affiliated with any company.

Tokens (defined once as CSS variables and mapped into Tailwind):

| Token | Value | Use |
|---|---|---|
| paper | `#ffffff` | page background |
| surface | `#f5f8f8` | alternate bands, cards, table headers |
| ink | `#131a17` | primary text |
| muted | `#5c6662` | secondary text |
| line | `#dfe4e2` | borders and dividers |
| forest | `#073d30` | primary buttons, dark bands |
| emerald | `#0e7a5f` | links, active states, positive status |
| mint | `#5bd3ac` | accents on dark, focus ring (`0 0 0 4px` at 55% opacity) |
| night | `#0b0c0e` | footer and darkest surfaces |
| danger | `#c0392b` | errors, expired and cancelled states |

- **Type**: Geist Sans for text and Geist Mono for labels and figures (both open-source). Headings are medium weight with slightly negative tracking; section eyebrows are Geist Mono, uppercase, 0.16em tracking.
- **Shape**: pill buttons and chips (fully rounded), cards at 24px radius, flat surfaces separated by 1px lines, almost no shadows.
- **Layout**: centred container with generous whitespace; dark hero and feature bands use a deep green radial gradient with white text at reduced opacity for secondary copy.
- **Theme**: light only. Dark bands are part of the light theme, not a separate mode.

Application elements follow the same language:

- All prices, amounts and countdowns use Geist Mono with tabular figures, right-aligned in tables.
- The swap widget is a 24px-radius white card on the dark hero band, with pill asset selectors and a forest pill as the main action.
- The quote countdown is a thin emerald progress line that turns to danger in the last 3 seconds.
- Status chips are pills: emerald on a mint tint for settled and approved, ink on surface for in-progress, danger on a light red tint for expired, cancelled and rejected. A status is never shown by colour alone; the chip always carries its label.
- The operations console uses the same tokens at higher density: 13–14px text, surface-coloured table headers, line dividers.

The complete token set and component rules live in `docs/design/02-tokens.css`, which is ported as-is into the web app's global stylesheet and is the only source of colours and type. The design adds to it:

- Two Home-only type sizes: `--text-display-xl` 64px (tracking -0.03em) for the hero and `--text-section` 48px (tracking -0.025em) for section titles.
- On-dark button variants: a white pill whose hover is mint, and a ghost pill with a `rgb(255 255 255 / 0.3)` border.
- Home uses a 1184px content column; every other page uses 1200px.

### D12. Public repository

The project is published as a public GitHub repository named `northbook`, including the `openspec/` folder so the specs and design are readable alongside the code.

- No real client company names, private notes or personal data in code, specs, seed data or commit history. Demo organisations and people are fictional. Required technical provider names, including Kraken, Coinbase and Binance, are permitted.
- No secrets in the repository: configuration comes from environment variables, with a committed `.env.example` and secret scanning in CI.
- MIT licence, and a README that leads with the live demo link, a screenshot, the five-step walkthrough and the architecture summary.
- Recorded market-data fixtures contain only public order book messages.

### D13. Deployment on Railway

One Railway project with three services, deployed from the GitHub repository on every push to `main`:

| Service | Source | Exposure | Notes |
|---|---|---|---|
| `web` | `apps/web` | public domain | Next.js; calls `server` over Railway private networking |
| `server` | `apps/server` | private only | Fastify API and pricing module; exactly one replica; sleep-on-idle off |
| `postgres` | Railway PostgreSQL | private only | `DATABASE_URL` supplied to `server` as a reference variable |

- **Browser traffic goes through `web` only.** Next.js proxies `/api/*` and the SSE price stream to `server`, so the session cookie is first-party and `server` needs no public domain or CORS.
- **Build**: one Dockerfile per service at the repository root context, so the shared workspace package is available to both; per-service settings are kept in config-as-code files in the repository.
- **Configuration format**: use Railway's current TypeScript infrastructure-as-code format, `.railway/railway.ts`. Legacy `railway.json`/`railway.toml` is deprecated; resource creation, remote planning and deployment remain owner operations.
- **Migrations and seed**: a pre-deploy command on `server` runs migrations; the seed runs only when the database is empty.
- **Health**: `server` exposes a health endpoint (database reachable, at least one venue fresh) used as the Railway health check; `web` has its own.
- **Configuration**: `SESSION_SECRET`, `DATABASE_URL`, `DATABASE_ADMIN_URL`, `PRICING_MODE` (`live` or `replay`), venue staleness threshold and `LOG_LEVEL`.
- **Two database roles**: `DATABASE_ADMIN_URL` is the owner role supplied by Railway, used only for migrations, seed and reset. The first migration creates a restricted application role (no UPDATE or DELETE on ledger tables, no DDL) whose password comes from a variable, and `DATABASE_URL` connects as that role for all request handling. Local Docker Compose sets up the same two roles.
- **Data retention**: the public instance keeps all data; there is no scheduled or manual reset in the deployed application.
- **Proxy trust**: web signs a single canonical client address with a shared `PROXY_SECRET`, binding it to method, URL and a 30-second timestamp. Server accepts it only from loopback/private peers with a valid signature. Local web is loopback-only and ignores caller-selected IP headers; `CLIENT_IP_SOURCE=railway` uses the edge-supplied `X-Real-IP`. The owner configures the same secret for both services and permits public web ingress only through the HTTP edge.
- **Abuse limits**: per-source rate limits on the public price endpoints, quote requests. Because all traffic reaches `server` through `web`, the source is taken from the forwarded-for header set by the proxy, and `server` trusts that header only from the private network.
- **Alternative considered**: Vercel for `web` plus Railway for `server`. Rejected to keep one platform, private networking between the two, and a single deploy pipeline.

### D14. Pair, side and rounding conventions

These are fixed here because every pricing bug in this kind of system is a sign or direction error.

- A pair is written `BASE/QUOTE`. Base is one of BTC, ETH, USDC, USDT; quote is CAD or USD. That gives 8 supported pairs. A price is always "quote currency per 1 base".
- Side is always from the **client's** point of view: `BUY` means the client buys base and pays quote; `SELL` means the client sells base and receives quote.
- A request fixes exactly one amount, base or quote. The fixed amount is used exactly as given; the other is computed and rounded.

| | Client BUY | Client SELL |
|---|---|---|
| Desk must | buy base in the market | sell base in the market |
| Order book side walked | asks | bids |
| Market price | VWAP × (1 + taker fee) | VWAP × (1 − taker fee) |
| Client price | market × (1 + spread) | market × (1 − spread) |
| Client pays | quote, rounded **up** | base, rounded **up** |
| Client receives | base, rounded **down** | quote, rounded **down** |
| Guardrail | client price ≥ market price | client price ≤ market price |

- **Legs of a synthetic route**: each leg is priced by the same rule applied to that leg's own market: acquiring the market's base walks asks, disposing of it walks bids. The route price is the product of the leg prices, inverted where a leg's market is quoted the other way round. Fees apply per leg.
- **Depth walk by quote amount**: when the fixed amount is in quote currency, levels are consumed until the quote notional is filled.
- **Amounts are authoritative**: keep intermediate calculations unrounded and apply the specified currency rounding only to the final computed amount; the fixed amount stays exactly as given. The unit price shown to the client is derived from the final amounts and is informational.
- **Size in CAD**: choose the size band and enforce the minimum/maximum using the pre-spread market quote notional. Value USD at the current fee-inclusive cost of acquiring that USD in CAD. Bands are below 100,000 CAD, 100,000 through 500,000 CAD inclusive, and above 500,000 CAD. Also enforce the maximum against the final client quote amount's CAD value.
- **Final market cost**: after client rounding, reprice the final base amount to check depth and the client-price guardrail. Store the exact market quote amount in the private route snapshot, rounded up for BUY or down for SELL, so ledger revenue does not depend on reconstructing notional from a unit price stored with fewer decimal places.
- **Indicative price**: the mid of the best direct or synthetic route at top of book, moved against the viewer by the public reference spread in the direction they selected.

Worked examples, which are also test cases:

- SELL 50 ETH for CAD: best route market price 4,172.45; spread 35 bps → unrounded client price 4,157.846425; client pays 50 ETH, receives 207,892.32 CAD after rounding down from 207,892.32125. The informational unit price derived from the final amounts is 4,157.8464 (4,157.85 rounded for display).
- BUY 2 BTC with CAD: VWAP ask 95,000.00, fee 0.26% → market 95,247.00; spread 35 bps → client price 95,580.3645; client receives 2 BTC, pays 191,160.73 CAD after rounding up from 191,160.729.

### D15. Data model and API surface

Tables:

| Area | Tables |
|---|---|
| Identity | `organisations` (tier, max trade size, KYB state), `users` (role, organisation) |
| Onboarding | `kyb_applications` (fields, beneficial owners as JSON, state, decision) |
| Pricing | `venues` (enabled, settings, health), `spread_bands` (tier, size band, bps), `settings` (quote lifetime, limits, reference spread, staleness) |
| Trading | `quotes` (pair, side, amounts, client price, market price, spread, route JSON, status, expires_at), `trades` (`UNIQUE quote_id`, state), `trade_events` (transition, actor, simulated, time) |
| Ledger | `accounts`, `ledger_transactions` (`UNIQUE source_event`), `ledger_entries` |
| Infrastructure | `idempotency_keys`, `rate_limits` |

Endpoints, all under `/api` and reached through the web proxy:

| Group | Endpoints |
|---|---|
| Public | `GET /public/pairs` · `GET /public/prices/:pair` · `GET /public/prices/stream` (SSE) |
| Demo | `POST /demo/persona` · `GET /me` · `GET /demo/status` |
| Client | `GET, PUT /kyb/application` · `POST /kyb/application/submit` · `POST /quotes` · `GET /quotes` · `GET /quotes/:id` · `POST /quotes/:id/accept` · `GET /trades` · `GET /trades/:id` |
| Staff | `GET /staff/applications` · `POST /staff/applications/:id/approve` · `POST /staff/applications/:id/reject` · `GET /staff/quotes` · `GET /staff/quotes/:id` · `GET /staff/trades` · `GET /staff/trades/:id` · `POST /staff/trades/:id/events` · `GET, PUT /staff/config` · `GET /staff/venues` · `PUT /staff/venues/:id` · `GET /staff/ledger/check` · `GET /staff/ledger/balances` |

`GET /staff/venues` reports both configured `markets` and `readyMarkets` (currently fresh, enabled order books). Readiness checks must use the latter; a supported market is not evidence that its initial snapshot has arrived.
| Health | `GET /healthz` |

`GET /demo/status` includes current seeded persona/organisation records, and the shared-data notice. The switcher refreshes this status when opened.

Rate-limit buckets live in PostgreSQL. Defaults are 120 public price HTTP requests/SSE opens per source per minute, and 30 quote attempts per source and per organisation per minute. Positive environment overrides are validated. Atomic counters include refused attempts, return `rate_limited` with `Retry-After`, and expire without a new background timer. Source addresses are hashed in stored bucket keys.

`GET, PUT /staff/config` read and atomically save all spreads, quote settings, organisation tiers/maximums and venue selections. A revision hash and a settings-row lock refuse stale editing snapshots with `configuration_conflict`; no identity/KYB fields may be changed through configuration. The form keeps its draft until save or explicit discard/reload. Venue status comes from runtime health, never from an unsaved toggle. Numeric validation matches database precision, and each organisation maximum must cover the minimum.

`GET /staff/desk` returns the desk's net position per currency (position-account credits less debits), each valued in CAD at the current mid price, and spread revenue in total, for the current UTC day and per client, from one repeatable-read snapshot. A currency without a fresh price has no value and the totals that depend on it are null. Positions are not hedged in this slice.

`GET /staff/blotter` returns the staff quote/trade lists, organisation records and summary from one repeatable-read snapshot. The summary uses UTC event dates; spread revenue is net ledger credits less reversals, grouped by currency without an invented exchange rate. Filters affect rows, not the summary. Quote inspection retains each stored route leg; missing historical legs are explicitly unavailable.

`GET /staff/trades/:id` adds the organisation, locked pricing/route snapshot and ledger event groups to the trade detail, read from one repeatable-read snapshot. Each group includes its event, optional transaction/reversal IDs and exact account entries. Client detail never contains these staff fields.

`POST /quotes`, `POST /quotes/:id/accept`, `POST /kyb/application/submit`, both staff application decision endpoints and `POST /staff/trades/:id/events` require an `Idempotency-Key` header. Request and response shapes are Zod schemas in `packages/shared`, used by both the server for validation and the web app for types.

Each organisation has one KYB application. Drafts may be incomplete; submission requires every business field, at least one named beneficial owner and exact ownership percentages totalling 100 (up to six decimal places each). Submission records one timestamp; staff decisions record their actor, timestamp and a required rejection reason (1–500 trimmed characters). Submitted applications are read-only; approved and rejected states are terminal. The application and organisation status change in one transaction. Approval also adopts the submitted legal name and jurisdiction for the organisation.

The Home verification form selects the existing Cedar persona and prefills its draft via the existing persona and KYB endpoints; it creates no user or organisation. Work email and expected monthly volume are optional application fields, displayed alongside the business details. Email may be incomplete in a draft but must be valid if supplied on submission. Empty Home inputs preserve existing draft values. If another viewer has already submitted the shared application, preserve it and show the entered Home values separately with an explicit explanation; do not reopen or reset it.

Errors use one shape, `{ "error": { "code", "message", "requestId" } }`. Any error not listed below is returned as `internal_error` without stack traces or internal detail, and the framework's own 404 and validation errors are mapped to `not_found` and `validation_failed`:

| Code | HTTP | Meaning |
|---|---|---|
| `validation_failed` | 400 | request body or parameters invalid |
| `idempotency_key_required` | 400 | header missing on an endpoint that requires it |
| `not_authenticated` | 401 | no persona selected |
| `forbidden` | 403 | persona lacks permission |
| `kyb_not_approved` | 403 | organisation cannot request firm quotes yet |
| `not_found` | 404 | missing, or belongs to another organisation |
| `idempotency_conflict` | 409 | key reused with different content |
| `idempotency_in_progress` | 409 | original request still running; retry shortly |
| `configuration_conflict` | 409 | pricing configuration changed since the editing snapshot |
| `reset_in_progress` | 409 | another seed/reset holds the advisory lock |
| `invalid_transition` | 409 | state change not allowed from the current state |
| `quote_expired` | 410 | acceptance arrived after expiry |
| `below_minimum`, `above_maximum` | 422 | trade size outside limits |
| `insufficient_liquidity` | 422 | no route can fill the size |
| `rate_limited` | 429 | too many requests |
| `price_unavailable` | 503 | no fresh market data for the pair |
| `internal_error` | 500 | unexpected failure; the message is generic and details go to the log only |

### D16. Logging and request tracing

Structured JSON logs to stdout (pino), which Railway collects. Each request gets a request id, generated at the web proxy or accepted from it, returned in an `x-request-id` response header and in every error body, and attached to every log line written while handling that request. Domain events (quote issued, quote accepted, trade transition, ledger posting, reset, venue state change) are logged with their entity ids, so one trade can be followed through the logs by its id. Amounts are logged; nothing secret exists to redact beyond the session cookie, which is never logged.

### D17. UI design as the visual source of truth

The UI follows a set of annotated screen designs, one per screen. They are specifications, not production code, and were translated into React components and the token stylesheet, never copied as inline styles. The design files are not kept in this repository; the design brief, including the tokens and the sample data the seed reads, is in `docs/design/`.

**Precedence when sources disagree**

1. Behaviour, data rules and permissions: the specs in this change.
2. Layout, spacing, sizes, copy and visual states: the screen designs.
3. Build order: `tasks.md` in this change.

**Screens and routes**

| Screen design | Route | Persona |
|---|---|---|
| Home | `/` | Visitor |
| Home Mobile | `/` at 390px (outdated; see below) | Visitor |
| Architecture | `/architecture` | Any |
| Trade | `/trade` | Approved client |
| Trade Unverified | `/trade` when KYB is not approved | Client |
| Trade Mobile | `/trade` at 390px | Client |
| Quote States | component reference: quote card, five states | — |
| Quotes | `/quotes` | Client |
| Trades | `/trades` | Client |
| Trade Detail | `/trades/:id` | Client |
| Onboarding | `/onboarding` | Client |
| Approvals | `/staff/approvals` | Staff |
| Blotter | `/staff/blotter` | Staff |
| Desk (no screen design; follows the Blotter layout) | `/staff/desk` | Staff |
| Staff Trade | `/staff/trades/:id` | Staff |
| Configuration | `/staff/configuration` | Staff |
| States | pattern reference: loading, empty, error, rate-limited, widget states | — |

**Shared components**, built once in `apps/web` and reused: AppHeader (light, dark-over-hero and staff variants), PersonaSwitcher, DemoNotice, Footer (multi-column on Home, compact elsewhere), SwapWidget, QuoteCard, StatusChip, Timeline, KeyValue, DataTable (roomy and dense), FilterPills, Tabs, SkeletonRows, EmptyState, ErrorState, RateLimitBanner, LedgerGroup, StickySaveBar.

**Behaviour the design adds**, each reflected in a spec:

- Trade: once a firm quote exists, the input rows collapse to a one-line summary and the quote card alone carries the amounts (`rfq-quoting`).
- Late acceptance shows the expired card with the message that no trade was made (`rfq-quoting`).
- Client trade list and open trades show "Action needed" when the client must send funds (`trade-settlement`).
- Cancelling a trade uses an inline confirmation and requires a reason, which the client sees (`trade-settlement`, `ops-console`).
- The staff blotter has a "Next step" column (`ops-console`).
- Persona switcher entries are named by organisation and show its current verification status (`demo-access`).
- Home ends with a short "Start with verification" form that leads into onboarding (`public-pricing`).

**Where the design is not followed**

- **Funding window.** The trade detail design shows "Funding window closes at 15:42". This slice has no settlement deadline or automatic cancellation, so that line is omitted; the interface must not promise something the system does not enforce. The blueprint describes the real mechanism.
- **Mobile Home.** The mobile Home design shows the earlier Home. Mobile Home is built by applying the desktop Home design responsively: hero stacked, grids to one column, widget full width below the headline.
- **Sample figures.** The seed uses `05-sample-data.json`, including the blotter summary of 3 in progress and 2 settled today.

**Cross-cutting UI rules**

- A primary action disables on first click and shows progress text until the server responds.
- Loading uses skeleton rows, never a whole-page spinner. Every screen has empty, error (with the request id from D16 and a retry action) and rate-limited states, as in the states reference design.
- Indicative prices update in place without layout shift.
- The Architecture page's section list is `position: sticky` at desktop width.

**Content still to be written**: the "Planned" and "Technology" sections of the Architecture page contain placeholders in the design, and no review-time estimate is shown to unverified clients.

## Risks / Trade-offs

- [Venue APIs unreachable during a live demo] → Replay mode; staff see the mode in venue status.
- [Every viewer of the public instance shares the same personas, so they see each other's quotes and trades and can change shared configuration] → Stated in the persona switcher (spec `demo-access`), and accepted for a guided demo. Per-viewer sandboxes were considered and rejected as too much machinery for a guided demo.
- [A realistic-looking financial site could be mistaken for a real service] → Demo notice on every page, fictional bank details and addresses marked as not real, and a "not affiliated with any company" statement in the footer and on the architecture page.
- [Anyone can use the staff persona on the public instance and change configuration or data] → Accepted: no real data exists to protect, and the sample data can be restored from the command line.
- [Venue APIs may refuse connections from the hosting region] → The affected adapter reports unhealthy and pricing continues on the others; the service region is chosen where all three venues are reachable, and replay mode is the fallback.
- [Order books live in memory] → The server runs as exactly one instance with sleep-on-idle disabled; a restart rebuilds books within seconds.
- [The persona switcher looks like missing security] → Demo notice on every page and an explicit entry in the architecture page's "Mocked" list pointing to the blueprint's authentication design.
- [Capabilities here share names with the blueprint] → The blueprint lives in `docs/blueprint` as documentation, outside OpenSpec's change list; if it is later implemented, it should be rewritten as modifications to the specs this change creates.
- [The design files and the specs could drift apart] → D17 fixes the precedence (behaviour from specs, appearance from design), and each UI task names its design file so a reviewer can compare the two.
- [Deployment problems found late] → The walking skeleton is deployed in task group 3, before pricing or UI work, and every later group ships through the same pipeline.
