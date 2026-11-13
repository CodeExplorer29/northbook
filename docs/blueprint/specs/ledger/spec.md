# Spec Delta

## Purpose

Keeps a complete, balanced and unchangeable record of what the desk and each client owe and hold, so that every amount can be traced to the event that caused it.

## ADDED Requirements

### Requirement: Double-entry postings
The system SHALL record every financial event as a ledger transaction whose debits equal its credits within each currency.

#### Scenario: Balanced transaction
- **WHEN** a trade is booked
- **THEN** a ledger transaction is posted in which, for each currency, total debits equal total credits

#### Scenario: Unbalanced transaction
- **WHEN** a posting is attempted whose debits and credits differ in any currency
- **THEN** nothing is recorded

### Requirement: Append-only history
The system SHALL never modify or delete a posted ledger entry; corrections SHALL be made by posting a reversing transaction that references the original.

#### Scenario: Correction
- **WHEN** a posted transaction must be undone
- **THEN** a new transaction with opposite entries is posted and linked to the original, and the original remains unchanged

### Requirement: Every money event is posted
The system SHALL post a ledger transaction when a trade is booked, when client funds are confirmed, when a payout is sent, when a payout fails or is returned, and when a trade is cancelled.

#### Scenario: Trade booked
- **WHEN** a quote is accepted
- **THEN** the ledger shows what the client owes the desk, what the desk owes the client, and the desk's spread revenue

#### Scenario: Trade cancelled before funding
- **WHEN** a trade is cancelled at the settlement deadline
- **THEN** the booking is reversed and the client's obligations for that trade net to zero

### Requirement: Postings are atomic with their cause
The system SHALL record a ledger transaction and the state change that caused it together or not at all.

#### Scenario: Failure during trade booking
- **WHEN** an error occurs while booking a trade
- **THEN** neither the trade nor any ledger entry for it exists

### Requirement: One posting per event
The system SHALL post at most one ledger transaction for each distinct business event.

#### Scenario: Event processed twice
- **WHEN** the same funds confirmation is processed twice
- **THEN** the ledger contains one transaction for it

### Requirement: Balances derive from entries
The system SHALL compute every account balance from its ledger entries.

#### Scenario: Balance check
- **WHEN** an account's balance is requested
- **THEN** it equals the sum of that account's entries

### Requirement: Exact amounts
The system SHALL store and compute all monetary amounts as exact decimals at each currency's defined precision.

#### Scenario: Rounding
- **WHEN** a computed amount has more decimal places than its currency allows
- **THEN** it is rounded so that the client never receives more or pays less than the quoted price implies, and the quote shows the rounded amounts

### Requirement: Traceability
The system SHALL link each ledger transaction to the trade or event that caused it.

#### Scenario: Tracing an entry
- **WHEN** staff open a ledger entry
- **THEN** they can navigate to the trade and state transition that produced it

### Requirement: Integrity check
The system SHALL provide a check that confirms all ledger transactions balance and that each settled trade's client obligations net to zero.

#### Scenario: Check passes
- **WHEN** the integrity check runs on a consistent ledger
- **THEN** it reports no discrepancies

#### Scenario: Check finds a problem
- **WHEN** a settled trade's obligations do not net to zero
- **THEN** the check reports that trade
