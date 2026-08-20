import { describe, expect, it } from "vitest";
import { buildTagHealthAiMessages } from "../src/health/TagHealthAiPromptBuilder";
import { analyzeTagHealth } from "../src/health/TagHealthAnalyzer";
import type { TagHealthReport } from "../src/health/TagHealthReport";
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

  it("narrows risk groups, top tags, examples, and snippets for edge-small", () => {
    const index: TagIndex = {
      updatedAt: "2026-05-12T00:00:00.000Z",
      tags: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`tag-${index}`, usage(`tag-${index}`, 80 - index, 3, "x".repeat(300))]))
    };
    const report = syntheticReport(15);
    const payload = JSON.parse(
      buildTagHealthAiMessages(report, index, {
        allowNewTags: false,
        newTagStrictness: "strict",
        uiLanguage: "en",
        promptProfile: "edge-small"
      })[1].content
    );

    expect(payload.healthReport.riskGroups).toHaveLength(12);
    expect(payload.topTags).toHaveLength(50);
    expect(payload.tagDetails["tag-0"].files).toHaveLength(1);
    expect(payload.tagDetails["tag-0"].examples).toHaveLength(1);
    expect(payload.tagDetails["tag-0"].examples[0].snippet.length).toBeLessThan(200);
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

function syntheticReport(count: number): TagHealthReport {
  return {
    generatedAt: "2026-05-12T00:00:00.000Z",
    indexUpdatedAt: "2026-05-12T00:00:00.000Z",
    summary: {
      updatedAt: "2026-05-12T00:00:00.000Z",
      totalTags: count,
      totalUsages: count,
      totalFiles: count,
      hierarchicalTags: 0,
      topTags: [],
      riskItemCount: count
    },
    sections: {
      lowFrequency: {
        type: "lowFrequency",
        items: Array.from({ length: count }, (_, index) => ({
          type: "lowFrequency",
          title: `tag-${index}`,
          tags: [`tag-${index}`],
          evidence: "single use",
          impact: "low reuse",
          suggestion: "observe"
        }))
      },
      nearDuplicates: { type: "nearDuplicates", items: [] },
      hierarchyInconsistency: { type: "hierarchyInconsistency", items: [] },
      overBroad: { type: "overBroad", items: [] },
      overNarrow: { type: "overNarrow", items: [] },
      namingDrift: { type: "namingDrift", items: [] }
    }
  };
}
