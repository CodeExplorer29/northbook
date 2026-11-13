# Spec Delta

## Purpose

Defines who can sign in, how users belong to a business organisation, and what each role and onboarding state is permitted to do.

## ADDED Requirements

### Requirement: Business sign-up
The system SHALL let a person register with an email address and password and create an organisation that they administer.

#### Scenario: Successful sign-up
- **WHEN** a person submits a valid email, password and business name
- **THEN** a user and an organisation are created, the user becomes that organisation's admin, and the organisation's onboarding state is "not started"

#### Scenario: Email already registered
- **WHEN** a person signs up with an email that already has an account
- **THEN** no second account is created and the response does not reveal whether the email exists

### Requirement: Email verification
The system SHALL require a verified email address before a user can submit a KYB application.

#### Scenario: Unverified user tries to start KYB
- **WHEN** a user with an unverified email opens the KYB application
- **THEN** they are asked to verify their email first

### Requirement: Session security
The system SHALL authenticate users with server-side sessions that expire after inactivity and can be ended by the user.

#### Scenario: Session expires
- **WHEN** a session has been inactive longer than the configured timeout
- **THEN** the next request is treated as not logged in

#### Scenario: Repeated failed logins
- **WHEN** login fails repeatedly for one account within a short window
- **THEN** further attempts are temporarily refused

### Requirement: Organisation members and roles
The system SHALL let an organisation admin invite members with one of the roles admin, trader or viewer.

#### Scenario: Viewer cannot trade
- **WHEN** a member with the viewer role tries to request or accept a quote
- **THEN** the action is refused

#### Scenario: Trader can trade
- **WHEN** a member with the trader role in a KYB-approved organisation requests a quote
- **THEN** the request is allowed

### Requirement: Organisation data isolation
The system SHALL ensure a user can only read or change data belonging to an organisation they are a member of.

#### Scenario: Access to another organisation's trade
- **WHEN** a user requests a quote, trade or document that belongs to a different organisation
- **THEN** the response is "not found"

### Requirement: Trading is gated by onboarding state
The system SHALL allow firm quotes and trades only for organisations whose KYB state is approved.

#### Scenario: Logged in, KYB not approved
- **WHEN** a member of an organisation that is not KYB-approved opens the trading screen
- **THEN** they see indicative prices only, with a prompt showing their onboarding status and next step

#### Scenario: Approval suspended
- **WHEN** staff suspend an approved organisation
- **THEN** its members can no longer request or accept quotes, and existing trades remain visible

### Requirement: Staff accounts are separate
The system SHALL keep staff accounts separate from client accounts, with the staff roles operations, compliance and admin.

#### Scenario: Client opens the operations console
- **WHEN** a client user requests any operations console page or action
- **THEN** access is refused
