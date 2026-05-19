import { describe, expect, it } from "vitest";
import { OperationLog } from "../src/operations/OperationLog";
import type { ChangePlan } from "../src/preview/ChangePlan";

describe("OperationLog", () => {
  it("keeps recommendation undo lookup separate from cleanup undo lookup", () => {
    const recommendationPlan: ChangePlan = {
      notePath: "notes/a.md",
      beforeTags: ["AI"],
      afterTags: ["AI", "tools"],
      addedTags: ["tools"],
      unchangedTags: ["AI"],
      skippedTags: [],
      createdAt: "2026-05-17T00:00:00.000Z"
    };

    const log = new OperationLog();
    const recommendation = log.add(recommendationPlan, 10);
    const cleanup = log.addCleanup(
      {
        itemId: "over-narrow-1",
        title: "Remove one-off tags",
        action: "deprecate",
        files: [
          {
            notePath: "notes/b.md",
            beforeTags: ["temporary", "AI"],
            afterTags: ["AI"]
          }
        ]
      },
      10
    );

    expect(log.latestForPath("notes/a.md")?.id).toBe(recommendation.id);
    expect(log.latestForPath("notes/b.md")).toBeUndefined();
    expect(log.latestCleanup()?.id).toBe(cleanup.id);
  });
});
