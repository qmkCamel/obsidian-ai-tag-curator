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
});
