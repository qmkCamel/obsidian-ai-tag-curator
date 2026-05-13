import { describe, expect, it } from "vitest";
import { parseTagHealthAiAnalysis } from "../src/health/TagHealthAiAnalysisParser";

describe("parseTagHealthAiAnalysis", () => {
  it("parses structured AI health analysis without a cleanup plan", () => {
    const result = parseTagHealthAiAnalysis(
      JSON.stringify({
        summary: "优先合并重复标签。",
        priorities: [
          {
            issueType: "nearDuplicates",
            tags: ["AI", "ai"],
            severity: "high",
            confidence: "medium",
            diagnosis: "两个标签语义一致。",
            suggestedAction: "merge",
            targetTag: "AI",
            reason: "保留更常用写法。"
          }
        ]
      })
    );

    expect(result.summary).toBe("优先合并重复标签。");
    expect(result.priorities[0].severity).toBe("high");
    expect("cleanupPlan" in result).toBe(false);
  });

  it("rejects invalid JSON and invalid enum values", () => {
    expect(() => parseTagHealthAiAnalysis("not json")).toThrow("AI health analysis must be valid JSON.");
    expect(() =>
      parseTagHealthAiAnalysis(
        JSON.stringify({
          summary: "x",
          priorities: [
            {
              issueType: "lowFrequency",
              tags: ["x"],
              severity: "urgent",
              confidence: "high",
              diagnosis: "x",
              suggestedAction: "observe",
              reason: "x"
            }
          ]
        })
      )
    ).toThrow("Each AI priority must include a valid severity.");
  });

  it("sorts priorities by severity before confidence", () => {
    const result = parseTagHealthAiAnalysis(
      JSON.stringify({
        summary: "x",
        priorities: [
          priority("low-high", "low", "high"),
          priority("medium-medium", "medium", "medium"),
          priority("medium-high", "medium", "high"),
          priority("high-low", "high", "low")
        ]
      })
    );

    expect(result.priorities.map((item) => item.tags[0])).toEqual([
      "high-low",
      "medium-high",
      "medium-medium",
      "low-high"
    ]);
  });
});

function priority(tag: string, severity: string, confidence: string) {
  return {
    issueType: "lowFrequency",
    tags: [tag],
    severity,
    confidence,
    diagnosis: "x",
    suggestedAction: "observe",
    reason: "x"
  };
}
