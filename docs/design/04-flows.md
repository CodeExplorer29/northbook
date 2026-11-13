# Flows and state machines

## Flow 1: Visitor to firm quote

```
Home (indicative price)
  └─ "Get a firm quote"
       └─ Persona switcher opens ("Choose a demo persona")
            ├─ Approved client ──► Trade (firm mode)
            └─ Unapproved client ─► Trade (indicative mode + "not verified yet" panel)
                                       └─ "Continue onboarding" ─► Onboarding
```

## Flow 2: Client sells 50 ETH for CAD (primary demo path)

| Step | Screen | What the client sees | Action |
|---|---|---|---|
| 1 | Trade | Widget in firm mode | Enters 50 ETH, selects CAD, "Get quote" |
| 2 | Trade | Quote card, active, 15s countdown, receive 207,892.50 CAD | "Accept quote" |
| 3 | Trade | Quote card, accepting, then accepted | "View trade" |
| 4 | Trade detail | Awaiting client funds; deposit instructions; funding window | waits |
| 5 | Trade detail | Funds received | waits |
| 6 | Trade detail | Payout sent, with reference | waits |
| 7 | Trade detail | Settled | done |

Steps 5 to 7 are driven by staff in Flow 4.

## Flow 3: Quote expires

| Step | Screen | What the client sees | Action |
|---|---|---|---|
| 1 | Trade | Quote card active | does nothing |
| 2 | Trade | Last 3 seconds: countdown turns red | does nothing |
| 3 | Trade | Quote card expired, amounts greyed | "Request new quote" |
| 4 | Trade | New quote card with a new price | |

If the client clicks "Accept quote" at the last instant and the server has already expired the quote, the card goes straight to the expired state with the message "This quote expired before we received your acceptance. No trade was made."

## Flow 4: Staff settles a trade

| Step | Screen | Action | Result |
|---|---|---|---|
| 1 | Blotter, Trades tab | Opens the trade in "Awaiting client funds" | Staff trade detail |
| 2 | Staff trade detail | Reviews pricing and route | |
| 3 | Staff trade detail | "Simulate funds received" | Status "Funds received"; new ledger group appears |
| 4 | Staff trade detail | "Simulate payout sent" | Status "Payout sent"; new ledger group appears |
| 5 | Staff trade detail | "Simulate payout confirmed" | Status "Settled"; integrity check passed |

## Flow 5: Onboarding and approval

```
Unapproved client: Onboarding (draft) ─ "Submit for review" ─► Onboarding (submitted)
Staff:             Approvals ─ select application ─ "Approve" ─► status Approved
Client:            Onboarding (approved) ─ "Go to Trade" ─► Trade (firm mode)
```

## Quote state machine

```
            request
               │
               ▼
           ┌────────┐   accepted before expiry   ┌──────────┐
           │ Active │ ─────────────────────────► │ Accepted │ ──► creates one trade
           └────────┘                            └──────────┘
               │
               │ timer ends
               ▼
           ┌─────────┐
           │ Expired │
           └─────────┘
```

Chips: Active → no chip, the countdown shows it · Accepted → positive · Expired → danger.

## Trade state machine

```
┌───────────────────────┐  funds received  ┌────────────────┐  payout sent  ┌─────────────┐  payout confirmed  ┌─────────┐
│ Awaiting client funds │ ───────────────► │ Funds received │ ────────────► │ Payout sent │ ─────────────────► │ Settled │
└───────────────────────┘                  └────────────────┘               └─────────────┘                    └─────────┘
            │
            │ cancel (staff, only from this state)
            ▼
      ┌───────────┐
      │ Cancelled │
      └───────────┘
```

| State | Chip | Client is expected to |
|---|---|---|
| Awaiting client funds | neutral | Send funds as instructed |
| Funds received | neutral | Nothing |
| Payout sent | neutral | Nothing |
| Settled | positive | Nothing |
| Cancelled | danger | Nothing |

## KYB application state machine

```
Draft ─ submit ─► Submitted ─ approve ─► Approved
                      │
                      └─ reject ─► Rejected
```

## Interaction rules

- A primary action disables on the first click and stays disabled until the server responds.
- The countdown shown to the client ends one second before the server's expiry, so a click that looks in time is in time.
- Prices in indicative mode update in place without layout shift; the changed digits may briefly tint emerald, never flash or animate across the screen.
- A firm quote never changes after it is shown. Only the countdown moves.
