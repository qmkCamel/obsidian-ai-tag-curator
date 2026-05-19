# Obsidian AI Tag Curator

[简体中文](README.zh-CN.md) | English

AI tag management and governance for Obsidian vaults.

AI Tag Curator is not a generic "generate tags for this note" plugin. It helps you keep an existing Obsidian tag taxonomy coherent by reusing known tags, explaining recommendations, and surfacing vault-level tag problems before any risky cleanup work.


## Current MVP Capabilities

**Vault tag index**
![标签索引摘要](docs/images/tag-index-summary.png)
- Build a tag index from Obsidian metadata, frontmatter tags, and optional inline tags.
- Show a tag index summary with tag counts, usage counts, file counts, and top tags.
- Reuse the cached index for recommendations and health reports instead of scanning the whole vault every time.

**Current note recommendations**
![当前笔记标签推荐](docs/images/tag-recommendations.png)
- Suggest tags for the current Markdown note.
- Prefer existing vault tags, even when new tags are allowed.
- Filter out tags already present on the current note.
- Explain each recommendation with confidence and close alternatives not selected.
- Apply selected recommendations only after user confirmation.
- Undo the latest tag change made by this plugin for the current note.
- Run slow AI requests in the background and show results when ready.

**Vault-level tag health report**
![标签健康报告](docs/images/tag-health-report.png)
![AI 增强健康分析](docs/images/ai-health-analysis.png)
- Generate a read-only tag health report for the current vault.
- Group health issues such as low-frequency tags, near duplicates, hierarchy inconsistencies, over-broad tags, over-narrow tags, and naming drift.
- Show evidence, impact, and suggested action for each issue group.
- Click health report tags to copy and search them in Obsidian.
- Enhance the report with AI-generated summary and prioritized action items.


**Settings**
![设置](docs/images/settings.png)
- Support OpenAI-compatible providers such as DeepSeek and OpenAI.
- Show dev-mode timing for tag recommendations and AI-enhanced health analysis.
- Support Chinese, English, and `Auto` language mode following Obsidian.

## Provider Configuration

Open the plugin settings and configure:

- `API base URL`
- `API key`
- `Model`

Example OpenAI-compatible settings:

| Provider | API base URL | Model example |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |

The API key is stored locally in Obsidian plugin data.

## Local Installation

1. Install dependencies:

```bash
npm install
```

2. Build the plugin:

```bash
npm run build
```

3. Create a plugin directory in your target Obsidian vault:

```bash
mkdir -p /path/to/your-vault/.obsidian/plugins/ai-tag-curator
```

4. Copy the generated files:

```bash
cp main.js manifest.json styles.css /path/to/your-vault/.obsidian/plugins/ai-tag-curator/
```

5. Open Obsidian, go to `Settings -> Community plugins`, and enable `AI Tag Curator`.

Generated plugin files:

- `main.js`
- `manifest.json`
- `styles.css`

For local development, you can install directly into an Obsidian vault:

```bash
npm run local:install
```

To install a side-by-side development copy without replacing the Marketplace plugin:

```bash
npm run local:install-dev
```

By default these commands target `/Users/edge/personal/edge-notes`. Override it with `OBSIDIAN_VAULT_PATH=/path/to/vault`.

## Usage

1. Configure an OpenAI-compatible API base URL, API key, and model.
2. Run `Refresh vault tag index`.
3. Open a Markdown note.
4. Run `Suggest tags for current note`.
5. Review the recommendation modal and apply only the tags you want.
6. Run `Analyze tag health` to inspect vault-level tag problems.
7. Optionally run `AI-enhanced analysis` inside the health report.
8. Run `Undo last tag curator change` if you need to revert the latest tag write for the current note.

## Commands

The plugin UI defaults to `Auto`, which follows the current Obsidian language. In English, the commands are:

- `Refresh vault tag index`
- `Show tag index summary`
- `Analyze tag health`
- `Suggest tags for current note`
- `Undo last tag curator change`

## Development

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

## Current Limitations

- The MVP only writes to the current note's frontmatter `tags`.
- Inline tags are read for indexing but are not automatically rewritten.
- Tag health reports are read-only diagnostics.
- AI-enhanced health analysis only returns a summary and prioritized action items.
- Cleanup plans, batch previews, batch writes, and batch undo are not implemented yet.
- AI responses must be valid structured JSON. If parsing fails, no file is modified.

## Documentation

- [Changelog](CHANGELOG.md)
- [License](LICENSE)
- [Chinese release checklist](docs/release-checklist.zh-CN.md)
- [English product handoff](docs/product-handoff.md)
- [Chinese product explanation](docs/product-handoff.zh-CN.md)
- [Chinese technical design](docs/technical-design.zh-CN.md)
- [Chinese roadmap](docs/roadmap.zh-CN.md)
