# Spec Delta

## Purpose

Gives the staff persona the pages needed to approve clients, inspect quotes and trades, progress settlement, and configure pricing.

## ADDED Requirements

### Requirement: Staff-only access
The system SHALL make the console available only to the staff persona.

#### Scenario: Client opens the console
- **WHEN** a viewer acting as a client requests a console page or action
- **THEN** access is refused

### Requirement: KYB approvals page
The system SHALL list applications with their state and let staff approve or reject submitted ones.

#### Scenario: Approving
- **WHEN** staff approve a submitted application
- **THEN** it moves to approved and the organisation can trade

### Requirement: Quote and trade blotter
The system SHALL list all quotes and trades across organisations, and SHALL show for each quote the client price, the market route with each leg's venue and price, the market price and the spread applied.

#### Scenario: Inspecting a quote
- **WHEN** staff open a quote
- **THEN** they see the route legs, the market price, the spread and the client price

### Requirement: Settlement actions on the blotter
The system SHALL offer on each trade only the simulated settlement actions valid for its current state.

#### Scenario: Trade awaiting funds
- **WHEN** staff open a trade awaiting client funds
- **THEN** "simulate funds received" and "cancel" are offered and "simulate payout sent" is not

#### Scenario: Cancelling asks for confirmation
- **WHEN** staff choose "cancel" on a trade
- **THEN** an inline confirmation asks for a reason, and the trade is cancelled only after staff confirm with a reason entered

### Requirement: Next step on the blotter
The system SHALL show for each trade on the blotter the next staff action that would progress it, or that none remains.

#### Scenario: Trade awaiting client funds
- **WHEN** staff view a trade awaiting client funds on the blotter
- **THEN** its next step reads "Confirm client funds"

#### Scenario: Settled trade
- **WHEN** staff view a settled or cancelled trade on the blotter
- **THEN** no next step is shown

### Requirement: Ledger view for a trade
The system SHALL show staff the ledger transactions of a trade and the result of the integrity check.

#### Scenario: Viewing entries
- **WHEN** staff open the ledger section of a settled trade
- **THEN** every posting for that trade is listed with accounts, directions and amounts

### Requirement: Desk position and spread revenue
The system SHALL show staff the desk's net position in each currency and the spread revenue it has earned, both derived from ledger postings, and SHALL value the position in CAD at current market prices.

#### Scenario: A trade changes the position
- **WHEN** a client sells 50 ETH for CAD and the trade is booked
- **THEN** the desk position shows 50 ETH more and less CAD by the market value of the trade

#### Scenario: Revenue by client
- **WHEN** staff open the desk page
- **THEN** spread revenue is listed per client and currency, and the client rows add up to the desk total

#### Scenario: A price is missing
- **WHEN** no fresh market price exists for a currency the desk holds
- **THEN** the quantity is still shown and no CAD value or total is invented

### Requirement: Pricing configuration page
The system SHALL let staff set spreads per tier and size band, the public reference spread, quote lifetime, minimum and maximum trade size, each organisation's tier, and which venues are enabled.

#### Scenario: Quote lifetime changed
- **WHEN** staff change the quote lifetime
- **THEN** quotes issued afterwards use it and existing quotes are unchanged

#### Scenario: Invalid value
- **WHEN** staff enter a negative spread
- **THEN** the change is refused

### Requirement: Venue status
The system SHALL show for each venue whether it is enabled, connected, and the age of its latest data.

#### Scenario: Viewing status
- **WHEN** staff open the configuration page
- **THEN** each venue's enabled state, connection state and data age are shown
