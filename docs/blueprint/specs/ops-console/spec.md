# Spec Delta

## Purpose

Gives operations, compliance and admin staff the tools to review clients, control pricing and venues, monitor quotes and trades, and progress settlement, with every staff action recorded.

## ADDED Requirements

### Requirement: Role-based staff access
The system SHALL restrict each console function to the staff roles permitted to use it.

#### Scenario: Compliance-only action
- **WHEN** a staff member without the compliance role tries to approve a KYB application
- **THEN** the action is refused

#### Scenario: Admin-only action
- **WHEN** a staff member without the admin role tries to change pricing configuration
- **THEN** the action is refused

### Requirement: KYB review queue
The system SHALL show compliance staff the applications awaiting a decision, with all submitted information, documents and provider results, and SHALL let them approve, reject or request more information.

#### Scenario: Reviewing an application
- **WHEN** compliance staff open an application in review
- **THEN** they see the business details, beneficial owners, documents and each provider check result

### Requirement: Client pricing tiers and limits
The system SHALL let admin staff assign each organisation a pricing tier and a maximum trade size, and SHALL let them suspend an organisation.

#### Scenario: Tier change
- **WHEN** admin staff change an organisation's tier
- **THEN** quotes requested afterwards use the new tier, and quotes already issued are unchanged

### Requirement: Pricing configuration
The system SHALL let admin staff configure spreads per tier and size band, the public reference spread, quote lifetime, minimum trade size, bank and on-chain funding windows, staleness threshold and outlier tolerance.

#### Scenario: Invalid configuration
- **WHEN** admin staff enter a negative spread or a quote lifetime outside the allowed range
- **THEN** the change is refused

#### Scenario: Quote lifetime changed
- **WHEN** admin staff change the quote lifetime
- **THEN** quotes issued afterwards use the new lifetime

### Requirement: Venue controls
The system SHALL show each venue's status and let admin staff enable or disable it.

#### Scenario: Disabling the last venue
- **WHEN** admin staff disable the only enabled venue
- **THEN** they are warned that pricing will stop, and must confirm

### Requirement: Quote and trade blotter
The system SHALL show staff all quotes and trades across organisations with filters by organisation, pair, state and date, including for each quote the market route, market price and spread applied.

#### Scenario: Inspecting a quote
- **WHEN** staff open a quote
- **THEN** they see the client price, the underlying route with each leg's venue and price, and the spread

### Requirement: Settlement actions
The system SHALL let operations staff confirm client funds, send a payout, confirm a payout, and record a failed or returned payout for a trade.

#### Scenario: Confirming funds
- **WHEN** operations staff confirm receipt of the exact amount for a trade awaiting client funds
- **THEN** the trade becomes funds received

#### Scenario: Action repeated
- **WHEN** staff submit the same settlement action twice, for example by double-clicking
- **THEN** it takes effect once

### Requirement: Exceptions queue
The system SHALL list items that need staff attention: mismatched payments, unmatched or held on-chain deposits, payouts with unknown outcome, trades near their settlement deadline, and flagged wallet addresses.

#### Scenario: Unknown payout outcome
- **WHEN** a payout's outcome is unknown
- **THEN** the trade appears in the exceptions queue until staff resolve it

#### Scenario: Unmatched deposit
- **WHEN** a confirmed on-chain deposit matches no awaiting trade
- **THEN** it appears in the exceptions queue with its organisation, asset, amount and transaction reference, and staff can assign it to a trade or mark it for return

### Requirement: Chain monitoring status
The system SHALL show staff, for each network, whether monitoring is running, the last processed block and the delay behind the chain head.

#### Scenario: Staff check monitoring
- **WHEN** staff open the chain monitoring view
- **THEN** each network shows its running state, last processed block and delay

### Requirement: Ledger view
The system SHALL let staff browse accounts, balances and ledger transactions, and run the ledger integrity check.

#### Scenario: Running the check
- **WHEN** staff run the integrity check
- **THEN** the result and its time are shown

### Requirement: Audit log
The system SHALL record every staff action that changes data, with the actor, time, target and before-and-after values, in a log that cannot be edited.

#### Scenario: Configuration change is logged
- **WHEN** admin staff change a spread
- **THEN** the audit log shows who changed it, when, the old value and the new value

#### Scenario: Viewing sensitive documents is logged
- **WHEN** staff open a KYB document
- **THEN** the access is recorded
