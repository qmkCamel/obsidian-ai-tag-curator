## Context

The current plugin can build a vault-wide `TagIndex`, analyze it into a `TagHealthReport`, and show read-only issue groups in `TagHealthReportModal`. The next step is to turn those issue groups into an inspectable cleanup plan, but the product direction explicitly avoids batch writes until previews and trust signals are stronger.

## Goals / Non-Goals

**Goals:**

- Reuse the existing tag index and health report instead of rescanning the vault.
- Generate deterministic cleanup plan items from rule-based health issues.
- Show users which files a suggestion touches and what the related tags would look like after the suggested cleanup.
- Allow copying the plan as Markdown for manual review.
- Keep the feature read-only.

**Non-Goals:**

- Applying cleanup plans to Markdown files.
- Creating batch operation logs or batch undo.
- Asking AI to generate cleanup plans.
- Replacing the existing health report issue sections.

## Decisions

1. Add a dedicated cleanup module.

   `src/cleanup/` contains the cleanup plan model and builder. This keeps read-only cleanup planning separate from `src/operations/`, which currently represents actual write/undo behavior.

2. Build plans from `TagHealthReport` plus `TagIndex`.

   The health report knows what is wrong and the index knows where each tag appears. Combining them avoids another vault read and keeps the plan aligned with the visible diagnosis.

3. Treat target tags as candidates, not final decisions.

   For merge/rename issues with multiple tags, the builder chooses the highest-usage tag as a candidate target. Single-tag rename/broad-tag cases intentionally show that a human needs to choose the target.

4. Render cleanup plans inside the health report modal.

   The plan is a continuation of the diagnostic flow, so placing it near the health summary makes the progression from issue to impact preview visible without adding another command.

5. Copy Markdown instead of exporting files.

   Clipboard output is enough for the first review loop and avoids file-system destination choices inside Obsidian.

## Risks / Trade-offs

- [Risk] The preview only shows related tags, not full frontmatter diffs. -> Mitigation: Label the section as a review plan and keep writes out of scope.
- [Risk] Candidate target tags can be wrong for a user's taxonomy. -> Mitigation: Present them as candidates and require manual review.
- [Risk] Large issue groups can produce long modal content. -> Mitigation: Keep the layout compact and reuse existing tag/action controls.
- [Risk] Users may expect the plan to apply changes. -> Mitigation: UI copy explicitly states that no Markdown files are modified.
