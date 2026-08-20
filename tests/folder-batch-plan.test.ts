import { describe, expect, it } from "vitest";
import {
  classifyFolderBatchCandidate,
  clearAllCandidates,
  createAiCandidates,
  createFolderBatchPlan,
  createInlineSyncCandidates,
  deriveChangePlans,
  deriveFolderBatchItemPlanStatus,
  selectAllLowRisk,
  updateCandidateSelection,
  withDerivedPlanState,
  type FolderBatchPlanItem
} from "../src/batch/FolderBatchPlan";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";

const index = { updatedAt: "2026-08-04T00:00:00.000Z", tags: {} };

describe("FolderBatchPlan", () => {
  it("freezes safe settings without the API key and keeps a stable unique path order", () => {
    const plan = createFolderBatchPlan({
      folderPath: "/notes/",
      includeSubfolders: true,
      filePaths: ["notes/z.md", "notes/a.md", "notes/z.md"],
      index,
      settings: { ...DEFAULT_SETTINGS, apiKey: "secret" },
      uiLanguage: "zh-CN",
      now: new Date("2026-08-04T00:00:00.000Z"),
      randomId: "batch-1"
    });

    expect(plan.filePaths).toEqual(["notes/a.md", "notes/z.md"]);
    expect(plan.settings).not.toHaveProperty("apiKey");
    expect(plan.settings).toMatchObject({
      providerType: "openai-compatible",
      providerPreset: "openai",
      model: "gpt-4o-mini",
      supportsJsonMode: true,
      providerConcurrency: 2,
      promptProfile: "default"
    });
    expect(plan.settings.maxFolderBatchFiles).toBe(50);
    expect(plan.items.map((item) => item.notePath)).toEqual(plan.filePaths);
  });

  it("classifies local actions and applies conservative default selection", () => {
    expect(classifyFolderBatchCandidate("syncInlineTag")).toBe("low");
    expect(classifyFolderBatchCandidate("addTag", "existing")).toBe("low");
    expect(classifyFolderBatchCandidate("addTag", "new")).toBe("medium");
    expect(classifyFolderBatchCandidate("removeTag")).toBe("high");

    const inline = createInlineSyncCandidates(
      "notes/a.md",
      { frontmatterTags: ["project"], inlineTags: ["project", "topic/ai"], allTags: ["project", "topic/ai"] },
      "sync"
    );
    const ai = createAiCandidates(
      "notes/a.md",
      [
        { tag: "existing", type: "existing", confidence: "high", reason: "reuse" },
        { tag: "new-one", type: "new", confidence: "high", reason: "new" }
      ],
      true,
      ["existing"]
    );
    expect(inline[0]).toMatchObject({ risk: "low", selected: true, executable: true });
    expect(ai.map(({ risk, selected }) => ({ risk, selected }))).toEqual([
      { risk: "low", selected: true },
      { risk: "medium", selected: false }
    ]);
    expect(createAiCandidates("notes/a.md", aiRecommendations(), false, ["existing"]).map((candidate) => candidate.tag)).toEqual([
      "existing"
    ]);
    expect(
      createAiCandidates(
        "notes/a.md",
        [{ tag: "model-lied", type: "existing", confidence: "high", reason: "claimed existing" }],
        true,
        []
      )[0]
    ).toMatchObject({ type: "new", risk: "medium", selected: false });
  });

  it("updates one candidate, selects only low risk, and clears without mutation", () => {
    const plan = readyPlan();
    const original = structuredClone(plan);
    const mediumId = plan.items[0].candidates[1].id;
    const selected = updateCandidateSelection(plan, mediumId, true);
    expect(selected.items[0].candidates[1].selected).toBe(true);
    expect(plan).toEqual(original);
    expect(selectAllLowRisk(selected).items[0].candidates.map((item) => item.selected)).toEqual([true, true]);
    expect(clearAllCandidates(selected).items[0].candidates.every((item) => !item.selected)).toBe(true);
  });

  it("derives orthogonal failure/no-change states and source-separated change plans", () => {
    expect(deriveFolderBatchItemPlanStatus(item({ sourceStatus: "failed", aiStatus: "notStarted" }))).toBe(
      "unavailable"
    );
    expect(
      deriveFolderBatchItemPlanStatus(item({ sourceStatus: "ready", aiStatus: "failed", candidates: [] }))
    ).toBe("unavailable");
    expect(
      deriveFolderBatchItemPlanStatus(
        item({ sourceStatus: "ready", aiStatus: "failed", candidates: readyPlan().items[0].candidates.slice(0, 1) })
      )
    ).toBe("ready");
    expect(deriveFolderBatchItemPlanStatus(item({ sourceStatus: "ready", aiStatus: "ready", candidates: [] }))).toBe(
      "noChange"
    );

    const derived = withDerivedPlanState(readyPlan());
    const plans = deriveChangePlans(derived);
    expect(plans).toHaveLength(1);
    expect(plans[0].syncedInlineTags).toEqual(["topic/ai"]);
    expect(plans[0].aiAddedTags).toEqual([]);
    expect(plans[0].afterTags).toEqual(["project", "topic/ai"]);
  });
});

function readyPlan() {
  const plan = createFolderBatchPlan({
    folderPath: "notes",
    includeSubfolders: true,
    filePaths: ["notes/a.md"],
    index,
    settings: DEFAULT_SETTINGS,
    uiLanguage: "en",
    randomId: "batch"
  });
  plan.items[0] = {
    ...plan.items[0],
    sourceStatus: "ready",
    aiStatus: "ready",
    beforeTags: ["project"],
    sourceContentHash: "a".repeat(64),
    inventory: { frontmatterTags: ["project"], inlineTags: ["topic/ai"], allTags: ["project", "topic/ai"] },
    candidates: [
      ...createInlineSyncCandidates(
        "notes/a.md",
        { frontmatterTags: ["project"], inlineTags: ["topic/ai"], allTags: ["project", "topic/ai"] },
        "sync"
      ),
      ...createAiCandidates("notes/a.md", aiRecommendations().slice(1), true, ["existing"])
    ]
  };
  return plan;
}

function aiRecommendations() {
  return [
    { tag: "existing", type: "existing" as const, confidence: "high" as const, reason: "reuse" },
    { tag: "new-one", type: "new" as const, confidence: "high" as const, reason: "new" }
  ];
}

function item(overrides: Partial<FolderBatchPlanItem>): FolderBatchPlanItem {
  return {
    notePath: "notes/a.md",
    sourceStatus: "pending",
    aiStatus: "notStarted",
    planStatus: "pending",
    candidates: [],
    ...overrides
  };
}
