// Verifies the vault tag index combines frontmatter and inline tag evidence.
import { describe, expect, it } from "vitest";
import { buildTagIndex } from "../src/index/TagIndexBuilder";

describe("buildTagIndex", () => {
  it("combines frontmatter and inline tag usage with representative examples", () => {
    const index = buildTagIndex([
      {
        path: "notes/ai.md",
        content: "This note is about semantic search and #project/ai workflows.",
        frontmatterTags: ["project/ai", "research"]
      },
      {
        path: "notes/search.md",
        content: "Search quality notes mention #Research and retrieval.",
        frontmatterTags: []
      }
    ]);

    expect(index.tags["project/ai"].count).toBe(2);
    expect(index.tags["project/ai"].files.map((file) => file.path)).toEqual(["notes/ai.md"]);
    expect(index.tags.research.count).toBe(2);
    expect(index.tags.research.files.map((file) => file.path)).toEqual(["notes/ai.md", "notes/search.md"]);
    expect(index.tags.research.examples[0].snippet.length).toBeGreaterThan(0);
  });

  it("uses Obsidian metadata tags as the source of truth when available", () => {
    const index = buildTagIndex([
      {
        path: "notes/ai.md",
        content: "This body has #inline-only but Obsidian metadata already resolved tags.",
        frontmatterTags: [],
        metadataTags: ["AI生成", "数据结构/单调队列"]
      }
    ]);

    expect(Object.keys(index.tags)).toEqual(["AI生成", "数据结构/单调队列"]);
    expect(index.tags["AI生成"].files[0].sources).toEqual(["metadata"]);
    expect(index.tags["inline-only"]).toBeUndefined();
  });
});
