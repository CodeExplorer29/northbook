# Spec Delta

## Purpose

Gives each client a stable on-chain address to fund trades, detects and confirms incoming transfers to those addresses, and matches each confirmed deposit to the trade it pays for.

## ADDED Requirements

### Requirement: Fixed deposit address per organisation and network
The system SHALL assign each KYB-approved organisation one deposit address per supported network, and SHALL keep that address unchanged across trades.

#### Scenario: Second trade on the same network
- **WHEN** an organisation books a second trade funded on a network it has used before
- **THEN** the settlement instructions show the same deposit address as the first trade

#### Scenario: Address is unique to the organisation
- **WHEN** two organisations are assigned deposit addresses on the same network
- **THEN** the addresses differ

#### Scenario: One address for all assets on a network
- **WHEN** an organisation funds one trade in ETH and another in USDC on the same network
- **THEN** both use the same deposit address

### Requirement: Supported networks only
The system SHALL offer on-chain funding only on networks for which deposit monitoring is active, and SHALL state the network alongside every deposit address.

#### Scenario: Network without monitoring
- **WHEN** a trader requests a quote that would require funding on a network with no active monitoring
- **THEN** no quote is created and the trader is told the network is not yet supported

### Requirement: Detect incoming transfers
The system SHALL detect native-asset transfers and supported token transfers sent to any assigned deposit address.

#### Scenario: Transfer detected before finality
- **WHEN** a transfer to a deposit address appears on chain but is not yet final
- **THEN** the client's trade shows "deposit detected, awaiting confirmation" and the trade state does not change

#### Scenario: Unsupported token
- **WHEN** a token that the desk does not support is sent to a deposit address
- **THEN** it is recorded for operations review and applied to no trade

### Requirement: Credit only after finality
The system SHALL treat a deposit as received only once the block containing it is final on its network.

#### Scenario: Deposit becomes final
- **WHEN** the block containing a detected deposit becomes final
- **THEN** the deposit is marked confirmed and becomes eligible for matching

#### Scenario: Detected transfer disappears
- **WHEN** a detected transfer is no longer on chain before finality
- **THEN** the detection is withdrawn and the client's trade returns to awaiting funds

### Requirement: Each deposit is recorded once
The system SHALL record each on-chain transfer at most once, however many times it is observed.

#### Scenario: Same block processed twice
- **WHEN** monitoring processes a block it has already processed
- **THEN** no additional deposits are recorded

### Requirement: Monitoring resumes without gaps
The system SHALL resume monitoring after an interruption from the last block it fully processed, so that no block is skipped.

#### Scenario: Monitoring restarts
- **WHEN** monitoring is stopped while deposits arrive and is later restarted
- **THEN** every deposit made during the interruption is recorded

### Requirement: Match deposits to trades
The system SHALL apply a confirmed deposit to a trade only when the organisation, asset, network and exact amount match a trade that is awaiting client funds and within its funding window.

#### Scenario: Exact match
- **WHEN** a confirmed deposit of 50 ETH arrives at an organisation's address and that organisation has one trade awaiting 50 ETH
- **THEN** the deposit is applied to that trade and the trade becomes funds received

#### Scenario: Several matching trades
- **WHEN** a confirmed deposit matches more than one awaiting trade of the same asset and amount
- **THEN** it is applied to the trade booked earliest

#### Scenario: No matching trade
- **WHEN** a confirmed deposit matches no awaiting trade, including a wrong amount or a trade already cancelled
- **THEN** it is applied to no trade and appears in the operations exceptions queue

#### Scenario: Deposit used once
- **WHEN** a deposit has been applied to a trade
- **THEN** it cannot be applied to any other trade

### Requirement: Source address checks
The system SHALL screen the sending address of every deposit and SHALL withhold a deposit from matching when the sender is high risk or is not a source wallet the organisation has registered.

#### Scenario: Unregistered sender
- **WHEN** a confirmed deposit comes from an address the organisation has not registered
- **THEN** the deposit is held for compliance review and the trade stays awaiting funds

#### Scenario: High-risk sender
- **WHEN** screening reports the sending address as high risk
- **THEN** the deposit is held for compliance review and no payout can be sent for it

### Requirement: Monitoring health is observable
The system SHALL expose, for each network, the last processed block, the delay behind the chain head, and whether monitoring is running.

#### Scenario: Monitoring falls behind
- **WHEN** monitoring for a network is further behind the chain head than the configured threshold
- **THEN** staff see a warning for that network
