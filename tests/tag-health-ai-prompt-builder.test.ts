import { describe, expect, it } from "vitest";
import { buildTagHealthAiMessages } from "../src/health/TagHealthAiPromptBuilder";
import { analyzeTagHealth } from "../src/health/TagHealthAnalyzer";
import type { TagIndex, TagUsage } from "../src/index/TagIndex";

describe("buildTagHealthAiMessages", () => {
  it("builds bounded tag-health context without note bodies", () => {
    const index: TagIndex = {
      updatedAt: "2026-05-12T00:00:00.000Z",
      tags: {
        "经济基础": usage("经济基础", 1, 1, "宏观经济数据来源摘要"),
        "政治经济": usage("政治经济", 3, 2, "财政政策与政治经济关系"),
        "long-note": usage("long-note", 1, 1, "x".repeat(500))
      }
    };
    const report = analyzeTagHealth(index);

    const messages = buildTagHealthAiMessages(report, index, {
      allowNewTags: false,
      newTagStrictness: "strict",
      uiLanguage: "zh-CN"
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain("Simplified Chinese");
    const payload = JSON.parse(messages[1].content);
    expect(payload.task).toBe("Enhance a read-only Obsidian tag health report.");
    expect(payload.rules.allowNewTags).toBe(false);
    expect(payload.rules.outputShape.cleanupPlan).toBeUndefined();
    expect(payload.healthReport.riskGroups.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).toContain("宏观经济数据来源摘要");
    expect(JSON.stringify(payload)).not.toContain("x".repeat(500));
    expect(payload.tagDetails["long-note"].examples[0].snippet.endsWith("[truncated]")).toBe(true);
  });
});

function usage(tag: string, count: number, fileCount: number, snippet: string): TagUsage {
  return {
    tag,
    normalized: tag.toLowerCase(),
    count,
    files: Array.from({ length: fileCount }, (_, index) => ({
      path: `notes/${tag}-${index}.md`,
      count: 1,
      sources: ["metadata"]
    })),
    examples: [{ path: `notes/${tag}.md`, snippet }],
    namingSignals: {
      hasHierarchy: tag.includes("/"),
      depth: tag.split("/").length
    }
  };
}
