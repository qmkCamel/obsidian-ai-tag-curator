import { describe, expect, it } from "vitest";
import { createAiCandidates, createFolderBatchPlan, createInlineSyncCandidates, withDerivedPlanState } from "../src/batch/FolderBatchPlan";
import { buildFolderBatchPreviewViewModel, buildFolderBatchRecoveryViewModel } from "../src/batch/FolderBatchViewModel";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";

describe("FolderBatchViewModel", () => {
  it("separates source/AI/plan status, risk, selected totals, and before/after tags", () => {
    const plan = createFolderBatchPlan({
      folderPath: "notes",
      includeSubfolders: true,
      filePaths: ["notes/a.md", "notes/b.md"],
      index: { updatedAt: "now", tags: {} },
      settings: DEFAULT_SETTINGS,
      uiLanguage: "en",
      randomId: "batch"
    });
    plan.items[0] = {
      ...plan.items[0],
      sourceStatus: "ready",
      aiStatus: "failed",
      beforeTags: ["base"],
      sourceContentHash: "a".repeat(64),
      inventory: { frontmatterTags: ["base"], inlineTags: ["inline"], allTags: ["base", "inline"] },
      candidates: createInlineSyncCandidates(
        "notes/a.md",
        { frontmatterTags: ["base"], inlineTags: ["inline"], allTags: ["base", "inline"] },
        "sync"
      ),
      aiError: "provider failed"
    };
    plan.items[1] = {
      ...plan.items[1],
      sourceStatus: "ready",
      aiStatus: "ready",
      beforeTags: [],
      sourceContentHash: "b".repeat(64),
      inventory: { frontmatterTags: [], inlineTags: [], allTags: [] },
      candidates: createAiCandidates(
        "notes/b.md",
        [{ tag: "new", type: "new", confidence: "medium", reason: "new" }],
        true,
        []
      )
    };
    const vm = buildFolderBatchPreviewViewModel(withDerivedPlanState(plan));
    expect(vm).toMatchObject({ selectedFileCount: 1, selectedTagCount: 1, hasRetryableFailures: true, canApply: true });
    expect(vm.riskCounts).toEqual({ low: 1, medium: 1, high: 0 });
    expect(vm.files[0]).toMatchObject({
      sourceStatus: "ready",
      aiStatus: "failed",
      planStatus: "ready",
      frontmatterTags: ["base"],
      inlineTags: ["inline"],
      afterTags: ["base", "inline"]
    });
    expect(buildFolderBatchPreviewViewModel(withDerivedPlanState(plan), "medium").files[0].candidates).toEqual([]);
  });

  it("summarizes the unique persisted recovery target and blocks retry on conflict", () => {
    const vm = buildFolderBatchRecoveryViewModel({
      id: "batch",
      type: "batch",
      status: "recoveryRequired",
      recoveryTarget: "before",
      folderPath: "notes",
      includeSubfolders: true,
      indexUpdatedAt: "now",
      settings: {
        model: "model",
        maxRecommendations: 5,
        maxFolderBatchFiles: 50,
        allowNewTags: false,
        newTagStrictness: "strict",
        uiLanguage: "en"
      },
      createdAt: "now",
      files: [
        { notePath: "a.md", beforeTags: [], afterTags: ["a"], syncedInlineTags: [], aiAddedTags: ["a"], recoveryState: "before" },
        { notePath: "b.md", beforeTags: [], afterTags: ["b"], syncedInlineTags: [], aiAddedTags: ["b"], recoveryState: "conflict" }
      ]
    });
    expect(vm).toMatchObject({ target: "before", beforeCount: 1, afterCount: 0, conflictPaths: ["b.md"], canRetry: false });
  });
});
