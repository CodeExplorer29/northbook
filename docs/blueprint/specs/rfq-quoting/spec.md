# Spec Delta

## Purpose

Lets an approved client request a firm, time-limited price for a specific trade and accept it exactly once, turning it into a booked trade.

## ADDED Requirements

### Requirement: Request a firm quote
The system SHALL let a trader in a KYB-approved organisation request a firm quote by giving a pair, a side, and an amount in either the asset being bought or the asset being sold.

#### Scenario: Successful quote
- **WHEN** a trader requests to buy BTC paying 250,000 CAD
- **THEN** a quote is returned with a quote identifier, the all-in unit price, the exact amount to pay, the exact amount to receive, and an expiry time

#### Scenario: Amount given on the receive side
- **WHEN** a trader requests to receive exactly 2 BTC
- **THEN** the quote fixes 2 BTC to receive and states the exact CAD amount to pay

### Requirement: All-in client price
The system SHALL quote a single all-in price that already includes the desk's spread, with no separate fee, where the spread depends on the organisation's pricing tier and the trade size.

#### Scenario: Tier affects price
- **WHEN** two organisations on different pricing tiers request the same quote at the same moment
- **THEN** the organisation on the better tier receives the better price

#### Scenario: Client does not see the market route
- **WHEN** a quote is returned to a client
- **THEN** it contains the client price only, not the venues, market price or spread

### Requirement: Trade size limits
The system SHALL refuse quote requests below the minimum trade size or above the organisation's maximum trade size.

#### Scenario: Below minimum
- **WHEN** a trader requests a quote smaller than the minimum
- **THEN** no quote is created and the response states the minimum

#### Scenario: Above maximum
- **WHEN** a trader requests a quote larger than the organisation's maximum
- **THEN** no quote is created and the response directs the trader to contact the desk

### Requirement: Quote expiry is enforced by the server
The system SHALL give every quote an expiry time and SHALL decide whether a quote is still valid using server time when the acceptance is received.

#### Scenario: Countdown shown
- **WHEN** a quote is displayed
- **THEN** the trader sees a countdown to expiry, after which the accept action is disabled and a "request new quote" action is offered

#### Scenario: Acceptance arrives late
- **WHEN** an acceptance reaches the server after the quote's expiry time, even if the trader's screen still showed time remaining
- **THEN** the acceptance is refused as expired and no trade is created

### Requirement: Accepting a quote creates exactly one trade
The system SHALL create at most one trade per quote, at exactly the quoted price and amounts.

#### Scenario: Successful acceptance
- **WHEN** a trader accepts an active quote before expiry
- **THEN** a trade is booked with the quote's price and amounts, and the quote becomes accepted

#### Scenario: Concurrent acceptance
- **WHEN** two acceptances for the same quote arrive at the same time
- **THEN** one trade exists and both responses refer to that trade

#### Scenario: Accepting an already accepted quote
- **WHEN** an acceptance arrives for a quote that already produced a trade
- **THEN** the existing trade is returned and no new trade is created

### Requirement: Idempotent requests
The system SHALL require an idempotency key on quote requests and acceptances, and SHALL return the original result when the same key is repeated with the same request.

#### Scenario: Retry after lost response
- **WHEN** a client repeats a request with the same idempotency key and identical content
- **THEN** the original response is returned and no additional quote or trade is created

#### Scenario: Key reused with different content
- **WHEN** a client reuses an idempotency key with different request content
- **THEN** the request is refused as a conflict

#### Scenario: Missing key
- **WHEN** a quote request or acceptance arrives without an idempotency key
- **THEN** it is refused

### Requirement: Firm quotes are honoured
The system SHALL honour an active quote accepted before expiry regardless of market movement after the quote was issued.

#### Scenario: Market moves during the countdown
- **WHEN** the market price moves against the desk between quote issue and a timely acceptance
- **THEN** the trade is still booked at the quoted price

### Requirement: Pricing guardrails
The system SHALL refuse to issue a quote when a fresh aggregated price is unavailable or when the computed client price is outside the configured sanity bounds.

#### Scenario: No fresh market price
- **WHEN** a trader requests a quote while aggregated market data for the pair is unavailable
- **THEN** no quote is created and the trader is told pricing is temporarily unavailable

#### Scenario: Client price would be better than market
- **WHEN** a pricing fault would produce a client price better than the market price it was derived from
- **THEN** no quote is issued and the fault is recorded for staff

### Requirement: Quote request throttling
The system SHALL limit how frequently an organisation can request firm quotes.

#### Scenario: Excessive requests
- **WHEN** an organisation exceeds the quote request limit
- **THEN** further requests are refused until the limit window passes

### Requirement: Quote history
The system SHALL keep every issued quote with its final status of accepted or expired and SHALL show an organisation its own quote history.

#### Scenario: Viewing history
- **WHEN** a member opens quote history
- **THEN** each quote shows pair, side, amounts, price, time issued and final status
