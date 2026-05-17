## ADDED Requirements

### Requirement: Generate cleanup review plan

The system SHALL generate a read-only cleanup review plan from the current tag health report and tag index.

#### Scenario: Plan generated from health issues

- **WHEN** the user runs tag health analysis and the report contains health issues
- **THEN** the system generates cleanup plan items for issues that reference indexed tags

#### Scenario: No additional vault scan

- **WHEN** the cleanup review plan is generated
- **THEN** the system uses the existing tag index associated with the health report

### Requirement: Show affected files

The system SHALL show affected file previews for each cleanup plan item.

#### Scenario: Affected files are listed

- **WHEN** a cleanup plan item references tags used in vault files
- **THEN** the item lists the affected file paths
- **AND** each file preview shows the current related tags and suggested related tags

### Requirement: Preserve read-only behavior

The system MUST NOT modify Markdown files when generating, displaying, or copying a cleanup review plan.

#### Scenario: User reviews plan

- **WHEN** the cleanup review plan is displayed
- **THEN** no Markdown file is written

#### Scenario: User copies plan

- **WHEN** the user copies the cleanup review plan as Markdown
- **THEN** no Markdown file is written

### Requirement: Copy plan as Markdown

The system SHALL allow the user to copy the cleanup review plan as Markdown.

#### Scenario: Copy succeeds

- **WHEN** the user selects the copy Markdown action
- **THEN** the system writes a Markdown representation of the plan to the clipboard
- **AND** the system shows a success notice

#### Scenario: Copy fails

- **WHEN** clipboard writing fails
- **THEN** the system shows a failure notice
