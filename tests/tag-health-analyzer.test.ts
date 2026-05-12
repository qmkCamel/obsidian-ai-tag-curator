import { describe, expect, it } from "vitest";
import { analyzeTagHealth } from "../src/health/TagHealthAnalyzer";
import type { TagIndex, TagUsage } from "../src/index/TagIndex";

describe("analyzeTagHealth", () => {
  it("reports low-frequency tags, near duplicates, hierarchy issues, broad tags, narrow tags, and naming drift", () => {
    const index: TagIndex = {
      updatedAt: "2026-05-12T00:00:00.000Z",
      tags: {
        AI: usage("AI", 6, 4),
        ai: usage("ai", 3, 3),
        "ai/tools": usage("ai/tools", 4, 2),
        "ai-tools": usage("ai-tools", 2, 1),
        work: usage("work", 30, 12),
        "硅谷教父马克安德森访谈": usage("硅谷教父马克安德森访谈", 1, 1),
        orphan: usage("orphan", 1, 1),
        "project-ai": usage("project-ai", 2, 2),
        project_ai: usage("project_ai", 2, 2)
      }
    };

    const report = analyzeTagHealth(index);

    expect(report.summary.totalTags).toBe(9);
    expect(report.summary.totalUsages).toBe(51);
    expect(report.summary.riskItemCount).toBeGreaterThan(0);
    expect(report.sections.lowFrequency.items).toHaveLength(1);
    expect(report.sections.lowFrequency.items[0].tags).toEqual([
      "orphan",
      "硅谷教父马克安德森访谈"
    ]);
    expect(report.sections.lowFrequency.items[0].title).toContain("2");
    expect(report.sections.nearDuplicates.items.some((item) => item.tags.includes("AI") && item.tags.includes("ai"))).toBe(
      true
    );
    expect(report.sections.hierarchyInconsistency.items.some((item) => item.tags.includes("ai/tools"))).toBe(true);
    expect(report.sections.overBroad.items.map((item) => item.tags[0])).toContain("work");
    expect(report.sections.overNarrow.items).toHaveLength(1);
    expect(report.sections.overNarrow.items[0].tags).toEqual(["硅谷教父马克安德森访谈"]);
    expect(report.sections.overNarrow.items[0].title).toContain("1");
    expect(report.sections.namingDrift.items.some((item) => item.tags.includes("project-ai"))).toBe(true);
  });
});

function usage(tag: string, count: number, fileCount: number): TagUsage {
  return {
    tag,
    normalized: tag.toLowerCase(),
    count,
    files: Array.from({ length: fileCount }, (_, index) => ({
      path: `notes/${tag}-${index}.md`,
      count: 1,
      sources: ["metadata"]
    })),
    examples: [],
    namingSignals: {
      hasHierarchy: tag.includes("/"),
      depth: tag.split("/").length
    }
  };
}
