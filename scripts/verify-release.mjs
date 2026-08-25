import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const manifest = readJson("manifest.json");
const versions = readJson("versions.json");
const changelog = readText("CHANGELOG.md");
const failures = [];

assertEqual("package-lock.json version", packageLock.version, packageJson.version);
assertEqual(
  "package-lock.json root package version",
  packageLock.packages?.[""]?.version,
  packageJson.version
);
assertEqual("manifest.json version", manifest.version, packageJson.version);
assertEqual(
  `versions.json mapping for ${packageJson.version}`,
  versions[packageJson.version],
  manifest.minAppVersion
);

const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
if (!new RegExp(`^## ${escapedVersion}(?:\\s|$)`, "m").test(changelog)) {
  failures.push(`CHANGELOG.md has no release heading for ${packageJson.version}`);
}

const assets = ["main.js", "manifest.json", "styles.css"].map((name) => {
  const path = join(rootDirectory, name);
  if (!existsSync(path)) {
    failures.push(`Missing release asset: ${name}`);
    return undefined;
  }

  const size = statSync(path).size;
  if (size === 0) {
    failures.push(`Release asset is empty: ${name}`);
  }

  return {
    name,
    size,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex")
  };
});

if (failures.length > 0) {
  console.error("Release verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Release metadata verified: ${packageJson.version}`);
  console.log(`Minimum Obsidian version: ${manifest.minAppVersion}`);
  console.log("Release assets:");
  for (const asset of assets) {
    console.log(`- ${asset.name}: ${asset.size} bytes, sha256 ${asset.sha256}`);
  }
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
  }
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(join(rootDirectory, relativePath), "utf8");
}
