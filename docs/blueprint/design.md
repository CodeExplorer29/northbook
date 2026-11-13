# Design: OTC RFQ MVP

## Context

Greenfield project; see `proposal.md` for motivation and scope. Constraints that shape the design:

- Correctness matters far more than throughput. Expected load is a handful of concurrent users.
- No real funds move. Bank, identity and wallet-screening integrations are simulated, but behind the interfaces a real integration would use. On-chain deposits are monitored for real on the Ethereum Sepolia testnet.
- The stack is TypeScript throughout: Next.js for the web application, Node.js for the backend, PostgreSQL with Drizzle.
- Market data comes from public, unauthenticated venue APIs. Checked on 2026-11-12: Kraken lists BTC, ETH, USDC and USDT against CAD plus USD/CAD; Coinbase lists USDC-CAD and USD pairs but no BTC-CAD; Binance has USDT and USDC pairs and no CAD markets. Direct CAD liquidity is therefore thin, and synthetic routes are required, not optional.

## Goals / Non-Goals

**Goals:**

- Make "at most one trade per quote" and "at most one payout per trade" hold under retries, double clicks, concurrent requests and process crashes.
- Keep pricing, quoting, settlement and ledger as separate modules with narrow interfaces so each can be tested alone.
- Let a venue be added by writing one adapter and one configuration row.
- Keep the number of moving parts small enough to run locally with one command.

**Non-Goals:**

- Low-latency pricing. Quotes computed in tens of milliseconds are sufficient.
- Horizontal scaling of the pricing process.
- Loading venue code at runtime from outside the codebase. "Dynamic" means enabling, disabling and configuring built-in adapters at runtime.

## Decisions

### D1. Four processes, one repository, one database

```
Browser ──► Next.js web (public site, client portal, ops console, architecture page)
               │  REST + SSE (same-site, proxied)
               ▼
            API process (Node.js, Fastify) ──► PostgreSQL
               │  internal HTTP                    ▲
               ▼                                   │ venue config, health
            Pricing process (Node.js) ─────────────┘
               │  WebSocket / REST
               ▼
            Kraken · Coinbase · Binance

            Chain watcher process (Node.js) ──► PostgreSQL (deposits, cursors)
               │  JSON-RPC
               ▼
            Ethereum Sepolia node
```

A pnpm workspace with `apps/web`, `apps/server` (three entry points: `api`, `pricing` and `chain-watcher`) and `packages/shared` (Zod schemas, money and state-machine types shared by both).

- **Why a separate backend instead of Next.js route handlers**: the pricing process holds long-lived WebSocket connections and in-memory order books, which does not fit a request-scoped runtime. Keeping all domain logic in the Node.js backend also leaves the web app as a thin client.
- **Why pricing is its own process**: it has a different failure mode (venue disconnects) and must not take the API down. The API treats it as a dependency that can be unavailable.
- **Why the chain watcher is its own process**: it is a sequential block-by-block loop that must never run twice concurrently for the same network. It talks to the rest of the system only through the database.
- **Alternative considered**: one process for everything. Simpler, but a venue reconnect storm would share an event loop with trade acceptance.

### D2. PostgreSQL is the only stateful dependency

Jobs (settlement deadlines, outbox delivery, simulated provider callbacks) run on a Postgres-backed queue (pg-boss). Rate limits use a Postgres table. No Redis or message broker.

- **Why**: job enqueueing can share a transaction with the state change that causes it, which removes a whole class of "state changed but job lost" bugs.
- **Trade-off**: lower throughput than a dedicated broker. Irrelevant at this scale.

### D3. Venue adapters and registry

Each venue implements one interface: declare supported markets, subscribe to order books, emit normalised book updates, report connection health, and give its taker fee. Adapters maintain a local book from the venue's WebSocket feed and fall back to REST polling if the socket is down.

A `venues` table holds `enabled`, per-venue settings and the symbol map. The pricing process watches it (LISTEN/NOTIFY with a polling fallback) and starts or stops adapters without a restart. Health (connected, last update age) is written back periodically for the ops console.

