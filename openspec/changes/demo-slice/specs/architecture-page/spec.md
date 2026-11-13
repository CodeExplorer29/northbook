# Spec Delta

## Purpose

Explains on the public website how the system is designed and how the demonstration differs from a production system.

## ADDED Requirements

### Requirement: Public architecture page
The system SHALL publish an architecture page reachable from the site navigation without signing in.

#### Scenario: Visitor opens the page
- **WHEN** a visitor follows the "Architecture" link
- **THEN** the page loads without choosing a persona

### Requirement: Architecture content
The system SHALL present a system overview diagram, how a price travels from venues to a client quote, the quote and trade state machines, the idempotency approach, the ledger model, and the technology choices with reasons.

#### Scenario: Reader looks for concurrency handling
- **WHEN** a reader goes to the idempotency section
- **THEN** they find how duplicate requests and concurrent acceptance are handled

### Requirement: Real, mocked and deferred are distinguished
The system SHALL list on the page which parts are real, which are mocked, and which belong to the full blueprint and are not built.

#### Scenario: Reader checks settlement
- **WHEN** a reader looks up settlement
- **THEN** the page states that bank and on-chain events are simulated and summarises how the blueprint handles them

### Requirement: Diagrams match the implementation
The system SHALL generate the state-machine diagrams from the same transition definitions the application uses.

#### Scenario: A transition is added
- **WHEN** a transition is added to the trade state machine
- **THEN** the diagram on the page includes it after the next build

### Requirement: Readable on small screens
The system SHALL keep the page and its diagrams readable at phone width.

#### Scenario: Phone width
- **WHEN** the page is viewed at phone width
- **THEN** text needs no horizontal scrolling and each diagram is legible or scrolls within its own area
