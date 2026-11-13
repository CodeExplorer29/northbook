# Screens and components

Content in quotes is the actual copy. Numbers come from `05-sample-data.json`.

## Shared components

### Swap widget

A white card (24px radius, about 480px wide) with two stacked amount rows and one action.

- **Row "You pay"**: large monospaced amount input on the left, pill asset selector on the right (asset icon, code, chevron).
- **Flip control**: a small circular button between the rows that swaps direction.
- **Row "You receive"**: same layout. Typing in either row computes the other.
- **Price line**: `1 ETH = 4,183.20 CAD`, then a chip and "Updated 2s ago".
- **Primary action**: full-width forest pill.

Two modes:

| | Indicative mode | Firm mode |
|---|---|---|
| Where | Home; Trade for unapproved clients | Trade for approved clients |
| Chip | "Indicative" (dashed outline) | none until a quote exists |
| Primary action | "Get a firm quote" | "Get quote" |
| Note under action | "Indicative price. Your final price is given in a firm quote after verification." | "All-in price. No additional fees." |

States: default · computing (skeleton on the computed row) · price unavailable ("Waiting for price updates" replaces the price line, action disabled) · below minimum ("Minimum trade is 10,000 CAD").

### Quote card

Replaces the widget's action area once a firm quote is requested. Framed with the 1.5px forest border.

- Countdown line across the top, and "Valid for 12s" in mono at top right.
- Eyebrow: "FIRM QUOTE"
- "You pay" amount and "You receive" amount, both large and monospaced.
- "Price" row: `1 ETH = 4,157.85 CAD`.
- "Payout to" row: destination label (sample).
- Actions: "Accept quote" (primary) and "Cancel" (text).
- Small print: "This price is guaranteed until the timer ends."

Five states, to be shown side by side:

1. **Active**: emerald countdown, actions enabled.
2. **Ending**: last 3 seconds, countdown and timer text turn danger red.
3. **Accepting**: primary button shows a spinner and "Accepting…", all controls disabled.
4. **Expired**: frame returns to the normal line colour, amounts greyed, chip "Expired", single action "Request new quote".
5. **Accepted**: chip "Accepted", message "Trade booked", action "View trade".

### Status chip

Pill with a text label. Mapping is in `02-tokens.css`.

### Timeline

Vertical list of trade states. Completed steps have a filled emerald dot, the current step an outlined forest dot with bold label, future steps a grey dot. Each completed step shows its timestamp in mono. A "Simulated" tag appears beside steps triggered by a simulated event.

### Key-value block

Two-column list of label (muted) and value. Values that are numbers, ids or addresses use mono. Copy buttons on ids and addresses.

---

## Public screens

### P1. Home

1. **Hero** (dark band, full width). Left: eyebrow "OTC DESK · DIGITAL ASSETS AND FIAT", headline "Firm prices for large trades.", sub-copy "See an indicative price now. Get a firm, all-in quote once your business is verified.", secondary link "How it works". Right: the swap widget in indicative mode, pre-filled with pay 50 ETH, receive CAD.
2. **Liquidity strip** (white). Eyebrow "AGGREGATED FROM", three venue names with a small live dot and "updated 1s ago" each.
3. **How it works** (surface band). Three numbered cards: "01 Get verified" · "02 Lock a firm quote" · "03 Settle", each with one sentence.
4. **Why a firm quote** (white). Two columns comparing "Indicative" and "Firm": who sees it, whether it can be traded, how long it lasts.
5. **Under the hood** (dark band). Three short items: "Best price across venues", "One quote, one trade", "Every movement in a double-entry ledger". Link "Read the architecture".
6. Footer.

At 390px the widget moves below the headline and spans the full width.

### P2. Architecture

A long reading page, max text width 720px, with full-width diagrams.

Sections: "Overview" (system diagram) · "From order book to quote" (price path diagram, worked example) · "Quote lifecycle" (state diagram) · "Trade lifecycle" (state diagram) · "Exactly one trade per quote" (idempotency, concurrency) · "Ledger" (sample postings table) · "What is real, mocked, and planned" (three-column table) · "Technology".

A sticky section list sits on the left at desktop width.

---

## Client screens

### C1. Trade

Two columns.

- **Left (about 520px)**: the swap widget in firm mode; once requested, the quote card.
- **Right**: "Recent quotes" (last five, compact rows: time, pair, side, amount, status chip) and "Open trades" (trades not yet settled, each linking to its detail).

