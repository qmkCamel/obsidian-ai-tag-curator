import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const isDevInstall = process.argv.includes("--dev");
const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
if (!vaultPath) {
  throw new Error("Set OBSIDIAN_VAULT_PATH to the target Obsidian vault before installing.");
}
const pluginId = isDevInstall ? "ai-tag-curator-dev" : "ai-tag-curator";
const pluginName = isDevInstall ? "AI Tag Curator Dev" : "AI Tag Curator";
const targetDir = join(vaultPath, ".obsidian", "plugins", pluginId);
const requiredAssets = ["main.js", "manifest.json", "styles.css"];

for (const asset of requiredAssets) {
  const sourcePath = join(projectRoot, asset);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing ${asset}. Run npm run build before installing.`);
  }
}

mkdirSync(targetDir, { recursive: true });

copyFileSync(join(projectRoot, "main.js"), join(targetDir, "main.js"));
copyFileSync(join(projectRoot, "styles.css"), join(targetDir, "styles.css"));

const manifest = JSON.parse(readFileSync(join(projectRoot, "manifest.json"), "utf8"));
manifest.id = pluginId;
manifest.name = pluginName;
writeFileSync(join(targetDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (isDevInstall) {
  writeFileSync(join(targetDir, ".hotreload"), "");
}

console.log(`Installed ${pluginName} to ${targetDir}`);
