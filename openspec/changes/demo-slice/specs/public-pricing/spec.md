# Spec Delta

## Purpose

Lets any visitor see an indicative conversion price between supported assets and currencies without an account.

## ADDED Requirements

### Requirement: Indicative price without login
The system SHALL show an indicative price for any supported pair among BTC, ETH, USDC and USDT against CAD and USD to visitors who are not signed in.

#### Scenario: Visitor views a price
- **WHEN** a visitor selects ETH to pay and CAD to receive
- **THEN** the widget shows an indicative ETH/CAD price and when it was last updated

#### Scenario: Amount entered on either side
- **WHEN** a visitor enters an amount in "You pay" or in "You receive"
- **THEN** the other field shows the indicative converted amount

### Requirement: Indicative prices are not executable
The system SHALL label every public price as indicative and SHALL NOT create a quote or trade from it.

#### Scenario: Visitor activates the main action
- **WHEN** a visitor who is not signed in activates the widget's main action
- **THEN** the visitor is prompted to choose a client persona, and no quote is created

### Requirement: One public price for everyone
The system SHALL derive public prices from the aggregated market mid-price with a single public reference spread, independent of client tier and amount.

#### Scenario: Different amounts
- **WHEN** two visitors view the same pair at the same moment with different amounts
- **THEN** both see the same unit price

### Requirement: Refresh and staleness
The system SHALL refresh indicative prices at least every 5 seconds and SHALL show no number when market data is stale.

#### Scenario: Market data unavailable
- **WHEN** no fresh aggregated price exists for the pair
- **THEN** the widget shows "Waiting for price updates"

### Requirement: Public price access is rate limited
The system SHALL limit how often a single source can request public prices.

#### Scenario: Limit exceeded
- **WHEN** one source exceeds the public price request limit
- **THEN** further requests are refused with a "too many requests" response until the limit window passes

### Requirement: Start verification from Home
The system SHALL offer on the Home page a short form that takes a visitor into onboarding as a not-yet-verified client, carrying over what they entered.

#### Scenario: Visitor submits the form
- **WHEN** a visitor enters a business name in the "Start with verification" form and submits it
- **THEN** they are taken to the onboarding application acting as the not-yet-verified client organisation, with the business name filled in

#### Scenario: No account is created
- **WHEN** the form is submitted
- **THEN** no new user or organisation is created; the seeded not-yet-verified organisation's draft application is used