States: no quote yet · active quote · expired · accepted · price unavailable · organisation not approved (widget falls back to indicative mode, with a panel "Your business is not verified yet" showing onboarding status and a "Continue onboarding" action).

### C2. Quotes

Page title "Quotes". Table: Time · Pair · Side · You pay · You receive · Price · Status. Filter pills: All · Accepted · Expired. Accepted rows link to their trade.

Empty state: "No quotes yet. Request your first quote on the Trade page."

### C3. Trades

Page title "Trades". Table: Booked · Trade ID · Pair · Side · You pay · You receive · Status. Filter pills: All · In progress · Settled · Cancelled.

### C4. Trade detail

Header: "Trade NB-T-000128", status chip, booked time.

- **Summary card**: "You pay 50.00000000 ETH" and "You receive 207,892.50 CAD" large; "Price 1 ETH = 4,157.85 CAD"; "Quote NB-Q-000342".
- **What happens next** (the most prominent block; changes with state):
  - Awaiting client funds: "Send exactly 50 ETH" with network, deposit address and copy button, a "Sample address. Do not send funds." warning, and "Funding window closes at 15:42".
  - Funds received: "We have your funds. Your payout is being prepared."
  - Payout sent: "207,892.50 CAD sent to your account ending 4471. Reference NB-P-000128."
  - Settled: "This trade is complete."
  - Cancelled: "This trade was cancelled." with reason.
- **Timeline**.
- **Payout destination**: key-value block (sample bank account).

### C5. Onboarding

- **Draft**: single-page form in a 720px column. Sections "Business" (legal name, registration number, jurisdiction, nature of business) and "Beneficial owners" (repeatable: full name, ownership percent). Action "Submit for review".
- **Submitted**: read-only summary and a status panel "Under review. No action is needed from you."
- **Approved**: status panel "Verified. You can request firm quotes." with a "Go to Trade" action.
- **Rejected**: status panel "Not approved" with the reason.

Validation errors appear under each field and in a summary at the top.

---

## Staff screens

Dense layout: 13px text, 40px rows, full-width tables.

### S1. Approvals

Table: Organisation · Jurisdiction · Submitted · Status. Selecting a row opens a side panel with all application fields, beneficial owners, and the actions "Approve" (primary) and "Reject" (danger, requires a reason).

### S2. Blotter

Two tabs: "Trades" (default) and "Quotes".

- **Trades tab** columns: Booked · Trade ID · Organisation · Pair · Side · Base amount · Quote amount · Client price · Status.
- **Quotes tab** columns: Time · Quote ID · Organisation · Pair · Side · Client price · Market price · Spread (bps) · Status.
- Filters: organisation, pair, status, date range.
- A summary row above the table: "In progress 4 · Settled today 7 · Spread revenue today 3,918.40 CAD".

### S3. Staff trade detail

Three columns of cards under a header with trade id, organisation and status chip.

1. **Trade and actions**: amounts and client price; the **settlement actions** valid for the current state as buttons, each labelled as simulated: "Simulate funds received", "Simulate payout sent", "Simulate payout confirmed", and "Cancel trade" (danger). Unavailable actions are not shown. The timeline sits below.
2. **Pricing**: client price, market price, spread in bps and in currency; then the **route** as a small table: Leg · Venue · Market · Price · Fee. For a synthetic route, two rows with a "×" between them and the resulting market price.
3. **Ledger**: postings for this trade grouped by event. Each group: event name and time, then rows of Account · Debit · Credit · Currency, with a "Balanced" tick per currency. Footer: "Integrity check passed" and "Run check".

### S4. Configuration

Sections as cards:

- **Spreads**: a grid with tiers as rows and size bands as columns, values in bps, editable inline.
- **Quote settings**: quote lifetime (seconds), minimum trade, public reference spread.
- **Organisations**: table of organisation, tier (select), maximum trade size.
- **Venues**: one row per venue with an enable toggle, connection status dot, "Last update 1s ago" and markets count.

A sticky bar appears on change: "3 unsaved changes" · "Discard" · "Save".

---

## States to cover for every screen

Loading (skeleton rows, never spinners on whole pages) · empty · error ("Something went wrong. Reference: req_8f2c41" with a retry action) · rate limited ("Too many requests. Try again in a moment.").
