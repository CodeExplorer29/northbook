# Spec Delta

## Purpose

Lets a viewer experience the application as different kinds of user without registering, starting from realistic seeded data that can be restored at any time.

## ADDED Requirements

### Requirement: Persona switching without credentials
The system SHALL let a viewer act as a visitor, as a member of any seeded client organisation, or as staff by choosing from a switcher, without a password.

#### Scenario: Choosing a client organisation
- **WHEN** a viewer selects a verified client organisation in the switcher
- **THEN** the viewer is signed in as that organisation's seeded user

#### Scenario: Entries show current verification status
- **WHEN** a viewer opens the switcher after staff have approved an organisation that was seeded as not verified
- **THEN** that organisation's entry is named by the organisation and shows "Verified"

#### Scenario: Leaving a persona
- **WHEN** a viewer selects "Visitor"
- **THEN** the viewer is signed out and sees only public pages

### Requirement: Permissions follow the persona
The system SHALL enforce on the server the permissions and data visibility of the active persona.

#### Scenario: Client persona requests a staff action
- **WHEN** a viewer acting as a client calls a staff-only action directly
- **THEN** the action is refused

#### Scenario: Client persona requests another organisation's data
- **WHEN** a viewer acting as one organisation requests a quote or trade of another organisation
- **THEN** the response is "not found"

### Requirement: Seeded demo data
The system SHALL start with seeded organisations in different onboarding states and with past quotes and trades in different states.

#### Scenario: First visit
- **WHEN** a viewer opens the staff blotter on a freshly seeded system
- **THEN** it already lists trades in several states

### Requirement: Data is kept
The system SHALL keep everything viewers do. Quotes, trades, ledger entries, applications and configuration are not restored to the seeded state on a schedule or by any action in the interface.

#### Scenario: Returning later
- **WHEN** a viewer settles a trade and returns later
- **THEN** the trade and its ledger entries are still present

#### Scenario: No reset in the interface
- **WHEN** a viewer opens the persona switcher
- **THEN** no reset action or reset time is shown

### Requirement: Demo notice
The system SHALL show on every page that this is an independent demonstration not affiliated with any existing company, that no real funds move, and that identity and settlement are simulated.

#### Scenario: Trading page
- **WHEN** a viewer opens the trading page
- **THEN** the demo notice is visible

### Requirement: Shared demo data is disclosed
The system SHALL tell viewers that each persona is shared by everyone using the instance, so quotes and trades made by other viewers may appear.

#### Scenario: Choosing a persona
- **WHEN** a viewer opens the persona switcher
- **THEN** it states that demo data is shared between viewers
