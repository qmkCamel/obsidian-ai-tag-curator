# Obsidian AI Tag Curator Product Handoff

Updated: 2026-05-11

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

## MVP Recommendation

Build a narrow MVP around three commands.

### 1. Suggest Tags for Current Note

Goal: improve the current note while respecting the existing vault taxonomy.

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

## Technical Notes To Explore

Potential implementation areas:

- scan Markdown files for inline tags and frontmatter tags;
- build a tag index with usage count, file paths, and representative snippets;
- optionally embed tag contexts for semantic matching;
- use provider abstraction for OpenAI-compatible APIs, Ollama, or local endpoints;
- store pending batch operations as a reviewable plan;
- write frontmatter changes through a YAML-aware parser instead of string replacement;
- keep a reversible operation log.

Open technical decisions:

- whether MVP should support both inline tags and frontmatter tags;
- whether to introduce embeddings in v1 or start with LLM-only reasoning;
- whether to support local LLMs in the first release;
- whether tag audit should run eagerly, manually, or on a cached schedule;
- how to keep performance acceptable on large vaults.

## Suggested First Build Sequence

1. Scaffold a minimal Obsidian plugin.
2. Implement vault tag scanning and a tag usage index.
3. Add current-note tag suggestion using existing tags only.
4. Add optional new-tag suggestions.
5. Add preview/apply flow for the current note.
6. Add tag health report.
7. Add folder-level batch preview.
8. Add reversible operation log and undo.

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

Proceed only if the product is built as AI tag governance, not generic AI tag generation.

The first implementation should prioritize:

1. vault tag index;
2. current-note suggestions that strongly prefer existing tags;
3. explainable recommendations;
4. safe preview before writes.

Batch editing, tag health reports, and merge/rename workflows should follow once the first loop feels trustworthy.
