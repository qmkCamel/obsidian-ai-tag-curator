import { describe, expect, it } from "vitest";
import {
  OperationLog,
  isCleanupV2Record,
  isLegacyCleanupRecord,
  isRecommendationRecord
} from "../src/operations/OperationLog";
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

  it("stores one mutable V2 cleanup intent without Markdown or review context", () => {
    const log = new OperationLog();
    const intent = log.addCleanupIntent(
      {
        itemId: "rename-1",
        title: "Rename old",
        action: "rename",
        sourceTags: ["old"],
        targetTag: "new",
        partial: true,
        files: [
          {
            notePath: "note.md",
            beforeTags: ["old"],
            afterTags: ["new"],
            sourceContentHash: "a".repeat(64),
            beforeBodyHash: "b".repeat(64),
            afterBodyHash: "c".repeat(64),
            inlineEdits: [
              {
                occurrenceId: "note.md:0:4:old",
                beforeBodyStart: 0,
                beforeBodyEnd: 4,
                afterBodyStart: 0,
                afterBodyEnd: 4,
                beforeText: "#old",
                afterText: "#new"
              }
            ]
          }
        ]
      },
      10
    );

    expect(intent).toMatchObject({ schemaVersion: 2, status: "applying", type: "cleanup" });
    expect(log.latestCleanupV2()?.id).toBe(intent.id);
    expect(log.latestUnresolvedCleanup()?.id).toBe(intent.id);
    expect(log.latestUnresolvedMutation()?.id).toBe(intent.id);

    log.updateCleanupFiles(intent.id, [
      { ...intent.files[0], afterContentHash: "d".repeat(64), recoveryState: "after" }
    ]);
    log.updateCleanupStatus(intent.id, "applied");
    expect(log.latestCleanupV2("applied")?.files[0]).toMatchObject({ recoveryState: "after" });
    expect(log.latestUnresolvedCleanup()).toBeUndefined();

    log.setCleanupRecoveryTarget(intent.id, "before", [
      { ...intent.files[0], recoveryState: "bodyChanged" }
    ]);
    expect(log.latestUnresolvedCleanup()).toMatchObject({ status: "recoveryRequired", recoveryTarget: "before" });
    const serialized = JSON.stringify(log.toJSON());
    expect(serialized).not.toContain("full markdown");
    expect(serialized).not.toContain("context");
  });

  it("clones V2 cleanup input, updates, and serialized output", () => {
    const log = new OperationLog();
    const inputFile = {
      notePath: "note.md",
      beforeTags: ["old"],
      afterTags: ["new"],
      sourceContentHash: "a",
      beforeBodyHash: "b",
      afterBodyHash: "c",
      inlineEdits: []
    };
    const intent = log.addCleanupIntent(
      {
        itemId: "one",
        title: "One",
        action: "merge",
        sourceTags: ["old"],
        targetTag: "new",
        partial: false,
        files: [inputFile]
      },
      10
    );
    inputFile.beforeTags.push("mutated");
    intent.files[0].beforeTags.push("returned-mutation");
    const json = log.toJSON();
    if (isCleanupV2Record(json[0])) json[0].files[0].beforeTags.push("json-mutation");

    expect(log.latestCleanupV2()?.files[0].beforeTags).toEqual(["old"]);
  });

  it("keeps explicit guards across mixed legacy and V2 records", () => {
    const legacyCleanup = {
      id: "legacy-cleanup",
      type: "cleanup" as const,
      itemId: "legacy",
      title: "Legacy",
      action: "rename" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      files: [{ notePath: "legacy.md", beforeTags: ["a"], afterTags: ["b"] }]
    };
    const recommendation = { id: "recommendation", plan: createRecommendationPlan("recommendation.md") };
    const log = new OperationLog([legacyCleanup, recommendation]);

    expect(isLegacyCleanupRecord(log.toJSON()[0])).toBe(true);
    expect(isCleanupV2Record(log.toJSON()[0])).toBe(false);
    expect(isRecommendationRecord(log.toJSON()[1])).toBe(true);
    expect(log.latestCleanup()?.id).toBe("legacy-cleanup");
  });

  it("selects unresolved state correctly from mixed recommendation, legacy cleanup, batch, and V2 data", () => {
    const v2 = new OperationLog()
      .addCleanupIntent(
        {
          itemId: "v2",
          title: "V2",
          action: "rename",
          sourceTags: ["old"],
          targetTag: "new",
          partial: false,
          files: []
        },
        10
      );
    const batch = new OperationLog().addBatchIntent(
      {
        folderPath: "notes",
        includeSubfolders: true,
        indexUpdatedAt: "2026-08-04T00:00:00.000Z",
        settings: createFolderBatchSettingsSnapshot(DEFAULT_SETTINGS, "en"),
        files: []
      },
      10
    );
    const legacyCleanup = {
      id: "legacy",
      type: "cleanup" as const,
      itemId: "legacy",
      title: "Legacy",
      action: "rename" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      files: []
    };
    const recommendation = { id: "recommendation", plan: createRecommendationPlan("a.md") };
    const log = new OperationLog([recommendation, legacyCleanup, batch, v2]);

    expect(log.latestForPath("a.md")?.id).toBe("recommendation");
    expect(log.latestCleanup()?.id).toBe("legacy");
    expect(log.latestUnresolvedMutation()?.id).toBe(batch.id);
    log.updateBatchStatus(batch.id, "applied");
    expect(log.latestUnresolvedMutation()?.id).toBe(v2.id);
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
