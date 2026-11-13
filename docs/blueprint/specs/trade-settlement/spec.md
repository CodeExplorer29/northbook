# Spec Delta

## Purpose

Carries a booked trade through to completion: the client funds their side, the desk pays out the other side to an approved destination, and both sides are confirmed.

## ADDED Requirements

### Requirement: Trade lifecycle
The system SHALL move a trade only through the states awaiting client funds, funds received, payout sent, settled, cancelled and failed, using defined transitions, and SHALL record every transition with its time and actor.

#### Scenario: Normal path
- **WHEN** client funds are confirmed, then payout is sent, then payout is confirmed
- **THEN** the trade passes through funds received and payout sent to settled

#### Scenario: Invalid transition
- **WHEN** any actor attempts an undefined transition, such as awaiting client funds directly to settled
- **THEN** the transition is refused and the state does not change

#### Scenario: Repeated transition
- **WHEN** the same transition is requested twice
- **THEN** it takes effect once and the second request returns the current state

### Requirement: Client funds before payout
The system SHALL NOT send a payout for a trade until the client's full funding for that trade has been confirmed.

#### Scenario: Payout attempted early
- **WHEN** a payout is requested for a trade that is still awaiting client funds
- **THEN** the payout is refused

### Requirement: Settlement instructions
The system SHALL show the client, immediately after a trade is booked, exactly what to send, where to send it, the payment reference to use, and the settlement deadline.

#### Scenario: Client buys crypto with fiat
- **WHEN** a trade to buy BTC with CAD is booked
- **THEN** the client sees the CAD amount, bank details, a unique payment reference and the deadline

#### Scenario: Client sells crypto for fiat
- **WHEN** a trade to sell ETH for CAD is booked
- **THEN** the client sees the exact ETH amount, the network, the organisation's deposit address for that network, the registered source wallets it may send from, and the deadline

### Requirement: Approved payout destinations
The system SHALL pay out only to a bank account or wallet address that the organisation has registered and that has been approved before the trade was booked.

#### Scenario: Wallet passes screening
- **WHEN** an organisation registers a wallet address and the screening result is low risk
- **THEN** the address becomes available as a payout destination

#### Scenario: Wallet fails screening
- **WHEN** screening returns high risk for a wallet address
- **THEN** the address is not usable and is flagged for compliance review

#### Scenario: Quote needs a destination
- **WHEN** a trader accepts a quote without an approved payout destination for the asset to be received
- **THEN** acceptance is refused and the trader is directed to add a destination

### Requirement: Registered source wallets
The system SHALL require an organisation to register and pass screening for the wallet addresses it will send crypto from, before it can accept a quote funded on chain.

#### Scenario: No registered source wallet
- **WHEN** a trader accepts a quote to sell crypto and the organisation has no approved source wallet on that network
- **THEN** acceptance is refused and the trader is directed to register one

### Requirement: Settlement deadline
The system SHALL cancel a trade whose client funds have not been confirmed by the settlement deadline, where the deadline is set from a funding window configured separately for bank funding and for on-chain funding.

#### Scenario: On-chain funding window
- **WHEN** a trade funded on chain is booked with a 60-minute on-chain funding window
- **THEN** its deadline is 60 minutes after booking

#### Scenario: Bank funding window
- **WHEN** a trade funded by bank transfer is booked
- **THEN** its deadline follows the bank funding window, which is longer than the on-chain window

#### Scenario: Deposit detected but not final at the deadline
- **WHEN** the deadline passes while a matching on-chain deposit has been detected but is not yet final
- **THEN** the trade is not cancelled until that deposit either becomes final or disappears

#### Scenario: Deadline passes
- **WHEN** the deadline passes while a trade is awaiting client funds
- **THEN** the trade becomes cancelled, the client and operations staff are notified, and no payout can be sent

#### Scenario: Funds confirmed before deadline
- **WHEN** funds are confirmed before the deadline
- **THEN** the deadline no longer applies

### Requirement: Funds confirmation is exact and applied once
The system SHALL confirm client funds only when the received amount matches the trade amount, and SHALL apply each incoming payment to at most one trade.

#### Scenario: On-chain deposit confirmed
- **WHEN** a confirmed on-chain deposit is matched to a trade
- **THEN** the trade becomes funds received without staff action

#### Scenario: Amount mismatch
- **WHEN** an incoming payment differs from the trade amount
- **THEN** the trade stays awaiting client funds and the payment is flagged for operations review

#### Scenario: Same payment reported twice
- **WHEN** the same incoming payment is reported more than once
- **THEN** it is applied once

### Requirement: Payout is sent at most once
The system SHALL send at most one payout per trade, including when the payout request is retried or its outcome is unknown.

#### Scenario: Retry after timeout
- **WHEN** a payout request times out and is retried
- **THEN** the payout provider receives the same payout reference and at most one payment is made

#### Scenario: Unknown outcome
- **WHEN** the outcome of a payout request cannot be determined
- **THEN** the trade stays in payout sent pending confirmation and is surfaced to operations, and no second payout is created

### Requirement: Failed and returned payouts
The system SHALL mark a trade failed when its payout fails or is returned, and SHALL require an operations decision before any further payout.

#### Scenario: Payout returned after settlement
- **WHEN** a payout is reported returned after the trade was settled
- **THEN** the trade becomes failed, the return is recorded in the ledger, and operations are alerted

### Requirement: Client trade view
The system SHALL show an organisation its trades with current state, amounts, price, settlement instructions and state history.

#### Scenario: Trade detail
- **WHEN** a member opens a trade
- **THEN** they see its current state, each past state with its time, and what action, if any, is expected from them
