# Spec Delta

## Purpose

Produces the best available market price for a pair, side and size by combining live order books from several venues.

## ADDED Requirements

### Requirement: Aggregate order books from multiple venues
The system SHALL maintain live order book data from each enabled venue among Kraken, Coinbase and Binance.

#### Scenario: A venue does not list a pair
- **WHEN** a venue has no market for a requested pair
- **THEN** that venue is skipped for the direct route without an error

### Requirement: Best size-adjusted price
The system SHALL price a request by walking order book depth for the requested size and SHALL return the route with the best average price after venue fees.

#### Scenario: Deeper venue wins
- **WHEN** venue A has the best top-of-book price but too little depth, and venue B fills the full size at a better average price
- **THEN** the result uses venue B

#### Scenario: Insufficient depth
- **WHEN** no route can fill the requested size
- **THEN** the request fails with "insufficient liquidity" and no price

### Requirement: Synthetic cross routes
The system SHALL build two-leg routes through USD, USDT or USDC when no direct market exists or when the two-leg route gives a better price.

#### Scenario: No direct CAD market
- **WHEN** BTC/CAD is requested and a venue only lists BTC/USDT
- **THEN** a route combining BTC/USDT with a USDT/CAD market competes with direct BTC/CAD routes

#### Scenario: Route is recorded
- **WHEN** a price is returned
- **THEN** it identifies each leg's venue, market and price

### Requirement: Stale venues are excluded
The system SHALL exclude a venue's data when it is older than the staleness threshold.

#### Scenario: One venue stale
- **WHEN** a venue stops sending updates beyond the threshold
- **THEN** pricing continues with the remaining venues

#### Scenario: All venues stale
- **WHEN** no venue has fresh data for a pair
- **THEN** price requests for that pair fail with "price unavailable"

### Requirement: Runtime venue control
The system SHALL let staff enable or disable a venue without a restart.

#### Scenario: Venue disabled
- **WHEN** staff disable a venue
- **THEN** new price requests stop using it within 5 seconds

### Requirement: Offline replay mode
The system SHALL be able to run from recorded market data instead of live venue connections.

#### Scenario: No network
- **WHEN** the system is started in replay mode
- **THEN** prices are produced from the recorded data and the staff venue status indicates replay
