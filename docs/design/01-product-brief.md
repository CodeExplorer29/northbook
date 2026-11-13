# Product brief

## What Northbook is

Northbook is a self-service OTC (over-the-counter) desk where a business converts between digital assets and fiat currency at a firm, all-in price.

A visitor can see an indicative price without an account. A verified business client can request a firm quote that is valid for 15 seconds, accept it, and follow the trade until it settles. Staff use an internal console to approve clients, inspect quotes and trades, progress settlement and configure pricing.

It is a demonstration: prices are live market data, the quoting and ledger logic is real, and identity, bank transfers and on-chain transfers are simulated. No real funds move.

## Supported instruments

BTC, ETH, USDC and USDT, each against CAD and USD. Eight pairs.

## Who uses it

| Persona | Who they are | What they want |
|---|---|---|
| Visitor | Treasurer or finance lead evaluating the desk | A quick sense of price and credibility |
| Client trader | Finance or treasury staff at a payments firm or money services business | Lock a price fast, know exactly what to send and when the money arrives |
| Unapproved client | A business that has signed up but is not yet verified | Understand what is missing and how long it takes |
| Staff | Operations and compliance at the desk | See every quote and trade, act on what needs attention, never apply an action twice |

Typical trade sizes are CAD 25,000 to 2,000,000. These are large, infrequent, deliberate transactions, not rapid trading.

## Tone

Institutional, calm and exact. Closer to a private bank than to a retail crypto app.

- No hype, no emoji, no gamification, no price tickers racing across the screen.
- Plain verbs: "Get quote", "Accept quote", "Request new quote".
- Numbers carry the weight. Copy is short.

## Design principles

1. **The price is the product.** On the trade screen, the amount the client pays and the amount they receive are the largest things on the page.
2. **Indicative and firm must never be confused.** An indicative price is labelled and visually lighter. A firm quote looks committed: stronger frame, countdown, exact amounts.
3. **Time is visible.** The countdown is always in view while a quote is active, and its last three seconds are unmistakable.
4. **Every state says what happens next.** A trade page always answers: where is my trade, and is anything expected from me?
5. **One action, once.** Primary actions disable immediately after a click and show progress. Nothing invites a double click.
6. **Status is never colour alone.** Every status chip carries a text label.
7. **Honest about the demo.** A slim notice on every page says this is a demonstration with simulated settlement. Bank details and addresses are visibly marked as samples.
8. **Density follows the user.** Client screens are spacious. Staff screens are dense tables with the same tokens.

## Global elements

- **Header**: Northbook wordmark at left; navigation; persona switcher at right.
- **Persona switcher**: a pill showing the current persona. Opens a menu with Visitor, two client organisations (each showing its verification status), and Staff. Shows "Demo data is shared between viewers."
- **Demo notice**: a slim surface-coloured bar under the header: "Demonstration only. No real funds move. Identity and settlement are simulated."
- **Footer**: dark. Wordmark, links to Architecture and the source repository, and "Northbook is an independent demonstration and is not affiliated with any company."

## Navigation

| Persona | Navigation items |
|---|---|
| Visitor | Home · Architecture |
| Client | Trade · Quotes · Trades · Onboarding · Architecture |
| Staff | Approvals · Blotter · Configuration · Architecture |

## Viewports

Desktop at 1440px is primary. Home and Trade must also work at 390px. Staff screens are desktop only.
