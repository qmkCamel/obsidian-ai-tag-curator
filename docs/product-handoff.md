# Obsidian AI Tag Curator Product Handoff

Updated: 2026-08-04

## Context

This project explores an Obsidian plugin that uses AI to recommend tags for notes based on:

- the current article/note content;
- the vault's existing tag system;
- the user's desired level of strictness around creating new tags.

The original product question was whether an AI tag-generation plugin for Obsidian has market potential, and whether similar products already exist.

## Short Answer

There is a real market for this direction, but a plain "AI tag generator" is already a crowded and partially solved feature. The stronger opportunity is to position the product as an AI tag curator: a tool that helps maintain, audit, consolidate, and safely evolve an Obsidian vault's tag system.

The product should not compete primarily on "generate tags for the current note." It should compete on "keep the whole vault's taxonomy coherent over time."

## Market Signals

Obsidian's plugin ecosystem is large enough to support focused workflow plugins. Public plugin directories show thousands of community plugins, and AI-assistance plus vault-organization categories have meaningful adoption.

Observed market signals from public plugin metadata:

- AI and vault-organization plugins are already common user workflows.
- Existing AI assistant plugins such as Obsidian Copilot and Smart Connections have very high adoption, showing that Obsidian users do install AI-assisted knowledge-management tools.
- Dedicated auto-tagging plugins exist, but their download counts are much smaller than broad AI assistants. This suggests demand exists, but tag generation alone may be a narrow wedge.

Useful references:

- Observatory categories: https://observatory.md/categories
- Obsidian community plugin stats: https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json

## Direct Competitors

### AI Tagger Universe

Repository: https://github.com/Agents365-ai/obsidian-ai-tagger-universe

Relevant capabilities:

- generate new tags from note content;
- match existing vault tags;
- use a custom tag list;
- mix generated tags and existing tags;
- batch process notes;
- support hierarchical tags;
- visualize tag relationships.

This is the strongest direct competitor. Its feature set overlaps heavily with a simple version of this product.

### Auto Tag

Repository: https://github.com/CtrlAltFocus/obsidian-plugin-auto-tag

Relevant capabilities:

- uses OpenAI to generate tags;
- writes tags into frontmatter;
- can generate from selected text;
- provides preview before applying;
- supports configurable tag format.

This covers the "generate tags for this note" use case and some basic safety around previewing.

### LLM Tagger and Other Smaller Plugins

Several smaller plugins also cover automatic tagging, local LLM usage, preset tag lists, or related taxonomy helpers.

Reference category:

- Obsidian Stats auto-tagging category: https://www.obsidianstats.com/tags/auto-tagging

## Overlap Assessment

If this product is framed as "AI automatically generates tags for notes," overlap with AI Tagger Universe is high, likely around 70%-85%.

High-overlap areas:

- current note tag suggestions;
- generating new tags;
- matching existing vault tags;
- custom tag lists;
- batch processing;
- hierarchical tags;
- tag graph visualization.

Lower-overlap opportunity areas:

- full-vault tag health audit;
- duplicate and near-duplicate tag detection;
- tag merge and rename recommendations;
- taxonomy drift detection;
- safe batch changes with reviewable diffs and undo;
- long-term tag governance rules;
- explainable "why this existing tag, not that similar tag" reasoning.

The product should therefore avoid being described as an AI tag generator. It should be described as an AI tag governance and curation plugin.

## Recommended Positioning

Working positioning:

> AI tag governance for Obsidian vaults. Keep your tags coherent as your knowledge base grows.

Alternative positioning:

> A tag curator for Obsidian: recommend tags, find duplicates, clean drift, and safely refactor your vault taxonomy.

Avoid positioning:

- "AI tag generator for Obsidian"
- "Automatically tag your notes with AI"
- "Generate tags from note content"

Those descriptions are too close to existing competitors and make the product feel interchangeable.

## Product Thesis

Obsidian users who rely on tags eventually face taxonomy drift:

- duplicated tags with the same meaning;
- tags that are too broad to be useful;
- tags that are too specific and only used once;
- inconsistent casing, language, pluralization, and hierarchy;
- old notes missing newer tag conventions;
- fear of batch edits because Markdown files are personal and important.

The product can win by making tag changes trustworthy, inspectable, and reversible.

## Current Capabilities and Next Stage

Version `0.1.2` has completed the two core loops for current-note recommendations and vault-level tag health. Safe folder-level batch preview is not implemented yet and is the next product priority.

