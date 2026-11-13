# Spec Delta

## Purpose

Shows how a business becomes eligible to trade: it submits a short application and a staff member approves or rejects it.

## ADDED Requirements

### Requirement: Simplified KYB application
The system SHALL collect a business's legal name, registration number, jurisdiction, nature of business and at least one beneficial owner on a single form.

#### Scenario: Missing required field
- **WHEN** the unapproved client submits without a required field
- **THEN** submission is refused and the missing fields are indicated

### Requirement: Application lifecycle
The system SHALL move an application only through the states draft, submitted, approved and rejected, using defined transitions.

#### Scenario: Submission
- **WHEN** the client submits a complete application
- **THEN** the state becomes submitted and the form becomes read-only

#### Scenario: Double submit
- **WHEN** the client submits the same application twice in quick succession
- **THEN** one submission is recorded

#### Scenario: Invalid transition
- **WHEN** an approval is attempted on an application that is still a draft
- **THEN** it is refused and the state does not change

### Requirement: Staff decision unlocks trading
The system SHALL allow firm quotes only for organisations whose application a staff member has approved.

#### Scenario: Approval
- **WHEN** staff approve a submitted application
- **THEN** the organisation can request firm quotes

#### Scenario: Not yet approved
- **WHEN** a member of an unapproved organisation opens the trading page
- **THEN** they see indicative prices only and their onboarding status

#### Scenario: Rejection
- **WHEN** staff reject an application with a reason
- **THEN** the organisation remains unable to trade and sees that it was not approved
