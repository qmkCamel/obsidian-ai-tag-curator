// Verifies tag-index summaries show useful refresh results to users.
import { describe, expect, it } from "vitest";
import { summarizeTagIndex } from "../src/index/TagIndexSummary";
import type { TagIndex } from "../src/index/TagIndex";

describe("summarizeTagIndex", () => {
  it("counts tags, usages, unique files, and top tags", () => {
    const index: TagIndex = {
      updatedAt: "2026-05-11T12:00:00.000Z",
      tags: {
        ai: {
          tag: "ai",
          normalized: "ai",
          count: 3,
          files: [
            { path: "a.md", count: 2, sources: ["frontmatter"] },
            { path: "b.md", count: 1, sources: ["inline"] }
          ],
          examples: [],
          namingSignals: { hasHierarchy: false, depth: 1 }
        },
        "project/ai": {
          tag: "project/ai",
          normalized: "project/ai",
          count: 2,
          files: [{ path: "a.md", count: 2, sources: ["frontmatter", "inline"] }],
          examples: [],
          namingSignals: { hasHierarchy: true, depth: 2 }
        }
      }
    };

    expect(summarizeTagIndex(index)).toEqual({
      updatedAt: "2026-05-11T12:00:00.000Z",
      totalTags: 2,
      totalUsages: 5,
      totalFiles: 2,
      hierarchicalTags: 1,
      topTags: [
        { tag: "ai", count: 3, fileCount: 2 },
        { tag: "project/ai", count: 2, fileCount: 1 }
      ]
    });
  });
});
