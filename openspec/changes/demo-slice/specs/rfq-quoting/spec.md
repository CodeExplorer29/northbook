# Spec Delta

## Purpose

Lets an approved client request a firm, time-limited price for a specific trade and accept it exactly once, turning it into a booked trade.

## ADDED Requirements

### Requirement: Request a firm quote
The system SHALL let a trader in an approved organisation request a firm quote by giving a pair, a side, and an amount on either the pay side or the receive side.

#### Scenario: Successful quote
- **WHEN** a trader requests to sell 50 ETH for CAD
- **THEN** a quote is returned with an identifier, the all-in unit price, the exact amount to pay, the exact amount to receive and an expiry time

#### Scenario: Amount on the receive side
- **WHEN** a trader requests to receive exactly 2 BTC
- **THEN** the quote fixes 2 BTC to receive and states the exact amount to pay

### Requirement: All-in client price
The system SHALL quote one all-in price that includes the desk's spread, where the spread depends on the organisation's tier and the trade size, and SHALL NOT reveal the market route or spread to the client.

#### Scenario: Tier affects price
- **WHEN** two organisations on different tiers request the same quote at the same moment
- **THEN** the better tier receives the better price

#### Scenario: Client response
- **WHEN** a quote is returned to a client
- **THEN** it contains no venue, market price or spread

### Requirement: Trade size limits
The system SHALL refuse quote requests below the minimum or above the maximum trade size.

#### Scenario: Below minimum
- **WHEN** a trader requests a quote smaller than the minimum
- **THEN** no quote is created and the minimum is stated

### Requirement: Server-enforced expiry
The system SHALL give every quote an expiry time and SHALL judge validity by server time when the acceptance is received.

#### Scenario: Countdown
- **WHEN** a quote is displayed
- **THEN** a countdown is shown, and at zero the accept action is disabled and a re-quote action is offered

#### Scenario: Late acceptance
- **WHEN** an acceptance reaches the server after expiry
- **THEN** it is refused as expired and no trade is created

### Requirement: At most one trade per quote
The system SHALL create at most one trade per quote, at exactly the quoted price and amounts.

#### Scenario: Successful acceptance
- **WHEN** a trader accepts an active quote before expiry
- **THEN** a trade is booked with the quote's price and amounts

#### Scenario: Concurrent acceptance
- **WHEN** many acceptances for the same quote arrive at the same time
- **THEN** one trade exists and every successful response refers to it

#### Scenario: Already accepted
- **WHEN** an acceptance arrives for a quote that already produced a trade
- **THEN** the existing trade is returned

### Requirement: Idempotent requests
The system SHALL require an idempotency key on quote requests and acceptances and SHALL return the original result when a key is repeated with the same request.

#### Scenario: Retry
- **WHEN** a request is repeated with the same key and identical content
- **THEN** the original response is returned and nothing new is created

#### Scenario: Key reused with different content
- **WHEN** a key is reused with different content
- **THEN** the request is refused as a conflict

### Requirement: Firm quotes are honoured
The system SHALL book a timely acceptance at the quoted price regardless of market movement since the quote was issued.

#### Scenario: Market moves during the countdown
- **WHEN** the market moves against the desk before a timely acceptance
- **THEN** the trade is booked at the quoted price

### Requirement: Pricing guardrails
The system SHALL issue no quote when a fresh aggregated price is unavailable or when the client price would be better than the market price it derives from.

#### Scenario: No fresh price
- **WHEN** a quote is requested while market data for the pair is unavailable
- **THEN** no quote is created and the trader is told the desk is waiting for price updates

### Requirement: Quote request throttling
The system SHALL limit how frequently an organisation and a single source can request firm quotes.

#### Scenario: Excessive requests
- **WHEN** the quote request limit is exceeded
- **THEN** further requests are refused with a "too many requests" response until the limit window passes, and no quote is created

### Requirement: Quote history
The system SHALL show an organisation its own quotes with their final status of accepted or expired.

#### Scenario: Viewing history
- **WHEN** a member opens quote history
- **THEN** each quote shows pair, side, amounts, price, time and status

### Requirement: A shown quote is stable and shown once
The system SHALL keep every figure of a firm quote unchanged while it is displayed, and SHALL show its pay and receive amounts in one place only.

#### Scenario: Inputs collapse when a quote is shown
- **WHEN** a firm quote is displayed
- **THEN** the amount inputs are replaced by a one-line summary of the request, and the quote card alone shows the pay and receive amounts

#### Scenario: Only the countdown moves
- **WHEN** market prices change while a quote is displayed
- **THEN** the quote's price and amounts do not change

### Requirement: Late acceptance is explained
The system SHALL tell the trader plainly when an acceptance was refused because the quote had expired.

#### Scenario: Server expired the quote first
- **WHEN** a trader accepts at the last moment and the server refuses it as expired
- **THEN** the quote card shows its expired state with the message "This quote expired before we received your acceptance. No trade was made."

### Requirement: Accept action cannot be submitted twice from the interface
The system SHALL disable the accept action on first use and show progress until the server responds.

#### Scenario: Double click on accept
- **WHEN** a trader clicks "Accept quote" twice in quick succession
- **THEN** one acceptance request is sent and the button shows "Accepting…" until the response arrives
