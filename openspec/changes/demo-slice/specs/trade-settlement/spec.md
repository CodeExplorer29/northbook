# Spec Delta

## Purpose

Carries a booked trade to completion through a defined lifecycle, with staff-triggered simulated events standing in for bank and blockchain confirmations.

## ADDED Requirements

### Requirement: Trade lifecycle
The system SHALL move a trade only through the states awaiting client funds, funds received, payout sent, settled and cancelled, using defined transitions, and SHALL record each transition with its time and actor.

#### Scenario: Normal path
- **WHEN** funds received, payout sent and payout confirmed are triggered in order
- **THEN** the trade ends in settled

#### Scenario: Invalid transition
- **WHEN** payout sent is triggered for a trade still awaiting client funds
- **THEN** it is refused and the state does not change

#### Scenario: Repeated transition
- **WHEN** the same transition is triggered twice, for example by a double click
- **THEN** it takes effect once

### Requirement: Simulated settlement events
The system SHALL let staff trigger simulated events for client funds received, payout sent and payout confirmed, and SHALL mark them as simulated.

#### Scenario: Simulating funds received
- **WHEN** staff trigger "simulate funds received" on a trade awaiting client funds
- **THEN** the trade becomes funds received and the event is recorded as simulated

### Requirement: Cancellation
The system SHALL let staff cancel a trade only while it is awaiting client funds, and SHALL require a reason that the client can see.

#### Scenario: Cancel before funding
- **WHEN** staff cancel a trade awaiting client funds and give a reason
- **THEN** the trade becomes cancelled and the client's trade page shows that it was cancelled and why

#### Scenario: Cancel without a reason
- **WHEN** staff try to cancel without giving a reason
- **THEN** the cancellation is refused

#### Scenario: Cancel after funding
- **WHEN** staff try to cancel a trade whose funds were received
- **THEN** the cancellation is refused

### Requirement: Settlement instructions
The system SHALL show the client, after a trade is booked, what to send, where to send it and a payment reference, using clearly fictional bank details or deposit addresses.

#### Scenario: Client sells crypto
- **WHEN** a trade to sell ETH for CAD is booked
- **THEN** the client sees the ETH amount, the network and a sample deposit address marked as not real

### Requirement: Client trade view
The system SHALL show an organisation its trades with current state, amounts, price and a timeline of past states.

#### Scenario: Trade detail
- **WHEN** a member opens a trade
- **THEN** they see the current state and each past state with its time

### Requirement: No unenforced deadline is shown
The system SHALL NOT show the client a funding deadline, because this version does not cancel unfunded trades automatically.

#### Scenario: Trade awaiting client funds
- **WHEN** a client opens a trade that is awaiting client funds
- **THEN** the instructions state what to send and where, and show no closing time

### Requirement: Client sees when action is needed
The system SHALL mark, in the client's trade list and open trades, each trade that is waiting for the client to send funds.

#### Scenario: Trade awaiting client funds in the list
- **WHEN** a client views their trades and one is awaiting client funds
- **THEN** that trade is marked "Action needed"

#### Scenario: Trade past funding
- **WHEN** a trade is in funds received, payout sent, settled or cancelled
- **THEN** it is not marked "Action needed"

### Requirement: What happens next
The system SHALL show on the client's trade page, for every state, a statement of the current situation and whether anything is expected from the client.

#### Scenario: Funds received
- **WHEN** a client opens a trade in funds received
- **THEN** the page states that the funds have arrived, that the payout is being prepared, and that no action is needed
