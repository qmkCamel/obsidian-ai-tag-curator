// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAiCandidates, createFolderBatchPlan, createInlineSyncCandidates, withDerivedPlanState } from "../src/batch/FolderBatchPlan";
import { FolderBatchPreviewModal } from "../src/batch/FolderBatchPreviewModal";
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
    expect(document.body.textContent).toContain(labels.folderBatch.riskLow);
    expect(document.body.textContent).toContain(labels.folderBatch.riskMedium);
    expect(document.body.textContent).toContain(labels.folderBatch.riskHigh);
    expect(settingFor("#remove-body-tag").querySelector('input[type="checkbox"]')).toBeNull();
    expect((settingFor("#new").querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    findButton(labels.folderBatch.selectAllLow).click();
    expect((settingFor("#new").querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    expect(app.fileManager.getWriteCount()).toBe(0);
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
