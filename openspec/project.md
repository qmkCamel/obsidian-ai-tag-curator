# Project Context

## Purpose

AI Tag Curator is an Obsidian Community Plugin for tag governance. It helps users reuse existing vault tags, inspect vault-level tag health, and make tag changes only after explicit review.

## Tech Stack

- TypeScript targeting Obsidian's plugin runtime.
- Obsidian API for vault reads, metadata cache, modals, notices, and frontmatter writes.
- Vitest for unit tests.
- esbuild for the production bundle.
- mise pins the local Node runtime.

## Conventions

- Prefer read-only analysis before any feature that can modify Markdown files.
- Any write flow must have preview, explicit confirmation, operation logging, and undo support.
- Keep UI copy centralized in `src/ui/labels.ts` with Simplified Chinese and English labels.
- Keep rules and data models small, deterministic, and unit tested before introducing AI behavior.
- Use Obsidian-native CSS variables and compact modal layouts.
- Generate `main.js` with `npm run build` after TypeScript changes.

## Verification

- Run `npm test`.
- Run `npm run build`.
- For UI changes, inspect a rendered modal or local preview screenshot when possible.

## Current Product Direction

The next product increment is OpenSpec-tracked 0.2 work: generate read-only tag cleanup review plans from tag health reports. Batch writes remain out of scope until review plans and previews are proven useful.
