import { describe, expect, it } from "vitest";
import { buildCleanupPlan } from "../src/cleanup/CleanupPlanBuilder";
import type { TagHealthReport } from "../src/health/TagHealthReport";
import type { TagIndex, TagUsage } from "../src/index/TagIndex";

describe("buildCleanupPlan", () => {
  it("builds a read-only cleanup preview with canonical targets and affected files", () => {
    const index: TagIndex = {
      updatedAt: "2026-05-12T00:00:00.000Z",
      tags: {
        AI: usage("AI", 8, ["notes/a.md", "notes/shared.md"]),
        ai: usage("ai", 2, ["notes/b.md", "notes/shared.md"]),
        orphan: usage("orphan", 1, ["notes/orphan.md"])
      }
    };
    const report: TagHealthReport = {
      generatedAt: "2026-05-12T01:00:00.000Z",
      indexUpdatedAt: index.updatedAt,
      summary: {
        updatedAt: index.updatedAt,
        totalTags: 3,
        totalUsages: 11,
        totalFiles: 4,
        hierarchicalTags: 0,
        topTags: [],
        riskItemCount: 2
      },
      sections: {
        lowFrequency: {
          type: "lowFrequency",
          items: [
            {
              type: "lowFrequency",
              title: "1 tag",
              tags: ["orphan"],
              evidence: "Used once.",
              impact: "Review it.",
              suggestion: "observe"
            }
          ]
        },
        nearDuplicates: {
          type: "nearDuplicates",
          items: [
            {
              type: "nearDuplicates",
              title: "#AI / #ai",
              tags: ["AI", "ai"],
              evidence: "Similar.",
              impact: "Merge them.",
              suggestion: "merge"
            }
          ]
        },
        hierarchyInconsistency: { type: "hierarchyInconsistency", items: [] },
        overBroad: { type: "overBroad", items: [] },
        overNarrow: { type: "overNarrow", items: [] },
        namingDrift: { type: "namingDrift", items: [] }
      }
    };

    const plan = buildCleanupPlan(report, index, new Date("2026-05-12T02:00:00.000Z"));

    expect(plan.generatedAt).toBe("2026-05-12T02:00:00.000Z");
    expect(plan.itemCount).toBe(2);
    expect(plan.affectedFileCount).toBe(4);

    const mergeItem = plan.items.find((item) => item.action === "merge");
    expect(mergeItem?.targetTag).toBe("AI");
    expect(mergeItem?.files).toEqual([
      { path: "notes/a.md", beforeTags: ["AI"], afterTags: ["AI"] },
      { path: "notes/b.md", beforeTags: ["ai"], afterTags: ["AI"] },
      { path: "notes/shared.md", beforeTags: ["AI", "ai"], afterTags: ["AI"] }
    ]);

    const observeItem = plan.items.find((item) => item.action === "observe");
    expect(observeItem?.files).toEqual([{ path: "notes/orphan.md", beforeTags: ["orphan"], afterTags: ["orphan"] }]);
  });
});

function usage(tag: string, count: number, paths: string[]): TagUsage {
  return {
    tag,
    normalized: tag.toLowerCase(),
    count,
    files: paths.map((path) => ({
      path,
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
