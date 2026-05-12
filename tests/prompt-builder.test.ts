// Verifies recommendation prompts ask the AI to answer in the active UI language.
import { describe, expect, it } from "vitest";
import { buildRecommendationMessages } from "../src/ai/PromptBuilder";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";
import type { TagIndex } from "../src/index/TagIndex";

const emptyIndex: TagIndex = {
  updatedAt: "2026-05-12T00:00:00.000Z",
  tags: {}
};

describe("buildRecommendationMessages", () => {
  it("asks for Simplified Chinese reasons when UI language is zh-CN", () => {
    const messages = buildRecommendationMessages(
      { path: "note.md", content: "经济数据", frontmatterTags: [] },
      emptyIndex,
      DEFAULT_SETTINGS,
      "zh-CN"
    );

    expect(messages.map((message) => message.content).join("\n")).toContain("Simplified Chinese");
  });

  it("limits prompt context to current note 10000 chars, top 100 tags, and 3 examples per tag", () => {
    const longContent = "a".repeat(10050);
    const index: TagIndex = {
      updatedAt: "2026-05-12T00:00:00.000Z",
      tags: Object.fromEntries(
        Array.from({ length: 101 }, (_, index) => [
          `tag-${index}`,
          {
            tag: `tag-${index}`,
            normalized: `tag-${index}`,
            count: 101 - index,
            files: [],
            examples: [
              { path: "a.md", snippet: "one" },
              { path: "b.md", snippet: "two" },
              { path: "c.md", snippet: "three" },
              { path: "d.md", snippet: "four" }
            ],
            namingSignals: { hasHierarchy: false, depth: 1 }
          }
        ])
      )
    };

    const userPayload = JSON.parse(
      buildRecommendationMessages(
        { path: "note.md", content: longContent, frontmatterTags: [] },
        index,
        DEFAULT_SETTINGS,
        "en"
      )[1].content
    );

    expect(userPayload.note.content).toHaveLength(10012);
    expect(userPayload.note.content).toContain("[truncated]");
    expect(userPayload.vaultTags).toHaveLength(100);
    expect(userPayload.vaultTags[0].examples).toHaveLength(3);
  });
});
