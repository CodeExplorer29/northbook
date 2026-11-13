# Spec Delta

## Purpose

Keeps a balanced and unchangeable record of what the desk and each client owe and hold, traceable to the trade event that caused each entry.

## ADDED Requirements

### Requirement: Double-entry postings
The system SHALL record every trade event as a ledger transaction whose debits equal its credits within each currency.

#### Scenario: Unbalanced posting
- **WHEN** a posting is attempted whose debits and credits differ in any currency
- **THEN** nothing is recorded

### Requirement: Every trade event is posted
The system SHALL post a ledger transaction when a trade is booked, when client funds are received, when a payout is sent, and when a trade is cancelled.

#### Scenario: Trade booked
- **WHEN** a quote is accepted
- **THEN** the ledger shows what the client owes the desk, what the desk owes the client, and the desk's spread revenue

#### Scenario: Trade cancelled
- **WHEN** a trade is cancelled
- **THEN** the booking is reversed and the client's obligations for that trade net to zero

### Requirement: Append-only
The system SHALL never modify or delete a posted entry; a correction SHALL be a reversing transaction linked to the original.

#### Scenario: Attempted modification
- **WHEN** any change to a posted entry is attempted
- **THEN** it is rejected

### Requirement: Atomic and once only
The system SHALL record a ledger transaction together with the state change that caused it or not at all, and at most once per event.

#### Scenario: Failure while booking
- **WHEN** an error occurs while booking a trade
- **THEN** neither the trade nor any ledger entry for it exists

#### Scenario: Event repeated
- **WHEN** the same trade event is processed twice
- **THEN** one ledger transaction exists for it

### Requirement: Exact amounts
The system SHALL store and compute monetary amounts as exact decimals at each currency's precision, rounding so the client never receives more or pays less than the quoted price implies.

#### Scenario: Rounding
- **WHEN** a computed amount has more decimal places than its currency allows
- **THEN** an amount the client receives is rounded down and an amount the client pays is rounded up

### Requirement: Balances and integrity check
The system SHALL compute balances from entries and SHALL provide a check that every transaction balances and every settled trade's client obligations net to zero.

#### Scenario: Check on consistent data
- **WHEN** the integrity check runs after a trade has settled
- **THEN** it reports no discrepancies
