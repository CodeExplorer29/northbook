# Spec Delta

## Purpose

Lets any visitor see an indicative conversion price between supported assets and currencies without an account, and leads them towards onboarding to obtain a firm quote.

## ADDED Requirements

### Requirement: Indicative price without login
The system SHALL show an indicative price for any supported pair to visitors who are not logged in.

#### Scenario: Visitor views a price
- **WHEN** a visitor selects BTC as the asset to receive and CAD as the currency to pay
- **THEN** the widget shows an indicative BTC/CAD price and the time it was last updated

#### Scenario: Visitor enters an amount on either side
- **WHEN** a visitor enters an amount in the "You pay" field or in the "You receive" field
- **THEN** the other field is filled with the indicative converted amount

#### Scenario: Unsupported pair
- **WHEN** a visitor selects two assets that do not form a supported pair
- **THEN** the widget states that the pair is not supported and shows no price

### Requirement: Indicative prices are not executable
The system SHALL label every public price as indicative and SHALL NOT allow a trade to be created from it.

#### Scenario: Label is shown
- **WHEN** an indicative price is displayed
- **THEN** it is marked "Indicative" with a statement that the final price is given in a firm quote after verification

#### Scenario: Visitor tries to proceed
- **WHEN** a visitor who is not logged in activates the widget's main action
- **THEN** the visitor is taken to sign up or log in, and no quote or trade is created

### Requirement: Indicative prices do not reveal client pricing
The system SHALL derive public prices from the aggregated market mid-price with a single public reference spread, independent of any client's pricing tier and of requested size.

#### Scenario: Same price for every visitor
- **WHEN** two visitors request the indicative price for the same pair at the same moment with different amounts
- **THEN** both receive the same unit price

### Requirement: Indicative prices refresh and show staleness
The system SHALL refresh displayed indicative prices automatically and SHALL stop showing a price when market data is stale.

#### Scenario: Automatic refresh
- **WHEN** the widget stays open
- **THEN** the price updates at least every 5 seconds without a page reload

#### Scenario: Market data unavailable
- **WHEN** no fresh aggregated price exists for the pair
- **THEN** the widget shows "Price temporarily unavailable" instead of a number

### Requirement: Public price access is rate limited
The system SHALL limit how often a single source can request public prices.

#### Scenario: Limit exceeded
- **WHEN** one source exceeds the public price request limit
- **THEN** further requests are refused with a "too many requests" response until the limit window passes
