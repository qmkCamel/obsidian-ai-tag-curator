# Obsidian AI Tag Curator

[简体中文](README.zh-CN.md) | English

AI tag governance and curation for Obsidian vaults.

This plugin is not a generic AI tag generator. It is designed as a curator that helps users maintain a coherent vault taxonomy. It prioritizes understanding and reusing existing vault tags instead of creating noisy new ones.

The first implementation focuses on:

- scanning existing vault tags;
- recommending tags for the current note;
- strongly preferring existing tags over new tags;
- explaining why each tag is recommended;
- previewing changes before writing to frontmatter;
- recording the latest operation so it can be undone.

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Build the Obsidian plugin bundle:

```bash
npm run build
```

Generated plugin files:

- `main.js`
- `manifest.json`
- `styles.css`

## Local Installation In Obsidian

1. Run `npm run build` to generate the plugin files.
2. Create a plugin directory in your target Obsidian vault:

```bash
mkdir -p /path/to/your-vault/.obsidian/plugins/ai-tag-curator
```

3. Copy the generated files into that directory:

```bash
cp main.js manifest.json styles.css /path/to/your-vault/.obsidian/plugins/ai-tag-curator/
```

4. Open Obsidian and go to `Settings -> Community plugins`.
5. Disable safe mode if needed, then enable `AI Tag Curator` from the installed plugins list.

## Usage Flow

1. Configure an OpenAI-compatible API base URL, API key, and model in the plugin settings.
2. Run `Refresh vault tag index` to scan the current vault taxonomy.
3. Open a Markdown note.
4. Run `Suggest tags for current note`.
5. Review recommended tags, confidence levels, and explanations in the preview modal.
6. Keep only the tags you want to apply, then confirm the write.
7. To undo the latest tag change made by this plugin for the current note, run `Undo last tag curator change`.

## Plugin Commands

The plugin UI defaults to `Auto`, which follows the current Obsidian language. In English, the commands are:

- `Refresh vault tag index`
- `Show tag index summary`
- `Suggest tags for current note`
- `Undo last tag curator change`

## Current Limitations

- The first version only writes to the current note's frontmatter `tags`.
- Inline tags are read for indexing, but are not automatically rewritten.
- Folder-level batch tagging, tag health reports, and richer undo history are not implemented yet.
- AI responses must be structured JSON. If parsing fails, no file is modified.

## Documentation

- [English product handoff](docs/product-handoff.md)
- [Chinese product explanation](docs/product-handoff.zh-CN.md)
- [Chinese technical design](docs/technical-design.zh-CN.md)
