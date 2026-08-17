import { describe, expect, it } from "vitest";
import { createFakeApp } from "./e2e/obsidian-harness";
import { VaultReader } from "../src/obsidian/VaultReader";

describe("VaultReader", () => {
  it("uses metadata-cache inline positions separately from frontmatter", async () => {
    const app = createFakeApp([
      { path: "notes/a.md", content: "body #Inline", frontmatterTags: ["Frontmatter"] }
    ]);
    const note = await new VaultReader(app as never).readNoteByPath("notes/a.md");
    expect(note.frontmatterTags).toEqual(["frontmatter"]);
    expect(note.inlineTags).toEqual(["inline"]);
    expect(note.allTags).toEqual(["frontmatter", "inline"]);
    expect(note.sourceContentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("falls back to the parser only when cache tags are unavailable and excludes Markdown false positives", async () => {
    const content = [
      "# Heading",
      "body #valid/nested and #中文/主题 and [anchor](https://example.com/page#fragment)",
      "`#inline-code`",
      "```ts",
      "#fenced",
      "```"
    ].join("\n");
    const app = createFakeApp([{ path: "notes/a.md", content, frontmatterTags: [] }]);
    app.metadataCache.getFileCache = () => ({ frontmatter: {} } as never);
    const note = await new VaultReader(app as never).readNoteByPath("notes/a.md");
    expect(note.inlineTags).toEqual(["valid/nested", "中文/主题"]);
  });
});
