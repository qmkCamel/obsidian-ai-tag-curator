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
        frontmatterTags: ["research"],
        inlineTags: ["workflow"],
        allTags: ["research", "workflow"],
        sourceContentHash: "a".repeat(64)
      }
    );

    expect(result.notePath).toBe("notes/ai.md");
    expect(result.existingTags).toEqual(["research"]);
    expect(result.recommendations[0].tag).toBe("project/ai");
    expect(result.warnings).toEqual(["Index is small."]);
  });

  it("filters out tags already present on the note", () => {
    const result = parseRecommendationResult(
      JSON.stringify({
        recommendations: [
          {
            tag: "育儿",
            type: "existing",
            confidence: "high",
            reason: "Already present."
          },
          {
            tag: "AI教育",
            type: "new",
            confidence: "high",
            reason: "New topic tag."
          }
        ]
      }),
      {
        notePath: "notes/parenting.md",
        frontmatterTags: ["clippings"],
        inlineTags: ["育儿"],
        allTags: ["clippings", "育儿"],
        sourceContentHash: "b".repeat(64)
      }
    );

    expect(result.recommendations.map((recommendation) => recommendation.tag)).toEqual(["AI教育"]);
  });

  it("rejects malformed JSON and incomplete recommendations", () => {
    expect(() => parseRecommendationResult("{bad json", emptyContext())).toThrow(
      /valid JSON/
    );

    expect(() =>
      parseRecommendationResult(JSON.stringify({ recommendations: [{ tag: "x" }] }), {
        ...emptyContext()
      })
    ).toThrow(/recommendation/i);
  });
});

function emptyContext() {
  return {
    notePath: "x.md",
    frontmatterTags: [],
    inlineTags: [],
    allTags: [],
    sourceContentHash: "c".repeat(64)
  };
}
