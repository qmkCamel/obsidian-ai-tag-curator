## Why

The vault-level tag health report can identify taxonomy problems, but users still need to understand what a cleanup suggestion would affect before they can trust the next step. A read-only cleanup review plan bridges that gap without introducing batch writes or file mutation risk.

## What Changes

- Add a `CleanupPlan` data model for reviewable tag cleanup suggestions.
- Generate cleanup plan items from the current `TagHealthReport` and `TagIndex`.
- Show affected files and before/after related-tag previews inside the tag health report modal.
- Allow users to copy the cleanup plan as Markdown for manual review.
- Keep the entire flow read-only; no Markdown files are modified.

## Capabilities

### New Capabilities

- `tag-cleanup-review-plan`: Generate and present a read-only review plan for tag cleanup suggestions.

### Modified Capabilities

None.

## Impact

- Adds cleanup plan model/building code under `src/cleanup/`.
- Updates `src/main.ts` to build a cleanup plan alongside tag health reports.
- Updates `src/preview/TagHealthReportModal.ts`, `src/ui/labels.ts`, and `styles.css`.
- Adds unit coverage for cleanup plan generation.
- Updates roadmap documentation to point current priority at 0.2 cleanup planning.
