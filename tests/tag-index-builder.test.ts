// Verifies the vault tag index combines frontmatter and inline tag evidence.
import { describe, expect, it } from "vitest";
import { buildTagIndex } from "../src/index/TagIndexBuilder";

describe("buildTagIndex", () => {
  it("combines frontmatter and inline tag usage with representative examples", () => {
    const index = buildTagIndex([
      {
        path: "notes/ai.md",
        content: "This note is about semantic search and #project/ai workflows.",
        frontmatterTags: ["project/ai", "research"],
        inlineTags: ["project/ai"],
        allTags: ["project/ai", "research"],
        sourceContentHash: "a".repeat(64)
      },
      {
        path: "notes/search.md",
        content: "Search quality notes mention #Research and retrieval.",
        frontmatterTags: [],
        inlineTags: ["research"],
        allTags: ["research"],
        sourceContentHash: "b".repeat(64)
      }
    ]);

    expect(index.tags["project/ai"].count).toBe(2);
    expect(index.tags["project/ai"].files.map((file) => file.path)).toEqual(["notes/ai.md"]);
    expect(index.tags.research.count).toBe(2);
    expect(index.tags.research.files.map((file) => file.path)).toEqual(["notes/ai.md", "notes/search.md"]);
    expect(index.tags.research.examples[0].snippet.length).toBeGreaterThan(0);
  });

  it("uses the explicit source-aware inline inventory when available", () => {
    const index = buildTagIndex([
      {
        path: "notes/ai.md",
        content: "This body has #inline-only but Obsidian metadata already resolved tags.",
        frontmatterTags: [],
        inlineTags: ["AI生成", "数据结构/单调队列"],
        allTags: ["AI生成", "数据结构/单调队列"],
        sourceContentHash: "c".repeat(64)
      }
    ]);

    expect(Object.keys(index.tags)).toEqual(["ai生成", "数据结构/单调队列"]);
    expect(index.tags["ai生成"].files[0].sources).toEqual(["inline"]);
    expect(index.tags["inline-only"]).toBeUndefined();
  });
});
