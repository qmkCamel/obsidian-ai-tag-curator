# Obsidian AI Tag Curator

[简体中文](README.zh-CN.md) | English

**Keep your Obsidian tags consistent. Browse, rename, and merge locally; use AI when you want suggestions.**

Find the notes behind a tag, bring duplicate names together, and review each change before it reaches your Markdown files. Local management works without an API key. Optional AI helps you reuse existing tags and decide what to tidy up next.

[Install](#installation) · [Quick start](#quick-start) · [User guide](docs/guide.md) · [Releases](https://github.com/qmkCamel/obsidian-ai-tag-curator/releases) · [Report an issue](https://github.com/qmkCamel/obsidian-ai-tag-curator/issues)

![Tag manager showing searchable tags, source filters, related file counts, and operation history](docs/verification/assets/release-050-2026-10-09/current/host-refreshed.png)

*The 0.5.0 workbench in Obsidian 1.14.4, using a synthetic test vault.*

## What you can do

| Task | What you get | AI required? |
| --- | --- | --- |
| Browse and organize tags | Search, source/folder filters, related notes, and reviewed rename or merge | No |
| Check tag health | Rule-based evidence for duplicates, inconsistent naming, and other tag issues | No; AI explanations and prioritization are optional |
| Tag the current note | Suggestions that favor existing tags, with reasons, confidence, and selectable results | Yes for recommendations |
| Tag a folder | A scoped batch of suggestions with per-note review and a final confirmation | Yes for recommendations |
| Review and undo changes | Shared operation history and recovery for unfinished operations | No |

The interface supports English, Simplified Chinese, and automatic language selection from Obsidian.

For example, merge `#project-ideas` and `#project_ideas` into one chosen tag, review the affected notes and tag occurrences, then apply. Unselected occurrences stay unchanged. Renaming `#project` does not rename `#project/active`.

## Installation

Requires **Obsidian 1.8.7 or later**. The 0.5.0 release was tested on macOS with Obsidian 1.8.7 and 1.14.4; Windows, Linux, and mobile devices remain unverified. See the [release acceptance report](docs/verification/0.5.0-release-acceptance.zh-CN.md) (Chinese).

1. Open the [latest release](https://github.com/qmkCamel/obsidian-ai-tag-curator/releases/latest).
2. Download **`main.js`**, **`manifest.json`**, and **`styles.css`** from the same release's **Assets**.
3. Create `.obsidian/plugins/ai-tag-curator/` inside your vault and place all three files there.
4. Reload Obsidian, then enable **AI Tag Curator** under **Settings → Community plugins**.

No Node.js or build tools are needed for this installation. For a source build or a separate development copy, see [building from source](docs/guide.md#building-from-source).

Upgrading an existing installation? Back up your vault and plugin data and finish any unfinished operations first. Read the [0.5.0 upgrade notes](docs/guide.md#upgrading-to-050), especially the changes to undo order and older operation records.

## Quick start

Start with local management; provider setup is optional.

1. Open the command palette and run **Tag manager**, or click the tags icon in the ribbon.
2. Refresh the index if it is missing or outdated. Search for a tag and inspect its related notes.
3. Choose a rename or merge, review the files and selected property/body occurrences, and confirm the changes.
4. Open **History** to inspect the result or undo the latest eligible operation.

Back up your vault before bulk edits. Browsing filters help you find tags; **Scope and protection** controls global folder exclusions and protected tags. The review determines which occurrences are actually changed.

To inspect the vault without editing it, run **Analyze tag health**. You can read the rule evidence without configuring AI.

## Optional AI

Configure a provider in **Settings → AI Tag Curator → AI service connection**, choose a model available to you, and click **Test connection**.

| Provider preset | Connection | API key |
| --- | --- | --- |
| OpenAI / DeepSeek | Remote OpenAI-compatible service | Required |
| Ollama / LM Studio / LiteRT-LM CLI | Your running local OpenAI-compatible server | Optional |
| Custom | Your chosen compatible endpoint | Depends on provider type |

Then open a Markdown note and run **Suggest tags for current note**. Review the reasons and selected tags before applying. For multiple notes, use **Generate tag suggestions for folder** and confirm the scope first.

The folder limit defaults to 50 Markdown files and can be configured from 1 to 200. Oversized batches are blocked rather than silently shortened. Manual rename/merge review is also limited to 200 candidate files.

AI results in the health report explain the diagnosis, suggested target, priority, and risks. Local rules determine whether an action is executable; generating an analysis does not apply it.

See [provider setup, local model examples, and troubleshooting](docs/guide.md#provider-configuration) for endpoint configuration, JSON compatibility, and slow-request handling. The plugin connects to models you provide; it does not download or start them.

## Data and change boundaries

- **Local workflows:** tag indexing, browsing, manual management, and rule-based health analysis do not require AI requests.
- **AI requests:** recommendations send bounded note content, its path and tags, and selected tag-index examples to the configured endpoint. Health analysis sends report data, tag statistics, and selected file paths/snippets. Folder requests do this per note.
- **Endpoint choice:** there is no automatic cloud fallback. A server on another machine receives the submitted content even if its provider type is set to local.
- **Credentials:** the API key is stored in Obsidian plugin data; it is excluded from batch snapshots and operation logs.
- **Reviewed writes:** current-note and folder suggestions only update the note's `tags` property (YAML frontmatter). Manual and health-report rename/merge can also change individually reviewed body `#tag` occurrences when their locations are verified.
- **Undo and recovery:** only the globally latest eligible active operation can be undone, across notes, batches, and cleanup. Unfinished recovery blocks new writes; some older cleanup records are read-only.
- **Limits:** no tag deletion, splitting, case-only renaming, automatic child-tag renaming, or out-of-order undo. YAML quoting and formatting can change. Cancelling an AI request cannot revoke work already sent to a provider, which may still be billed.

Read the [full limitations](docs/guide.md#current-limitations) before large changes or a downgrade.

## Documentation

| Looking for | Start here |
| --- | --- |
| Detailed workflows, screenshots, and commands | [User guide](docs/guide.md) |
| Provider configuration and troubleshooting | [AI setup](docs/guide.md#provider-configuration) |
| Upgrade and downgrade considerations | [0.5.0 upgrade notes](docs/guide.md#upgrading-to-050) |
| Version history | [Bilingual changelog](CHANGELOG.md) |
| Tested platforms and release evidence | [0.5.0 acceptance](docs/verification/0.5.0-release-acceptance.zh-CN.md) (Chinese) |
| Product direction | [Roadmap](docs/roadmap.zh-CN.md) (Chinese) |
| Architecture and development conventions | [Technical design](docs/technical-design.zh-CN.md) (Chinese) · [Project context](openspec/project.md) |

## Feedback and contributions

Report bugs and propose improvements through [GitHub Issues](https://github.com/qmkCamel/obsidian-ai-tag-curator/issues). Include the plugin version, Obsidian version, operating system, steps to reproduce, and expected versus actual behavior. For AI issues, include the provider type and model, and remove API keys and private note content from logs or screenshots.

Documentation fixes, translations, and bug fixes are welcome. For new product features, start with an issue and an OpenSpec proposal; see [the project conventions](openspec/project.md). Commit messages follow the [bilingual format](AGENTS.md).

To develop locally, use the Node.js version in [mise.toml](mise.toml), then:

```bash
git clone https://github.com/qmkCamel/obsidian-ai-tag-curator.git
cd obsidian-ai-tag-curator
npm ci
npm test
npm run build
```

To try a separate development copy in a test vault:

```bash
OBSIDIAN_VAULT_PATH=/path/to/test-vault npm run local:install-dev
```

See the guide for [development and OpenSpec commands](docs/guide.md#development) and [synthetic release-vault setup](docs/guide.md#release-screenshot-vault).

## License

[MIT](LICENSE), maintained by [qmkCamel](https://github.com/qmkCamel).
