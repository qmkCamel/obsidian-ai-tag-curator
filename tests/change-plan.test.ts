// Verifies selected recommendations become a deduplicated frontmatter change plan.
import { describe, expect, it } from "vitest";
import { createChangePlan } from "../src/preview/ChangePlan";

describe("createChangePlan", () => {
  it("merges selected recommendations with existing tags without duplicates", () => {
    const plan = createChangePlan({
      notePath: "notes/ai.md",
      beforeTags: ["research", "project/ai"],
      sourceContentHash: "a".repeat(64),
      selectedInlineTags: ["project/ai", "#workflow"],
      selectedAiTags: ["#writing", "Research"]
    });

    expect(plan.addedTags).toEqual(["workflow", "writing"]);
    expect(plan.syncedInlineTags).toEqual(["workflow"]);
    expect(plan.aiAddedTags).toEqual(["writing"]);
    expect(plan.unchangedTags).toEqual(["research", "project/ai"]);
    expect(plan.afterTags).toEqual(["research", "project/ai", "workflow", "writing"]);
    expect(plan.sourceContentHash).toBe("a".repeat(64));
  });
});
