import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const configuredVaultPath = process.env.OBSIDIAN_RELEASE_VAULT_PATH?.trim();
if (!configuredVaultPath) {
  throw new Error(
    "OBSIDIAN_RELEASE_VAULT_PATH is required because this command resets the synthetic release fixtures."
  );
}

const vaultPath = resolve(configuredVaultPath);
const configuredThemeSourceVault = process.env.OBSIDIAN_THEME_SOURCE_VAULT?.trim();
const themeSourceVault = configuredThemeSourceVault
  ? resolve(configuredThemeSourceVault)
  : undefined;
const obsidianDir = join(vaultPath, ".obsidian");
const sourceObsidianDir = themeSourceVault
  ? join(themeSourceVault, ".obsidian")
  : undefined;
const theme = sourceObsidianDir ? loadTheme(sourceObsidianDir) : undefined;

mkdirSync(obsidianDir, { recursive: true });
resetFixtureNotes();
if (theme) {
  syncAppearance(theme.name, theme.appearance, theme.sourceDirectory);
} else {
  writeJson(join(obsidianDir, "appearance.json"), {});
}
writeJson(join(obsidianDir, "app.json"), {});
writeJson(join(obsidianDir, "community-plugins.json"), ["ai-tag-curator-dev"]);
writeJson(join(obsidianDir, "core-plugins.json"), buildCorePluginConfig(sourceObsidianDir));

process.env.OBSIDIAN_VAULT_PATH = vaultPath;
if (!process.argv.includes("--dev")) process.argv.push("--dev");
await import("./install-local.mjs");

writeJson(join(obsidianDir, "plugins", "ai-tag-curator-dev", "data.json"), {
  settings: {
    uiLanguage: "zh-CN",
    providerType: "local-openai-compatible",
    providerPreset: "custom",
    apiBaseUrl: "http://127.0.0.1:18765/v1",
    apiKey: "",
    model: "deterministic-local-mock",
    supportsJsonMode: true,
    providerConcurrency: 1,
    promptProfile: "edge-small",
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
console.log(
  theme
    ? `Synced theme: ${theme.name} from ${themeSourceVault}`
    : "Using the default Obsidian appearance (no theme source configured)."
);
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

function loadTheme(sourceDirectory) {
  const appearancePath = join(sourceDirectory, "appearance.json");
  if (!existsSync(appearancePath)) {
    throw new Error(`Appearance configuration does not exist: ${appearancePath}`);
  }

  const appearance = readJson(appearancePath);
  const name = appearance.cssTheme;
  if (!name) {
    throw new Error(`No cssTheme is configured in ${appearancePath}`);
  }

  const sourceDirectoryPath = join(sourceDirectory, "themes", name);
  if (!existsSync(sourceDirectoryPath)) {
    throw new Error(`Theme directory does not exist: ${sourceDirectoryPath}`);
  }

  return { name, appearance, sourceDirectory: sourceDirectoryPath };
}

function syncAppearance(activeTheme, sourceAppearance, sourceThemeDirectory) {
  writeJson(join(obsidianDir, "appearance.json"), sourceAppearance);
  const targetThemeDir = join(obsidianDir, "themes", activeTheme);
  rmSync(targetThemeDir, { recursive: true, force: true });
  mkdirSync(dirname(targetThemeDir), { recursive: true });
  cpSync(sourceThemeDirectory, targetThemeDir, { recursive: true });
}

function buildCorePluginConfig(sourceDirectory) {
  const sourceConfigPath = sourceDirectory
    ? join(sourceDirectory, "core-plugins.json")
    : undefined;
  const sourceConfig = sourceConfigPath && existsSync(sourceConfigPath)
    ? readJson(sourceConfigPath)
    : {};
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
