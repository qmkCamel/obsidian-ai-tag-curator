## 1. OpenSpec Setup

- [x] 1.1 Initialize OpenSpec directories and Codex skills.
- [x] 1.2 Document project conventions in `openspec/project.md`.
- [x] 1.3 Create the `add-readonly-cleanup-plan` change artifacts.

## 2. Cleanup Plan Model

- [x] 2.1 Add cleanup plan TypeScript data shapes.
- [x] 2.2 Implement deterministic cleanup plan generation from `TagHealthReport` and `TagIndex`.
- [x] 2.3 Select candidate target tags for merge and multi-tag rename suggestions.
- [x] 2.4 Generate affected file previews with current and suggested related tags.

## 3. Health Report Integration

- [x] 3.1 Build a cleanup plan during tag health analysis.
- [x] 3.2 Render the cleanup review plan in the tag health report modal.
- [x] 3.3 Add Markdown clipboard output for the cleanup plan.
- [x] 3.4 Add localized Chinese and English UI labels.
- [x] 3.5 Add styles for the cleanup review plan section.

## 4. Verification

- [x] 4.1 Add unit tests for cleanup plan generation.
- [x] 4.2 Run `npm test`.
- [x] 4.3 Run `npm run build`.
- [x] 4.4 Inspect the modal styling with a local preview screenshot.
