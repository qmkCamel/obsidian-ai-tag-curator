// Verifies AI recommendation JSON is accepted only when it matches the expected shape.
import { describe, expect, it } from "vitest";
import { parseRecommendationResult } from "../src/ai/RecommendationParser";

describe("parseRecommendationResult", () => {
  it("parses valid structured recommendation JSON", () => {
    const result = parseRecommendationResult(
      JSON.stringify({
        recommendations: [
          {
            tag: "project/ai",
            type: "existing",
            confidence: "high",
            reason: "Matches the note topic and existing taxonomy.",
            rejectedSimilarTags: [{ tag: "ai", reason: "Too broad." }]
          }
        ],
        warnings: ["Index is small."]
      }),
      {
        notePath: "notes/ai.md",
        existingTags: ["research"]
      }
    );

    expect(result.notePath).toBe("notes/ai.md");
    expect(result.existingTags).toEqual(["research"]);
    expect(result.recommendations[0].tag).toBe("project/ai");
    expect(result.warnings).toEqual(["Index is small."]);
  });

  it("rejects malformed JSON and incomplete recommendations", () => {
    expect(() => parseRecommendationResult("{bad json", { notePath: "x.md", existingTags: [] })).toThrow(
      /valid JSON/
    );

    expect(() =>
      parseRecommendationResult(JSON.stringify({ recommendations: [{ tag: "x" }] }), {
        notePath: "x.md",
        existingTags: []
      })
    ).toThrow(/recommendation/i);
  });
});
