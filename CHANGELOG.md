# Changelog

## 0.1.1

Release candidate for Obsidian Community Plugins review.

### Fixed

- Updated release metadata after automated review checks.
- Prepared a new GitHub release version so Obsidian can re-run release checks against fresh assets.

## 0.1.0

Initial public MVP release.

### Added

- Build a reusable Obsidian vault tag index from frontmatter tags, Obsidian metadata, and optional inline tags.
- Recommend tags for the current note with AI-generated reasons, confidence labels, and close alternatives.
- Prefer existing vault tags and filter tags already present on the current note.
- Apply selected tags to frontmatter only after user confirmation.
- Undo the latest tag write made by the plugin for the current note.
- Generate a read-only vault-level tag health report.
- Group low-frequency tags, near duplicates, hierarchy issues, broad or narrow tags, and naming drift.
- Run optional AI-enhanced health analysis with summary and prioritized action items.
- Support Chinese, English, and Auto UI language modes.
- Support OpenAI-compatible providers such as DeepSeek and OpenAI.
- Show dev-mode timing for long-running AI operations.

### Notes

- The health report is diagnostic only and does not modify Markdown files.
- Batch cleanup plans, batch writes, and batch undo are planned for future releases.
