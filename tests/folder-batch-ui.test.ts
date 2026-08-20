// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAiCandidates, createFolderBatchPlan, createInlineSyncCandidates, withDerivedPlanState } from "../src/batch/FolderBatchPlan";
import { FolderBatchPreviewModal } from "../src/batch/FolderBatchPreviewModal";
import { FolderBatchProgressModal } from "../src/batch/FolderBatchProgressModal";
import { FolderBatchScopeModal } from "../src/batch/FolderBatchScopeModal";
import { VaultReader } from "../src/obsidian/VaultReader";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";
import { getLabels } from "../src/ui/labels";
import { createFakeApp, installDomHelpers, resetObsidianMockState } from "./e2e/obsidian-harness";

describe("folder batch DOM", () => {
  beforeEach(() => {
    installDomHelpers();
    resetObsidianMockState();
  });

  it("disables empty scope before any read", () => {
    const app = createFakeApp([{ path: "asset.png", content: "binary" }]);
    const labels = getLabels("en");
    const modal = new FolderBatchScopeModal(
      app as never,
      new VaultReader(app as never),
      "",
      50,
      true,
      labels,
      labels.folderBatch.providerNotice,
      vi.fn()
    );
    modal.open();
    expect(document.body.textContent).toContain(labels.folderBatch.emptyScope);
    expect(findButton(labels.folderBatch.start).disabled).toBe(true);
    expect(app.vault.getReadCount()).toBe(0);
  });

  it("uses textual risk labels, provides no high-risk toggle, never bulk-selects medium risk, and writes nothing during review", () => {
    const app = createFakeApp([{ path: "a.md", content: "body" }]);
    const labels = getLabels("en");
    const plan = createFolderBatchPlan({
      folderPath: "",
      includeSubfolders: true,
      filePaths: ["a.md"],
      index: { updatedAt: "now", tags: {} },
      settings: { ...DEFAULT_SETTINGS, allowNewTags: true },
      uiLanguage: "en",
      randomId: "batch"
    });
    plan.items[0] = {
      ...plan.items[0],
      sourceStatus: "ready",
      aiStatus: "ready",
      beforeTags: [],
      sourceContentHash: "a".repeat(64),
      inventory: { frontmatterTags: [], inlineTags: ["inline"], allTags: ["inline"] },
      candidates: [
        ...createInlineSyncCandidates(
          "a.md",
          { frontmatterTags: [], inlineTags: ["inline"], allTags: ["inline"] },
          "sync"
        ),
        ...createAiCandidates(
          "a.md",
          [{ tag: "new", type: "new", confidence: "medium", reason: "new taxonomy" }],
          true,
          []
        ),
        {
          id: "high",
          tag: "remove-body-tag",
          action: "addTag",
          source: "ai",
          type: "existing",
          confidence: "high",
          reason: "unsupported destructive action",
          risk: "high",
          selected: false,
          executable: false
        }
      ]
    };

    new FolderBatchPreviewModal(app as never, withDerivedPlanState(plan), labels, vi.fn(), vi.fn()).open();
    expect(document.querySelector(".tag-curator-folder-batch__file > summary")?.textContent).toBe("a.md");
    expect(document.body.textContent).toContain(labels.folderBatch.riskLow);
    expect(document.body.textContent).toContain(labels.folderBatch.riskMedium);
    expect(document.body.textContent).toContain(labels.folderBatch.riskHigh);
    expect(document.querySelector(".tag-curator-folder-batch__candidate--low")).not.toBeNull();
    expect(document.querySelector(".tag-curator-folder-batch__candidate--medium")).not.toBeNull();
    expect(document.querySelector(".tag-curator-folder-batch__candidate--high")).not.toBeNull();
    expect(settingFor("#remove-body-tag").querySelector('input[type="checkbox"]')).toBeNull();
    expect((settingFor("#new").querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    findButton(labels.folderBatch.selectAllLow).click();
    expect((settingFor("#new").querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    expect(app.fileManager.getWriteCount()).toBe(0);
  });

  it("hides successful internal states and explains a cancelled read with localized text", () => {
    const app = createFakeApp([{ path: "cancelled.md", content: "body" }]);
    const labels = getLabels("en");
    const plan = createFolderBatchPlan({
      folderPath: "",
      includeSubfolders: true,
      filePaths: ["cancelled.md"],
      index: { updatedAt: "now", tags: {} },
      settings: DEFAULT_SETTINGS,
      uiLanguage: "en",
      randomId: "cancelled-batch"
    });
    plan.items[0] = {
      ...plan.items[0],
      sourceStatus: "cancelled",
      aiStatus: "cancelled",
      planStatus: "unavailable"
    };

    new FolderBatchPreviewModal(app as never, plan, labels, vi.fn(), vi.fn()).open();

    const summary = document.querySelector(".tag-curator-folder-batch__file > summary");
    expect(summary?.textContent).toBe("cancelled.md");
    expect(document.body.textContent).toContain(labels.folderBatch.sourceCancelled);
    expect(document.body.textContent).not.toContain("cancelled / cancelled / unavailable");
  });

  it("keeps progress modeless and marks the compact panel when minimized", () => {
    const app = createFakeApp([{ path: "a.md", content: "body" }]);
    const labels = getLabels("en");
    const modal = new FolderBatchProgressModal(
      app as never,
      {
        plan: {} as never,
        completed: 0,
        total: 1,
        sourceReady: 0,
        sourceFailed: 0,
        aiReady: 0,
        aiFailed: 0,
        cancelled: 0,
        planReady: 0,
        noChange: 0
      },
      labels,
      vi.fn()
    );

    modal.open();
    expect(modal.containerEl.classList.contains("tag-curator-folder-progress-container")).toBe(true);
    findButton(labels.folderBatch.minimize).click();
    expect(modal.containerEl.classList.contains("tag-curator-folder-progress-container--minimized")).toBe(true);
    expect(findButton(labels.loading.expand).disabled).toBe(false);
  });
});

function findButton(text: string): HTMLButtonElement {
  const value = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent === text
  );
  expect(value).toBeDefined();
  return value!;
}

function settingFor(text: string): HTMLElement {
  const value = Array.from(document.querySelectorAll<HTMLElement>(".setting-item")).find((item) =>
    item.textContent?.includes(text)
  );
  expect(value).toBeDefined();
  return value!;
}
