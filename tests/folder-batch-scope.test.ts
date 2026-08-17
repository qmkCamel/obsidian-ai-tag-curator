import { describe, expect, it } from "vitest";
import { buildFolderBatchScopeViewModel } from "../src/batch/FolderBatchScope";
import { filterMarkdownPathsByFolder, parentFolderPath } from "../src/obsidian/VaultReader";
import { mergeSettings } from "../src/settings/PluginSettings";

const paths = ["root.md", "notes/a.md", "notes/sub/b.md", "notes-archive/c.md", "notes/image.png", "z.md"];

describe("folder scope", () => {
  it("matches folder path segments, recursion, root, Markdown files, and stable order", () => {
    expect(filterMarkdownPathsByFolder(paths, "notes", false)).toEqual(["notes/a.md"]);
    expect(filterMarkdownPathsByFolder(paths, "notes", true)).toEqual(["notes/a.md", "notes/sub/b.md"]);
    expect(filterMarkdownPathsByFolder(paths, "", false)).toEqual(["root.md", "z.md"]);
    expect(filterMarkdownPathsByFolder(paths, "/", true)).toEqual([
      "notes-archive/c.md",
      "notes/a.md",
      "notes/sub/b.md",
      "root.md",
      "z.md"
    ]);
    expect(parentFolderPath("notes/a.md")).toBe("notes");
    expect(parentFolderPath("root.md")).toBe("");
  });

  it("blocks empty and over-limit scopes without truncating", () => {
    expect(scope([])).toMatchObject({ fileCount: 0, blockReason: "empty", canStart: false });
    expect(scope(["a.md", "b.md"], 1)).toMatchObject({
      filePaths: ["a.md", "b.md"],
      fileCount: 2,
      estimatedRequestCount: 2,
      blockReason: "overLimit",
      canStart: false
    });
    expect(scope(["a.md"], 1)).toMatchObject({ blockReason: null, canStart: true });
    expect(
      buildFolderBatchScopeViewModel({
        folderPath: "",
        includeSubfolders: true,
        filePaths: ["a.md"],
        maxFolderBatchFiles: 50,
        hasApiKey: false
      })
    ).toMatchObject({ blockReason: "missingApiKey", canStart: false });
  });

  it("normalizes legacy and out-of-range batch limits to 1–200", () => {
    expect(mergeSettings({}).maxFolderBatchFiles).toBe(50);
    expect(mergeSettings({ maxFolderBatchFiles: 0 }).maxFolderBatchFiles).toBe(1);
    expect(mergeSettings({ maxFolderBatchFiles: 999 }).maxFolderBatchFiles).toBe(200);
    expect(mergeSettings({ maxFolderBatchFiles: 75.6 }).maxFolderBatchFiles).toBe(76);
  });
});

function scope(filePaths: string[], maxFolderBatchFiles = 50) {
  return buildFolderBatchScopeViewModel({
    folderPath: "notes",
    includeSubfolders: true,
    filePaths,
    maxFolderBatchFiles,
    hasApiKey: true
  });
}
