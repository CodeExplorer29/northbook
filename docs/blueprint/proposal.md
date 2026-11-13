# Proposal: OTC RFQ MVP

## Why

Institutional OTC desks that serve Canadian businesses commonly take trade requests through a contact form or chat, so a client cannot see a price or lock a trade without waiting for a person. This change introduces a self-service OTC web application: anyone can see an indicative price, and a verified business client can request a firm, time-limited quote and accept it, with every money-affecting step idempotent and auditable.

The project is a portfolio demonstration. It moves no real funds: bank and identity-vendor integrations are simulated behind real interfaces, and on-chain funding uses testnet assets only. It runs under its own name and branding, not that of any existing company.

## What Changes

- Add a public marketing site with a swap-style price widget ("You pay / You receive") that shows **indicative** prices without login.
- Add a price aggregation service that pulls live order books from several venues (Kraken, Coinbase, Binance to start), builds direct and synthetic cross routes, and returns the best size-adjusted price. Venues are pluggable adapters that staff can enable or disable at runtime.
- Add business client accounts: organisations, members, roles and sessions.
- Add KYB onboarding: a business application with documents and beneficial owners, a verification-provider interface (mock provider in the MVP), and a compliance review decision.
- Add RFQ quoting: a KYB-approved client requests a **firm** quote with a server-enforced expiry countdown and accepts it at most once.
- Add trade settlement: a trade state machine from booking to settled, settlement instructions, whitelisted payout destinations with screening, and funding windows that differ for bank and on-chain funding.
- Add on-chain deposits: one fixed deposit address per client per network, a chain monitoring service that detects and confirms incoming transfers (live on the Ethereum Sepolia testnet), and matching of deposits to trades.
- Add a double-entry ledger that records every trade and money movement.
- Add an internal operations console: KYB review, client pricing tiers, venue controls, pricing configuration, quote and trade blotter, settlement actions, ledger view and audit log.
- Add a public architecture page that explains the system design on the website itself.

Supported instruments in the MVP: BTC, ETH, USDC and USDT against CAD and USD.

Out of scope: real fund movement, mainnet networks, Tron monitoring (interface only), on-chain payouts and sweeping of deposit addresses beyond simulation, real hedge execution, client credit lines (trading before funding), individual (KYC-only) clients, client API or FIX access, and currencies beyond those listed.

## Capabilities

### New Capabilities

- `public-pricing`: Indicative prices and the swap-style widget available to visitors who are not logged in.
- `price-aggregation`: Collecting venue order books, building routes, and selecting the best size-adjusted price, with runtime control of venues.
- `client-accounts`: Organisations, members, roles, authentication and what each onboarding state is allowed to do.
- `kyb-onboarding`: The business verification application, its lifecycle, provider integration and compliance decision.
- `rfq-quoting`: Requesting, pricing, expiring and accepting firm quotes.
- `trade-settlement`: The trade lifecycle after acceptance, settlement instructions, payout destinations and deadlines.
- `chain-deposits`: Deposit addresses, detection and confirmation of on-chain transfers, and matching deposits to trades.
- `ledger`: Double-entry records of all balances and movements, and their invariants.
- `ops-console`: Staff-only tools for compliance, pricing, venue, trade and settlement operations, plus the audit log.
- `architecture-page`: The public page that documents the system design.

### Modified Capabilities

None. This is the first change in the project.

## Impact

- New codebase: a Next.js web application and a Node.js backend (API, pricing and chain watcher processes) sharing one PostgreSQL database.
- External dependencies: public market-data APIs of Kraken, Coinbase and Binance (read-only, no credentials), and an Ethereum Sepolia RPC endpoint.
- Simulated dependencies behind interfaces: identity verification vendor, wallet screening vendor, bank transfers, and on-chain payouts.
- No existing systems, data or users are affected.
