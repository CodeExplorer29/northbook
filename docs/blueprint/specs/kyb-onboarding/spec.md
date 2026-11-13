# Spec Delta

## Purpose

Collects and verifies the information needed to accept a business as a trading client, and records the compliance decision that unlocks trading.

## ADDED Requirements

### Requirement: KYB application content
The system SHALL collect a business's legal name, registration number, jurisdiction, registered address, nature of business, expected trading volume, source of funds, beneficial owners holding 25% or more, and supporting documents.

#### Scenario: Missing required information
- **WHEN** an applicant submits without a required field or without at least one beneficial owner or attestation that none exists
- **THEN** submission is refused and the missing items are listed

#### Scenario: Save and resume
- **WHEN** an applicant leaves a partly completed application and returns later
- **THEN** previously entered information and uploaded documents are still present

### Requirement: Application lifecycle
The system SHALL move a KYB application only through the states draft, submitted, in review, needs information, approved and rejected, using defined transitions.

#### Scenario: Submission
- **WHEN** an applicant submits a complete draft
- **THEN** the state becomes submitted and the application can no longer be edited by the applicant

#### Scenario: More information requested
- **WHEN** compliance staff request more information with a note
- **THEN** the state becomes needs information, the applicant sees the note, and the requested parts become editable

#### Scenario: Invalid transition
- **WHEN** any actor attempts a transition that is not defined, such as draft directly to approved
- **THEN** the transition is refused and the state does not change

### Requirement: Idempotent submission
The system SHALL treat repeated submissions of the same application as one submission.

#### Scenario: Double submit
- **WHEN** an applicant submits the same application twice in quick succession
- **THEN** one submission is recorded and one verification is started

### Requirement: Verification provider checks
The system SHALL send submitted applications to a verification provider and SHALL record each result the provider returns.

#### Scenario: Provider result arrives
- **WHEN** the provider reports results for a business or a beneficial owner
- **THEN** the results are attached to the application and the application moves to in review

#### Scenario: Duplicate provider notification
- **WHEN** the provider delivers the same notification more than once
- **THEN** it is recorded once and has no further effect

#### Scenario: Unauthentic notification
- **WHEN** a notification arrives without a valid signature
- **THEN** it is rejected and nothing changes

### Requirement: Human compliance decision
The system SHALL require a compliance staff member to approve or reject each application, and SHALL record who decided, when, and why.

#### Scenario: Approval
- **WHEN** compliance staff approve an application
- **THEN** the organisation becomes KYB-approved and its traders can request firm quotes

#### Scenario: Rejection
- **WHEN** compliance staff reject an application with a reason
- **THEN** the organisation stays unable to trade and the applicant is told the application was not approved

#### Scenario: Provider pass alone does not approve
- **WHEN** the provider reports that all checks passed
- **THEN** the application waits in review until a staff member decides

### Requirement: Document confidentiality
The system SHALL make uploaded KYB documents readable only by members of the submitting organisation and by compliance and admin staff.

#### Scenario: Operations staff request a document
- **WHEN** a staff member with only the operations role requests a KYB document
- **THEN** access is refused

### Requirement: Applicant sees onboarding status
The system SHALL show the applicant the current application state and what, if anything, they need to do next.

#### Scenario: Status while in review
- **WHEN** an applicant opens the onboarding page while the application is in review
- **THEN** the page states that the application is under review and no action is needed