- **Alternative considered**: a unified exchange library such as ccxt. Rejected for the core path because writing three small adapters shows the normalisation problems (symbol naming, book checksums, sequence gaps) and avoids a large dependency; it remains an option for adding venues quickly.

### D4. Route-based best price

For a request (pair, side, size):

1. Enumerate candidate routes: every enabled venue's direct market, plus two-leg routes through a bridge currency in {USD, USDT, USDC}. Legs may be on different venues.
2. For each route, walk book depth to fill the size and compute the volume-weighted average price, including each leg's taker fee.
3. Drop routes with stale or outlier legs (spec `price-aggregation`).
4. Return the best route with its legs, plus the aggregated mid-price.

Routes are capped at two legs to keep results explainable. Because legs can be on different venues, a real desk would carry transfer and timing risk between them; the MVP records the route for audit and does not execute it.

### D5. Two price products from one engine

| | Indicative | Firm |
|---|---|---|
| Input | pair only | pair, side, size, organisation |
| Price | aggregated mid ± public reference spread | best route VWAP ± tier and size-band spread |
| Stored | no | yes, with route snapshot |
| Transport | SSE stream, cached per pair | request/response |

The firm quote row stores the client price, the market price, the route and the spread applied. Clients receive only the client price; staff see everything.

### D6. Quote acceptance is one database transaction

```sql
UPDATE quotes SET status = 'accepted'
 WHERE id = $1 AND org_id = $2 AND status = 'active' AND expires_at > now()
RETURNING *;
```

If a row comes back, the same transaction inserts the trade (`UNIQUE (quote_id)`), posts the booking ledger transaction, writes the state-transition event and enqueues the settlement-deadline job. If no row comes back, the handler reads the quote: already accepted returns the existing trade; otherwise the response is `quote_expired`.

- Expiry uses the database clock, so API instances with skewed clocks cannot disagree.
- The UI countdown ends one second early to absorb network latency; the server remains the authority.
- Quotes are not expired by a job. `status = 'active' AND expires_at <= now()` is read as expired, and a periodic sweep sets the stored status for reporting only.

### D7. Two layers of idempotency

1. **Idempotency keys** (HTTP layer): an `Idempotency-Key` header is required on every mutating client endpoint. A table keyed by (organisation, endpoint, key) stores a hash of the request and the response. Same key and hash returns the stored response; same key with a different hash returns 409; a key still in progress returns 409 with a retry hint. Keys expire after 24 hours.
2. **Natural uniqueness** (data layer): `UNIQUE (quote_id)` on trades, `UNIQUE (trade_id)` on payouts, `UNIQUE (provider, event_id)` on inbound webhooks, `UNIQUE (source_event)` on ledger transactions.

Layer 2 is what guarantees correctness; layer 1 gives clients a clean retry contract. Either alone is insufficient: keys expire, and uniqueness alone cannot return the original response body.

Outbound calls (payout, verification) carry a deterministic reference derived from the trade or application id, so a retried call is recognisable by the provider. An unknown outcome is resolved by querying the provider by that reference, never by sending again.

### D8. Explicit state machines

KYB application, quote, trade and payout each have a transition table in `packages/shared` (from-state, event, to-state, allowed actor). One function applies a transition: it updates the row with a `WHERE status = <from>` guard, inserts an event row, and returns the current state if the transition has already happened. The same tables generate the diagrams on the architecture page, so the documentation cannot drift from the code.

### D9. Settlement: client funds first, staff-confirmed

Trade states: `awaiting_client_funds → funds_received → payout_sent → settled`, with `cancelled` (deadline) and `failed` (payout failed or returned).

The funding window depends on how the client funds the trade: bank funding defaults to end of the next business day; on-chain funding defaults to 60 minutes. A client who has locked a price but not yet sent funds holds a free option on the market, and on-chain transfers take minutes, so there is no reason to leave that option open for a day. A trade with a detected but not yet final deposit is not cancelled at the deadline; the cancel job re-checks after finality.

Bank funds and all payout confirmations come from a simulated bank provider that the ops console drives ("simulate incoming wire", "simulate payout confirmation"), which exercises the same webhook path a real provider would use, including duplicate and out-of-order delivery. On-chain client funds come from the chain watcher (D17).

