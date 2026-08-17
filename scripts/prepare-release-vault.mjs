import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const vaultPath = resolve(
  process.env.OBSIDIAN_RELEASE_VAULT_PATH ?? "/Users/edge/work/obsidian-ai-tag-curator-test-vault"
);
const themeSourceVault = resolve(
  process.env.OBSIDIAN_THEME_SOURCE_VAULT ?? "/Users/edge/personal/edge-notes"
);
const obsidianDir = join(vaultPath, ".obsidian");
const sourceObsidianDir = join(themeSourceVault, ".obsidian");

const appearance = readJson(join(sourceObsidianDir, "appearance.json"));
const themeName = appearance.cssTheme;
if (!themeName) {
  throw new Error(`No cssTheme is configured in ${join(sourceObsidianDir, "appearance.json")}`);
}

const sourceThemeDir = join(sourceObsidianDir, "themes", themeName);
if (!existsSync(sourceThemeDir)) {
  throw new Error(`Theme directory does not exist: ${sourceThemeDir}`);
}

mkdirSync(obsidianDir, { recursive: true });
resetFixtureNotes();
syncAppearance(themeName, appearance);
writeJson(join(obsidianDir, "app.json"), {});
writeJson(join(obsidianDir, "community-plugins.json"), ["ai-tag-curator-dev"]);
writeJson(join(obsidianDir, "core-plugins.json"), buildCorePluginConfig());

process.env.OBSIDIAN_VAULT_PATH = vaultPath;
if (!process.argv.includes("--dev")) process.argv.push("--dev");
await import("./install-local.mjs");

writeJson(join(obsidianDir, "plugins", "ai-tag-curator-dev", "data.json"), {
  settings: {
    uiLanguage: "zh-CN",
    apiBaseUrl: "http://127.0.0.1:18765/v1",
    apiKey: "local-e2e-only",
    model: "deterministic-local-mock",
    maxRecommendations: 5,
    maxFolderBatchFiles: 50,
    allowNewTags: true,
    newTagStrictness: "balanced",
    readInlineTags: true,
    refreshIndexOnLoad: false,
    devMode: true,
    operationLogLimit: 20
  },
  operations: []
});

console.log(`Prepared release vault: ${vaultPath}`);
console.log(`Synced theme: ${themeName} from ${themeSourceVault}`);
console.log("The vault contains synthetic notes only and has Obsidian Sync disabled.");

function resetFixtureNotes() {
  rmSync(join(vaultPath, "Release Test"), { recursive: true, force: true });
  rmSync(join(vaultPath, "Outside scope.md"), { force: true });

  writeText(
    join(vaultPath, "Release Test", "Current note.md"),
    `---
tags:
  - project/ai
---

# Release validation

This note exercises folder batch review with #workflow and #release-check tags.
`
  );
  writeText(
    join(vaultPath, "Release Test", "Existing taxonomy.md"),
    `---
tags:
  - release-ready
---

# Existing taxonomy

Reference note for deterministic provider recommendations.
`
  );
  writeText(
    join(vaultPath, "Release Test", "Nested", "Long path acceptance note for narrow layout.md"),
    `---
tags:
  - research
---

# Nested acceptance note

The nested note contributes #batch-check and validates long path wrapping.
`
  );
  writeText(
    join(vaultPath, "Outside scope.md"),
    `---
tags:
  - outside
---

This note must remain outside the default folder scope.
`
  );
}

function syncAppearance(activeTheme, sourceAppearance) {
  writeJson(join(obsidianDir, "appearance.json"), sourceAppearance);
  const targetThemeDir = join(obsidianDir, "themes", activeTheme);
  rmSync(targetThemeDir, { recursive: true, force: true });
  mkdirSync(dirname(targetThemeDir), { recursive: true });
  cpSync(sourceThemeDir, targetThemeDir, { recursive: true });
}

function buildCorePluginConfig() {
  const sourceConfigPath = join(sourceObsidianDir, "core-plugins.json");
  const sourceConfig = existsSync(sourceConfigPath) ? readJson(sourceConfigPath) : {};
  return {
    ...sourceConfig,
    sync: false,
    publish: false
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}
