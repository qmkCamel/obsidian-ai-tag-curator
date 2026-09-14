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
- Write OpenSpec proposals, designs, tasks, and requirement specs in Chinese by default.
- Keep UI copy centralized in `src/ui/labels.ts` with Simplified Chinese and English labels.
- Keep rules and data models small, deterministic, and unit tested before introducing AI behavior.
- Use Obsidian-native CSS variables and compact modal layouts.
- Generate `main.js` with `npm run build` after TypeScript changes.

## Verification

- Run `npm test`.
- Run `npm run build`.
- For UI changes, inspect a rendered modal or local preview screenshot when possible.

## Current Product Direction

The dev baseline includes reviewed deterministic inline-tag rewrites for health-report rename/merge actions, with trusted `TagCache.position`, occurrence selection and V2 fixed-target recovery. The next planned increment is `add-tag-management-workbench`: a local-first ItemView, independent manual exact-tag rename/merge, shared exclusion/protection policy, index freshness and visible operation history. The proposal is design-only until its implementation tasks are completed. Existing current-note and folder workflows remain additive frontmatter-only. Protected and unselected tag values, shared mutation coordination and truthful legacy history are prerequisites, not optional UI checks. Silent background writes, inline additions/deletions/splits, subtree migration, regex/global replacement, AI-generated body edits and arbitrary-order undo remain out of scope.