- **Alternative considered**: pre-funded client balances. Rejected because the desk model chosen here is non-custodial and trade-by-trade.
- **Consequence**: between acceptance and funding the desk carries price and default risk. A real desk manages this with credit limits and hedging; the MVP bounds it with maximum trade size and the deadline.

### D10. Ledger model

Tables: `accounts` (owner, type, currency), `ledger_transactions` (source event, unique), `ledger_entries` (transaction, account, direction, amount). Entries are insert-only, enforced by revoking UPDATE and DELETE from the application role and by a trigger. A deferred constraint trigger checks that each transaction balances per currency at commit.

Account types: client receivable, client payable, desk bank, desk wallet, spread revenue, and a trading position account per currency to carry the conversion between currencies.

Trades are multi-currency, so "balanced" is checked per currency, and the position accounts absorb the cross-currency leg.

### D11. Money

Amounts are `numeric` in PostgreSQL and decimal strings over the wire, handled with a decimal library; JavaScript numbers never hold money. Each currency has a defined precision (CAD and USD 2, USDC and USDT 6, BTC 8, ETH 8 for display with 18 stored). Rounding always favours the desk: amounts the client pays round up, amounts the client receives round down. The quote stores final rounded amounts, and acceptance copies them without recomputing.

### D12. Authentication and authorisation

Email and password with server-side sessions in httpOnly, SameSite cookies; passwords hashed with argon2id. Client and staff users live in separate tables with separate login routes. Every query for client data is scoped by organisation id taken from the session, never from the request. Authorisation checks live in the API; the web app hides controls only as a convenience.

### D13. Provider interfaces with simulators

`VerificationProvider`, `WalletScreeningProvider`, `BankProvider` and `ChainPayoutProvider` each have a simulator implementation that returns scripted outcomes and delivers signed webhooks through the public webhook endpoint. Simulator behaviour (pass, fail, delay, duplicate delivery) is controllable from the ops console to demonstrate failure handling.

KYB documents are stored through a storage interface (local disk in development, S3-compatible in deployment) and served only through an authorised API route.

### D14. Architecture page

A statically rendered page in the web app. Diagrams are inline SVG generated at build time from the shared transition tables (state machines) and hand-authored for the system overview. No runtime data is fetched, so it cannot leak configuration.

### D15. Testing strategy

- **Unit (Vitest)**: depth-walk pricing, route selection, rounding, state-machine tables, ledger balancing. Property-based tests for "every posted transaction balances" and "client price is never better than market".
- **Integration (Vitest with a real PostgreSQL)**: concurrent quote acceptance, idempotency key behaviour, duplicate and out-of-order webhooks, deadline cancellation.
- **Adapters**: replay recorded venue messages, including sequence gaps and disconnects. No live network in CI.
- **End to end (Playwright)**: sign up, complete KYB, staff approval, request and accept a quote, settle the trade, check the ledger.

### D16. Deposit addresses: one per organisation per network

Addresses are derived from an extended public key at path `m/44'/60'/0'/0/<index>`, where the index is allocated from a database sequence when the organisation is approved. Only the public key is present on the servers; the private key stays offline (in production it would sit in an MPC custody service). One EVM address receives ETH and every supported ERC-20 on that network.

- **Why not one address per trade**: institutional clients must whitelist withdrawal addresses in their own custody systems, often with an approval delay, so a new address per trade makes every trade slow. A fixed address also avoids a sweep transaction per trade.
- **Cost**: deposits must be matched to trades by organisation, asset and exact amount (spec `chain-deposits`), and anything ambiguous goes to staff.
- Sweeping deposit addresses to a treasury wallet needs the private key and is out of scope; the ledger treats funds at a deposit address as desk wallet funds.

### D17. Chain watcher

One watcher loop per network, behind a `ChainWatcher` interface (EVM implementation now; Tron is an interface stub).

```
loop:
  finalized = rpc.getBlock("finalized")
  head      = rpc.getBlock("latest")
  for n in cursor.finalized+1 .. finalized:        # authoritative pass
      record transfers in block n as confirmed
      advance cursor.finalized in the same transaction
  for n in finalized+1 .. head:                    # advisory pass
      upsert transfers as detected; drop detections whose block hash changed
```