### 1. Suggest Tags for Current Note

Goal: improve the current note while respecting the existing vault taxonomy.

Status: shipped. It prefers existing tags, constrains new-tag suggestions through settings, explains structured recommendations, requires confirmation before writing frontmatter, and can undo the latest operation.

Expected behavior:

- read current note content;
- read existing vault tags and representative notes for those tags;
- recommend existing tags first;
- propose new tags only when no existing tag is a good match;
- explain why each tag was selected;
- explain why similar tags were not selected;
- show confidence and allow one-click apply.

Key differentiation:

- The model should behave like a curator, not a generator.
- Existing tags should be treated as a taxonomy with history and meaning, not as a flat string list.

### 2. Analyze Tag System

Goal: give the user a vault-level diagnosis.

Status: shipped. It provides rule evidence, AI action guidance, a cleanup review plan, and constrained merge/rename actions with file previews, operation logging, and conflict-safe undo.

Expected output:

- duplicate or near-duplicate tags;
- orphan or single-use tags;
- over-broad tags;
- overly specific tags;
- inconsistent naming patterns;
- hierarchy suggestions;
- candidate tags that should be merged, renamed, or deprecated.

Key differentiation:

- This is a governance feature, not a note-tagging feature.
- It creates an ongoing reason to use the plugin after initial installation.

### 3. Batch Tag Folder With Preview

Goal: safely backfill and clean tags across a folder or vault subset.

Status: not implemented. This is the current priority for roadmap version `0.3`.

Expected behavior:

- process a selected folder;
- generate a preview/diff before touching files;
- group changes by risk level;
- allow per-note and per-tag approval;
- write changes only after confirmation;
- support undo through a local change log.

Key differentiation:

- Safety and reversibility should be first-class.
- Users should feel comfortable running the tool on personal archives.

## Design Principles

- Prefer existing tags over new tags.
- Never silently mutate many files.
- Show diffs before writes.
- Explain recommendations in human language.
- Support local-first AI providers where possible.
- Treat tags as a living taxonomy, not disposable metadata.
- Make undo and recovery visible.

## Technical Status and Next Directions

Implemented:

- scan Markdown files for inline tags and frontmatter tags;
- build a tag index with usage count, file paths, and representative snippets;
- connect providers such as DeepSeek and OpenAI through an OpenAI-compatible API abstraction;
- store deterministic cleanup operations as a reviewable plan with file-level previews;
- write frontmatter changes through a YAML-aware parser instead of string replacement;
- keep a reversible operation log and block undo from overwriting files that changed afterward.

Established product and technical boundaries:

- inline tags participate in indexing, while automatic writes remain limited to frontmatter tags;
- the current version does not use embeddings and combines local rules, the tag index, and structured LLM output;
- tag audits are manually triggered, and AI health analysis is cached by tag-index timestamp;
- AI may add explanations, priority hints, and candidate targets but cannot raise local action capability;
- low-frequency observation, broad-tag splitting, and deprecate/remove actions remain read-only or require manual judgment.

Still to advance:

- safe folder-level batch preview, per-note/per-tag approval, and batch undo;
- a complete operation history with per-operation inspection and undo;
- incremental indexing, stale-index state, refresh progress, and large-vault safeguards;
- explicit Ollama/local endpoint support, common provider presets, connection testing, and privacy guidance.

## Success Criteria

The MVP is worth continuing if users say:

- it recommends tags that fit their existing system;
- it avoids creating noisy new tags;
- it finds real inconsistencies in their vault;
- they trust the preview before applying batch edits;
- they would run it repeatedly as their vault grows.

The MVP is not differentiated enough if users describe it mainly as:

- "like AI Tagger Universe";
- "an AI tag generator";
- "a prompt wrapper around OpenAI";
- "something I only need once."

## Current Product Decision

Continue positioning the product as AI tag governance, not generic AI tag generation.

Version `0.1.2` has delivered:

1. vault tag index;
2. current-note suggestions that strongly prefer existing tags;
3. explainable recommendations;
4. safe preview before writes;
5. vault-level tag health reports;
6. layered AI action guidance and rule evidence;
7. file preview, manual apply, and undo for deterministic merge/rename actions.

The next stage should focus only on safe folder-level batch preview. Full operation history, incremental indexing, and local/multi-provider experience remain sequenced behind it in the roadmap.
