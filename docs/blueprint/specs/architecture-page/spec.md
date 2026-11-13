# Spec Delta

## Purpose

Explains on the public website how the system is designed, so that a technical reader can understand its structure and its safety properties without reading the code.

## ADDED Requirements

### Requirement: Public architecture page
The system SHALL publish an architecture page that is reachable from the site navigation without login.

#### Scenario: Visitor opens the page
- **WHEN** a visitor follows the "Architecture" link
- **THEN** the page loads without requiring an account

### Requirement: Architecture content
The system SHALL present on that page a system overview diagram, the path of a price from venues to a client quote, the quote and trade state machines, the idempotency approach, the ledger model, and the technology choices with their reasons.

#### Scenario: Reader looks for the trade lifecycle
- **WHEN** a reader goes to the lifecycle section
- **THEN** they find a diagram of the trade states and the transitions between them

#### Scenario: Reader looks for failure handling
- **WHEN** a reader goes to the idempotency section
- **THEN** they find how duplicate requests, concurrent acceptance and unknown payout outcomes are handled

### Requirement: Simulated parts are disclosed
The system SHALL state on the architecture page, and on every page where money or identity is involved, which integrations are simulated and that no real funds move.

#### Scenario: Demo notice
- **WHEN** a visitor views the trading, settlement or onboarding pages
- **THEN** a notice states that the application is a demonstration and no real funds move

### Requirement: No sensitive configuration is disclosed
The system SHALL NOT show on the architecture page any secrets, client data, live spread values or internal addresses.

#### Scenario: Spread values
- **WHEN** the page describes how the client price is formed
- **THEN** it explains the method without showing configured spread values

### Requirement: Page works on small screens and in dark mode
The system SHALL keep the architecture page and its diagrams readable on phone-width screens and in both light and dark themes.

#### Scenario: Phone-width view
- **WHEN** the page is viewed at phone width
- **THEN** text does not require horizontal scrolling and each diagram remains legible or can be scrolled within its own area