- **What counts as a transfer**: a transaction whose `to` is a deposit address with non-zero value (native ETH), or a `Transfer` log from a supported token contract whose recipient is a deposit address. The set of deposit addresses is loaded into memory and refreshed on change.
- **Idempotency**: deposits are unique on (network, transaction hash, log index), with log index −1 for native transfers. The cursor advances in the same database transaction as the deposits of that block, so a crash re-processes at most one block and records nothing twice.
- **Finality instead of confirmation counts**: crediting only blocks at or below the `finalized` tag (about 13 minutes on Ethereum) means a credited deposit is never reorganised away, so there is no "un-credit" path. The advisory pass exists only to show the client "detected" early.
- **Single runner**: the loop holds a PostgreSQL advisory lock per network, so a second instance idles.
- **Matching**: when a deposit is confirmed, the same transaction runs sender checks and matching, and on a match applies the trade transition and ledger posting through the same code path the bank webhook uses.
- **Known gap**: ETH sent by a contract's internal call (some multisigs and exchange hot wallets) does not appear as a top-level transaction and needs trace APIs. The MVP documents this and does not detect it.
- **Tests**: the watcher takes an RPC client interface. Integration tests use a scripted fake client (including a reorg in the advisory range and a restart mid-block); a local dev chain (anvil) is used for one end-to-end test. Sepolia is used for the live demo only, never in CI.

Sell-crypto flow end to end:

```
Client            Web/API              Chain watcher        Ops / Bank simulator
  │ request quote    │                       │                      │
  │◄─ firm quote ────│ (15 s)                │                      │
  │ accept ─────────►│ trade: awaiting_client_funds                 │
  │◄─ address, amount, 60-min deadline       │                      │
  │ send ETH ───────────────────────────────►│ detected             │
  │                  │◄── "deposit detected" │                      │
  │                  │                       │ finalized → confirmed│
  │                  │   sender checks + match + ledger             │
  │                  │ trade: funds_received │                      │
  │                  │ send CAD payout ────────────────────────────►│
  │                  │ trade: payout_sent    │                      │
  │                  │◄──────────────────────── payout confirmed ───│
  │                  │ trade: settled        │                      │
```

## Risks / Trade-offs

- [Venue public APIs rate-limit or block by region] → Adapters back off and report unhealthy; pricing continues on remaining venues; Binance uses its market-data-only host. A recorded-feed replay mode lets the demo run with no network.
- [Synthetic routes combine books captured at slightly different times] → Per-leg staleness threshold, outlier check against other venues, and the firm spread covers the residual.
- [Firm quotes with no last look expose the desk to fast markets] → Short quote lifetime (default 15 seconds), maximum trade size, and request throttling. Accepted as the cost of a clear client promise.
- [In-memory order books are lost on pricing restart] → Books rebuild from venue snapshots within seconds; quoting returns "price unavailable" in the meantime.
- [Simulated compliance could be mistaken for a real control] → Demo notice on every money and identity page (spec `architecture-page`), and simulators are named as such in the console.
- [Public Sepolia RPC endpoints are rate-limited or unreliable] → The RPC URL is configurable, the watcher backs off and reports its lag, and trades are not cancelled while monitoring for their network is behind.
- [Two trades of the same asset and amount for one organisation are indistinguishable on chain] → Earliest-booked trade is matched first; both carry the same price risk for the desk, and staff can reassign.
- [Internal-call ETH transfers are not detected] → Stated in the settlement instructions and on the architecture page; such deposits are handled by staff.
- [Postgres-backed queue delays] → Deadlines are also enforced at read time: a payout is refused for a trade past its deadline even if the cancel job has not yet run.

## Migration Plan

No existing system. Deployment is one PostgreSQL instance and four services (web, api, pricing, chain watcher). Schema changes ship as Drizzle migrations run before the API starts. Rollback is redeploying the previous image; migrations in this change are additive only.

## Open Questions

- Product name and visual identity for the demo site. Does not affect specs or tasks; a placeholder name is used until chosen.
- Hosting target. The design assumes any container host with managed PostgreSQL.
