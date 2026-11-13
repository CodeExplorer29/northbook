# Proposal: Demo Slice

## Why

The full blueprint in `docs/blueprint` describes a production-shaped OTC platform and is too large to build as a demonstration. This change defines the thinnest version that shows the whole client journey working end to end, with real pricing and real quote, trade and ledger logic, and everything else mocked.

## What Changes

- Name the demo **Northbook**, with its own logo and copy.
- Add a public site with a swap-style widget showing live **indicative** prices aggregated from Kraken, Coinbase and Binance.
- Add demo access: a persona switcher (approved client, unapproved client, staff) instead of registration and passwords, and seeded demo data that viewers' actions add to.
- Add a one-page KYB application and a staff approval action, with no documents and no verification vendor.
- Add firm RFQ quoting: all-in price, countdown, server-enforced expiry, and idempotent acceptance that creates at most one trade.
- Add a trade lifecycle driven by staff "simulate" actions in place of real bank and blockchain events.
- Add a double-entry ledger posted on every trade event.
- Add a three-page operations console: KYB approvals, quote and trade blotter with settlement actions, and pricing configuration.
- Add a public architecture page that explains the design and lists what the full blueprint adds.

Real in this slice: market data, price aggregation, quoting, acceptance, state machines, ledger, server-side authorisation.
Mocked in this slice: identity, KYB verification, bank transfers, on-chain transfers, wallet screening.

Out of scope (kept in the blueprint only): registration and email verification, organisation members, document upload, verification vendors, chain monitoring, payout approval workflow, positions and hedging, reconciliation, exceptions queue, audit log, notifications, two-factor authentication.

## Capabilities

### New Capabilities

- `demo-access`: Persona switching, seeded data and the demo notice.
- `public-pricing`: Indicative prices and the swap-style widget for visitors.
- `price-aggregation`: Combining venue order books into the best size-adjusted price.
- `kyb-onboarding`: The simplified business application and its approval.
- `rfq-quoting`: Requesting, expiring and accepting firm quotes.
- `trade-settlement`: The trade lifecycle after acceptance, driven by simulated events.
- `ledger`: Double-entry records of trade events and their invariants.
- `ops-console`: Staff pages for approvals, blotter and settlement actions, and pricing configuration.
- `architecture-page`: The public page documenting the design.

### Modified Capabilities

None.

## Impact

- New codebase: a Next.js web application and one Node.js server, with one PostgreSQL database, published as a public GitHub repository and deployed on Railway.
- External dependencies: public market-data APIs of Kraken, Coinbase and Binance (read-only, no credentials).
- The blueprint in `docs/blueprint` is reference documentation, not an OpenSpec change, and is not implemented here. Capabilities in this change share names with it and are deliberately reduced versions.
- The approved UI design is the visual source of truth for every screen (design D17).
