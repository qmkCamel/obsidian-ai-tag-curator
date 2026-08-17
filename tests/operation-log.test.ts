import { describe, expect, it } from "vitest";
import { OperationLog } from "../src/operations/OperationLog";
import type { ChangePlan } from "../src/preview/ChangePlan";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";
import { createFolderBatchSettingsSnapshot } from "../src/batch/FolderBatchPlan";

describe("OperationLog", () => {
  it("keeps recommendation undo lookup separate from cleanup undo lookup", () => {
    const recommendationPlan: ChangePlan = {
      notePath: "notes/a.md",
      beforeTags: ["AI"],
      afterTags: ["AI", "tools"],
      addedTags: ["tools"],
      syncedInlineTags: [],
      aiAddedTags: ["tools"],
      unchangedTags: ["AI"],
      skippedTags: [],
      sourceContentHash: "a".repeat(64),
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

  it("keeps one mutable batch record slot and resolves latest batch state without secrets or content", () => {
    const log = new OperationLog();
    const batch = log.addBatchIntent(
      {
        folderPath: "notes",
        includeSubfolders: true,
        indexUpdatedAt: "2026-08-04T00:00:00.000Z",
        settings: createFolderBatchSettingsSnapshot({ ...DEFAULT_SETTINGS, apiKey: "secret" }, "en"),
        files: [
          {
            notePath: "notes/a.md",
            beforeTags: ["before"],
            afterTags: ["before", "after"],
            syncedInlineTags: ["after"],
            aiAddedTags: []
          }
        ]
      },
      2
    );

    expect(log.latestUnresolvedBatch()?.id).toBe(batch.id);
    log.updateBatchStatus(batch.id, "applied");
    expect(log.latestBatch("applied")?.id).toBe(batch.id);
    expect(log.latestUnresolvedBatch()).toBeUndefined();
    log.setBatchRecoveryTarget(batch.id, "after", [
      { ...batch.files[0], recoveryState: "conflict" }
    ]);
    expect(log.latestUnresolvedBatch()).toMatchObject({ recoveryTarget: "after", status: "recoveryRequired" });
    expect(JSON.stringify(log.toJSON())).not.toContain("secret");
    expect(JSON.stringify(log.toJSON())).not.toContain("full markdown body");
    expect(log.toJSON()).toHaveLength(1);
    log.remove(batch.id);
    expect(log.latestBatch()).toBeUndefined();
  });

  it("loads legacy recommendation records without confusing cleanup or batch records", () => {
    const legacy = {
      id: "legacy",
      plan: {
        notePath: "legacy.md",
        beforeTags: [],
        afterTags: ["tag"],
        addedTags: ["tag"],
        syncedInlineTags: [],
        aiAddedTags: ["tag"],
        unchangedTags: [],
        skippedTags: [],
        sourceContentHash: "a".repeat(64),
        createdAt: "2026-08-04T00:00:00.000Z"
      }
    };
    const log = new OperationLog([legacy]);
    expect(log.latestForPath("legacy.md")?.id).toBe("legacy");
    expect(log.latestBatch()).toBeUndefined();
  });

  it("applies the shared log limit to whole records rather than individual batch files", () => {
    const plan = createRecommendationPlan("first.md");
    const log = new OperationLog();
    log.add(plan, 1);
    log.add({ ...plan, notePath: "second.md" }, 1);
    expect(log.toJSON()).toHaveLength(1);
    expect(log.latestForPath("first.md")).toBeUndefined();
    expect(log.latestForPath("second.md")).toBeDefined();
  });
});

function createRecommendationPlan(notePath: string): ChangePlan {
  return {
    notePath,
    beforeTags: [],
    afterTags: ["tag"],
    addedTags: ["tag"],
    syncedInlineTags: [],
    aiAddedTags: ["tag"],
    unchangedTags: [],
    skippedTags: [],
    sourceContentHash: "a".repeat(64),
    createdAt: "2026-08-04T00:00:00.000Z"
  };
}
