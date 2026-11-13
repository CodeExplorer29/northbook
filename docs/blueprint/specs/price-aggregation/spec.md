# Spec Delta

## Purpose

Produces the best available market price for a pair, side and size by combining live order books from several liquidity venues, and gives staff runtime control over which venues are used.

## ADDED Requirements

### Requirement: Aggregate order books from multiple venues
The system SHALL maintain live order book data from every enabled venue for the instruments that venue lists.

#### Scenario: Several venues are healthy
- **WHEN** three venues are enabled and delivering data
- **THEN** a price request considers order books from all three

#### Scenario: A venue does not list a pair
- **WHEN** a venue has no market for a requested pair
- **THEN** that venue is skipped for the direct route without causing an error

### Requirement: Best size-adjusted price
The system SHALL price a request by walking order book depth for the requested size and SHALL return the route with the best resulting average price after venue fees.

#### Scenario: Deeper venue wins for a large size
- **WHEN** venue A has the best top-of-book price but too little depth for the requested size, and venue B fills the full size at a better average price
- **THEN** the result uses venue B

#### Scenario: Insufficient depth everywhere
- **WHEN** no route can fill the requested size
- **THEN** the request fails with an "insufficient liquidity" result and no price

### Requirement: Synthetic cross routes
The system SHALL build two-leg routes through a bridge currency when that gives a better price than a direct market or when no direct market exists.

#### Scenario: No direct market on a venue
- **WHEN** BTC/CAD is requested and one venue only lists BTC/USDT
- **THEN** a candidate route combines that venue's BTC/USDT with a USDT/CAD market and competes with direct BTC/CAD routes

#### Scenario: Route is recorded
- **WHEN** a price is returned
- **THEN** the result identifies each leg's venue, market, price and size

### Requirement: Stale and unhealthy venues are excluded
The system SHALL exclude a venue's data from pricing when that data is older than the configured staleness threshold or the venue connection is unhealthy.

#### Scenario: One venue goes stale
- **WHEN** a venue stops sending updates for longer than the staleness threshold
- **THEN** its books are not used and pricing continues with the remaining venues

#### Scenario: All venues stale
- **WHEN** no venue has fresh data for a pair
- **THEN** price requests for that pair fail with a "price unavailable" result

#### Scenario: Venue recovers
- **WHEN** a stale venue resumes delivering a complete order book
- **THEN** it is used again without manual action

### Requirement: Runtime venue control
The system SHALL let staff enable or disable a venue while the system is running, without a redeploy.

#### Scenario: Venue disabled
- **WHEN** staff disable a venue
- **THEN** new price requests stop using it within 5 seconds

#### Scenario: Venue enabled
- **WHEN** staff enable a venue that is configured but disabled
- **THEN** the system connects to it and uses it once its data is fresh

### Requirement: Outlier protection
The system SHALL discard a venue's price for a pair when it deviates from the median of the other venues by more than the configured tolerance.

#### Scenario: One venue shows an off-market price
- **WHEN** one venue's mid-price differs from the median of the others by more than the tolerance
- **THEN** that venue is excluded from the result and the exclusion is recorded

### Requirement: Venue health is observable
The system SHALL expose, for each venue, its enabled state, connection state and the age of its latest data.

#### Scenario: Staff check venue health
- **WHEN** staff open the venue status view
- **THEN** each venue shows whether it is enabled, connected, and how old its most recent update is
