import { describe, expect, it } from "vitest";
import type { CleanupPlan } from "../src/cleanup/CleanupPlan";
import { buildTagHealthReportViewModel } from "../src/health/TagHealthReportViewModel";
import type { TagHealthAiAnalysis } from "../src/health/TagHealthAiAnalysis";
import type { TagHealthReport } from "../src/health/TagHealthReport";

describe("buildTagHealthReportViewModel", () => {
  it("returns the initial AI state without priority action items before AI runs", () => {
    const view = buildTagHealthReportViewModel(reportFixture(), cleanupPlanFixture(), {
      aiAnalysis: null,
      aiLoading: false
    });

    expect(view.aiState).toBe("initial");
    expect(view.actionItems).toEqual([]);
    expect(view.evidenceSections.map((section) => section.type)).toEqual([
      "lowFrequency",
      "nearDuplicates",
      "hierarchyInconsistency",
      "overBroad",
      "overNarrow",
      "namingDrift"
    ]);
  });

  it("matches AI priorities to cleanup items and inherits local action capability", () => {
    const analysis: TagHealthAiAnalysis = {
      summary: "AI summary",
      priorities: [
        {
          issueType: "nearDuplicates",
          tags: ["ai", "AI"],
          severity: "high",
          confidence: "high",
          diagnosis: "重复标签",
          suggestedAction: "merge",
          targetTag: "AI",
          reason: "应统一",
          riskNote: "先确认文件预览"
        }
      ]
    };

    const view = buildTagHealthReportViewModel(reportFixture(), cleanupPlanFixture(), {
      aiAnalysis: analysis,
      aiLoading: false
    });

    expect(view.aiState).toBe("results");
    expect(view.actionItems).toHaveLength(1);
    expect(view.actionItems[0]).toMatchObject({
      tags: ["ai", "AI"],
      priority: "high",
      confidence: "high",
      evidenceTypes: ["nearDuplicates", "namingDrift"],
      cleanupItemId: "nearDuplicates-1",
      source: "ai"
    });
    expect(view.actionItems[0].capability.availability).toBe("executable");
  });

  it("keeps unmatched AI priorities manual-review only", () => {
    const analysis: TagHealthAiAnalysis = {
      summary: "AI summary",
      priorities: [
        {
          issueType: "overBroad",
          tags: ["unknown"],
          severity: "medium",
          confidence: "low",
          diagnosis: "未匹配本地证据",
          suggestedAction: "rename",
          reason: "需要人工判断"
        }
      ]
    };

    const view = buildTagHealthReportViewModel(reportFixture(), cleanupPlanFixture(), {
      aiAnalysis: analysis,
      aiLoading: false
    });

    expect(view.actionItems).toHaveLength(1);
    expect(view.actionItems[0].cleanupItemId).toBeUndefined();
    expect(view.actionItems[0].capability.availability).toBe("manualReview");
  });
});

function reportFixture(): TagHealthReport {
  return {
    generatedAt: "2026-05-19T12:00:00.000Z",
    indexUpdatedAt: "2026-05-19T11:00:00.000Z",
    summary: {
      updatedAt: "2026-05-19T11:00:00.000Z",
      totalTags: 8,
      totalUsages: 20,
      totalFiles: 6,
      hierarchicalTags: 1,
      topTags: [],
      riskItemCount: 3
    },
    sections: {
      lowFrequency: { type: "lowFrequency", items: [] },
      nearDuplicates: {
        type: "nearDuplicates",
        items: [
          {
            type: "nearDuplicates",
            title: "#AI / #ai",
            tags: ["AI", "ai"],
            evidence: "大小写重复",
            impact: "检索分散",
            suggestion: "merge"
          }
        ]
      },
      hierarchyInconsistency: { type: "hierarchyInconsistency", items: [] },
      overBroad: { type: "overBroad", items: [] },
      overNarrow: { type: "overNarrow", items: [] },
      namingDrift: {
        type: "namingDrift",
        items: [
          {
            type: "namingDrift",
            title: "#AI / #ai 命名漂移",
            tags: ["AI", "ai"],
            evidence: "命名不一致",
            impact: "使用分散",
            suggestion: "rename"
          }
        ]
      }
    }
  };
}

function cleanupPlanFixture(): CleanupPlan {
  return {
    generatedAt: "2026-05-19T12:01:00.000Z",
    itemCount: 2,
    affectedFileCount: 2,
    items: [
      {
        id: "nearDuplicates-1",
        issueType: "nearDuplicates",
        title: "#AI / #ai",
        action: "merge",
        capability: {
          kind: "mergeTags",
          availability: "executable",
          riskLevel: "medium",
          requiresTargetTag: true,
          requiresFilePreview: true,
          supportsBatch: false,
          defaultSelected: true
        },
        tags: ["AI", "ai"],
        targetTag: "AI",
        rationale: "合并重复标签",
        affectedFileCount: 2,
        files: [
          { path: "a.md", beforeTags: ["AI"], afterTags: ["AI"] },
          { path: "b.md", beforeTags: ["ai"], afterTags: ["AI"] }
        ]
      },
      {
        id: "namingDrift-1",
        issueType: "namingDrift",
        title: "#AI / #ai 命名漂移",
        action: "rename",
        capability: {
          kind: "renameTag",
          availability: "executable",
          riskLevel: "medium",
          requiresTargetTag: true,
          requiresFilePreview: true,
          supportsBatch: false,
          defaultSelected: true
        },
        tags: ["AI", "ai"],
        targetTag: "AI",
        rationale: "统一命名",
        affectedFileCount: 2,
        files: [
          { path: "a.md", beforeTags: ["AI"], afterTags: ["AI"] },
          { path: "b.md", beforeTags: ["ai"], afterTags: ["AI"] }
        ]
      }
    ]
  };
}
