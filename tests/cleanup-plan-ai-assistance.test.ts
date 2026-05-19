import { describe, expect, it } from "vitest";
import { applyAiAssistanceToCleanupPlan } from "../src/cleanup/CleanupPlanAiAssistance";
import type { CleanupPlan } from "../src/cleanup/CleanupPlan";
import type { TagHealthAiAnalysis } from "../src/health/TagHealthAiAnalysis";

describe("applyAiAssistanceToCleanupPlan", () => {
  it("attaches AI hints without changing local action availability", () => {
    const plan: CleanupPlan = {
      generatedAt: "2026-05-19T00:00:00.000Z",
      itemCount: 2,
      affectedFileCount: 2,
      items: [
        {
          id: "lowFrequency-1",
          issueType: "lowFrequency",
          title: "低频标签",
          action: "observe",
          capability: {
            kind: "observeOnly",
            availability: "observeOnly",
            riskLevel: "low",
            requiresTargetTag: false,
            requiresFilePreview: false,
            supportsBatch: false,
            defaultSelected: false
          },
          tags: ["orphan"],
          rationale: "review",
          affectedFileCount: 1,
          files: [{ path: "notes/orphan.md", beforeTags: ["orphan"], afterTags: ["orphan"] }]
        },
        {
          id: "overBroad-1",
          issueType: "overBroad",
          title: "过宽标签",
          action: "rename",
          capability: {
            kind: "splitBroadTag",
            availability: "manualReview",
            riskLevel: "high",
            requiresTargetTag: false,
            requiresFilePreview: true,
            supportsBatch: false,
            defaultSelected: false
          },
          tags: ["记录"],
          rationale: "too broad",
          affectedFileCount: 1,
          files: [{ path: "notes/log.md", beforeTags: ["记录"], afterTags: ["记录"] }]
        }
      ]
    };
    const analysis: TagHealthAiAnalysis = {
      summary: "AI summary",
      priorities: [
        {
          issueType: "lowFrequency",
          tags: ["orphan"],
          severity: "high",
          confidence: "high",
          diagnosis: "AI says handle it",
          suggestedAction: "merge",
          targetTag: "archive",
          reason: "AI priority",
          riskNote: "Still risky"
        },
        {
          issueType: "overBroad",
          tags: ["记录"],
          severity: "high",
          confidence: "medium",
          diagnosis: "AI suggests target",
          suggestedAction: "rename",
          targetTag: "输入",
          reason: "AI target",
          riskNote: "Manual review required"
        }
      ]
    };

    const enhanced = applyAiAssistanceToCleanupPlan(plan, analysis);

    expect(enhanced.items[0].capability.availability).toBe("observeOnly");
    expect(enhanced.items[0].aiAssistance?.targetTagCandidate).toBe("archive");
    expect(enhanced.items[1].capability.availability).toBe("manualReview");
    expect(enhanced.items[1].aiAssistance?.targetTagCandidate).toBe("输入");
  });
});
