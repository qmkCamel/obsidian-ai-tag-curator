// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TagCuratorSettings } from "../../src/settings/PluginSettings";
import type { TagHealthAiAnalysis } from "../../src/health/TagHealthAiAnalysis";
import { getLabels } from "../../src/ui/labels";
import {
  createDeferred,
  createFakeApp,
  installDomHelpers,
  notices,
  obsidianMock,
  queueAiError,
  queueAiResponse,
  requestUrlMock,
  resetObsidianMockState,
  setMockLanguage,
  type FakeObsidianApp
} from "./obsidian-harness";

type CommandLike = {
  callback?: () => unknown;
};

type LoadedPlugin = {
  onload: () => Promise<void> | void;
  commands: Record<string, CommandLike>;
  labels: ReturnType<typeof getLabels>;
  settings: TagCuratorSettings;
  settingTabs: Array<{
    containerEl: HTMLElement;
    display: () => void;
  }>;
};

type PluginDataSnapshot = {
  settings?: Partial<TagCuratorSettings>;
  operations?: unknown[];
  tagIndex?: {
    tags: Record<string, unknown>;
  };
  healthAiAnalysisCache?: {
    analysis: TagHealthAiAnalysis;
    analyzedAt: string;
    indexUpdatedAt: string;
  };
};

const manifest = {
  id: "ai-tag-curator",
  name: "AI Tag Curator",
  version: "0.0.0-e2e",
  minAppVersion: "1.5.0",
  description: "E2E test manifest",
  author: "e2e"
};

describe("plugin e2e workflows", () => {
  beforeEach(() => {
    vi.resetModules();
    installDomHelpers();
    resetObsidianMockState();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
  });

  it("loads commands and persists settings from the settings tab", async () => {
    setMockLanguage("en");
    const app = createFakeApp(sampleNotes(), {
      pluginData: {
        settings: {
          uiLanguage: "en"
        }
      }
    });
    const plugin = await loadPlugin(app);

    expect(Object.keys(plugin.commands).sort()).toEqual([
      "analyze-tag-health",
      "handle-unfinished-tag-operation",
      "refresh-tag-index",
      "show-tag-index-summary",
      "suggest-tags-for-current-note",
      "suggest-tags-for-folder",
      "undo-last-folder-batch",
      "undo-last-tag-curator-change"
    ]);
    expect(plugin.settingTabs).toHaveLength(1);

    const tab = plugin.settingTabs[0];
    tab.display();

    expect(tab.containerEl.textContent).toContain(getLabels("en").settings.feedbackName);
    expect(tab.containerEl.textContent).toContain(getLabels("en").settings.feedbackButton);

    const language = requiredElement(tab.containerEl.querySelector<HTMLSelectElement>("select"));
    setSelectValue(language, "zh-CN");
    await waitFor(() => expect(plugin.settings.uiLanguage).toBe("zh-CN"));
    await waitFor(() => expect(notices).toContain(getLabels("zh-CN").notices.languageChanged));

    const freshInputs = () => Array.from(tab.containerEl.querySelectorAll<HTMLInputElement>("input"));
    const apiBaseUrl = requiredElement(freshInputs().find((input) => input.placeholder.includes("https://api")));
    setInputValue(apiBaseUrl, "https://provider.example/v1");

    const apiKey = requiredElement(freshInputs().find((input) => input.type === "password"));
    setInputValue(apiKey, "sk-e2e");

    const model = requiredElement(freshInputs().find((input) => input.value === "gpt-4o-mini"));
    setInputValue(model, "test-model");

    const slider = requiredElement(tab.containerEl.querySelector<HTMLInputElement>('input[type="range"]'));
    setInputValue(slider, "3");
    const batchLimitSlider = requiredElement(
      Array.from(tab.containerEl.querySelectorAll<HTMLInputElement>('input[type="range"]')).find(
        (input) => input.max === "200"
      )
    );
    setInputValue(batchLimitSlider, "75");

    const toggles = Array.from(tab.containerEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(toggles).toHaveLength(4);
    setCheckboxValue(toggles[0], true);
    setCheckboxValue(toggles[1], false);
    setCheckboxValue(toggles[2], true);
    setCheckboxValue(toggles[3], true);

    await waitFor(() => {
      const data = app.savedData as PluginDataSnapshot;
      expect(data.settings).toMatchObject({
        uiLanguage: "zh-CN",
        apiBaseUrl: "https://provider.example/v1",
        apiKey: "sk-e2e",
        model: "test-model",
        maxRecommendations: 3,
        maxFolderBatchFiles: 75,
        allowNewTags: true,
        readInlineTags: false,
        refreshIndexOnLoad: true,
        devMode: true
      });
    });

    const feedbackButton = requiredElement(
      Array.from(tab.containerEl.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === getLabels("zh-CN").settings.feedbackButton
      )
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    feedbackButton.click();

    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/qmkCamel/obsidian-ai-tag-curator/issues/new",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("refreshes the tag index, shows progress, opens the summary, and supports tag click actions", async () => {
    setMockLanguage("zh-CN");
    const labels = getLabels("zh-CN");
    const app = createFakeApp(sampleNotes(), {
      pluginData: {
        settings: {
          uiLanguage: "zh-CN"
        }
      }
    });
    const plugin = await loadPlugin(app);
    const readGate = createDeferred<void>();
    app.vault.setReadGate(readGate);

    runCommand(plugin, "refresh-tag-index");
    await waitForText(labels.loading.refreshTitle);
    clickButton(labels.loading.minimize);
    expect(pageText()).toContain(labels.loading.refreshMessage);

    readGate.resolve();
    await waitFor(() => {
      const data = app.savedData as PluginDataSnapshot;
      expect(data.tagIndex?.tags.ai).toBeDefined();
      expect(data.tagIndex?.tags.ml_notes).toBeDefined();
      expect(data.tagIndex?.tags["ml-notes"]).toBeDefined();
    });
    await waitForText(labels.summary.title);
    expect(notices.some((notice) => notice.startsWith("已索引 "))).toBe(true);

    clickButton("#ai");
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("#ai");
    });
    const searchLeaf = app.workspace.getLeavesOfType("search")[0];
    await waitFor(() => expect(searchLeaf.queries).toContain("tag:#ai"));
  });

  it("runs AI tag recommendation review, applies selected tags, and undoes the change", async () => {
    setMockLanguage("zh-CN");
    const labels = getLabels("zh-CN");
    const app = createFakeApp(sampleNotes(), {
      activeFilePath: "notes/current.md",
      pluginData: {
        settings: {
          apiKey: "sk-e2e",
          uiLanguage: "zh-CN",
          devMode: true,
          readInlineTags: false
        }
      }
    });
    const plugin = await loadPlugin(app);
    queueAiResponse(
      JSON.stringify({
        recommendations: [
          {
            tag: "research",
            type: "existing",
            confidence: "high",
            reason: "The note discusses research workflow context."
          },
          {
            tag: "learning",
            type: "new",
            confidence: "medium",
            reason: "The note contains durable learning material."
          }
        ],
        warnings: ["Synthetic deterministic e2e response."]
      })
    );

    runCommand(plugin, "suggest-tags-for-current-note");
    await waitForText(labels.recommendations.title);
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    expect(pageText()).toContain(labels.recommendations.devTimingTitle);

    clickButton(labels.recommendations.apply);
    await waitFor(() => {
      expect(app.getNoteTags("notes/current.md")).toEqual(["project/ai", "workflow", "research", "learning"]);
    });
    await waitFor(() => expect(notices).toContain(labels.notices.tagsUpdated));

    runCommand(plugin, "undo-last-tag-curator-change");
    await waitFor(() => {
      expect(app.getNoteTags("notes/current.md")).toEqual(["project/ai"]);
    });
    await waitFor(() => expect(notices).toContain(labels.notices.undoComplete));
  });

  it("runs tag health AI review, keeps evidence usable during loading, applies cleanup, and undoes cleanup", async () => {
    setMockLanguage("zh-CN");
    const labels = getLabels("zh-CN");
    const app = createFakeApp(sampleNotes(), {
      pluginData: {
        settings: {
          apiKey: "sk-e2e",
          uiLanguage: "zh-CN",
          devMode: true
        }
      }
    });
    const plugin = await loadPlugin(app);

    runCommand(plugin, "analyze-tag-health");
    await waitForText(labels.health.title);
    expect(notices).toHaveLength(0);
    expect(pageText()).toContain("AI 行动建议");
    expect(pageText()).not.toContain("优先处理项");
    expect(findButtons(labels.health.workflow.generateAiButton)).toHaveLength(1);

    const aiGate = createDeferred<void>();
    queueAiResponse(
      JSON.stringify({
        summary: "Merge duplicate AI tags first.",
        priorities: [
          {
            issueType: "nearDuplicates",
            tags: ["ml_notes", "ml-notes"],
            severity: "high",
            confidence: "high",
            diagnosis: "ml_notes and ml-notes are the same taxonomy entry.",
            suggestedAction: "merge",
            targetTag: "ml_notes",
            reason: "The difference is only the separator.",
            riskNote: "This e2e only updates frontmatter tags."
          }
        ]
      }),
      aiGate
    );

    clickButton(labels.health.workflow.generateAiButton);
    await waitForText(labels.health.workflow.loadingTitle);
    expect(pageText()).toContain(labels.health.workflow.evidenceTitle);
    clickButton(labels.health.sections.nearDuplicates);
    expect(evidenceLayerText()).toContain(labels.health.workflow.evidenceFileExamples);
    expect(evidenceLayerText()).toContain(labels.health.workflow.evidenceFileExamplesDescription);
    expect(evidenceLayerText()).toContain("#ml_notes / #ml-notes");
    expect(evidenceLayerText()).toContain("notes/hyphen.md");
    expect(evidenceLayerText()).not.toContain(labels.health.cleanupPlan.actionCapability);
    expect(evidenceLayerText()).not.toContain(labels.health.cleanupPlan.after);
    clickButton("notes/hyphen.md");
    expect(app.workspace.getActiveFile()?.path).toBe("notes/hyphen.md");

    aiGate.resolve();
    await waitForText("Merge duplicate AI tags first.");
    const firstRequestCount = requestUrlMock.mock.calls.length;
    const cache = (app.savedData as PluginDataSnapshot).healthAiAnalysisCache;
    expect(cache?.analysis.summary).toBe("Merge duplicate AI tags first.");
    expect(pageText()).toContain(labels.health.workflow.lastAnalyzedAt(formatMonthDayTime(cache?.analyzedAt ?? "")));
    expect(evidenceLayerText()).not.toContain(labels.health.cleanupPlan.aiAssistance);
    expect(evidenceLayerText()).not.toContain(labels.health.cleanupPlan.actionCapability);
    expect(evidenceLayerText()).not.toContain(labels.health.cleanupPlan.after);
    expect(pageText()).toContain(labels.recommendations.devTimingTitle);
    expect(findButtons("查看文件预览")).toHaveLength(0);

    runCommand(plugin, "analyze-tag-health");
    await waitForText("Merge duplicate AI tags first.");
    expect(pageText()).toContain(labels.health.workflow.lastAnalyzedAt(formatMonthDayTime(cache?.analyzedAt ?? "")));
    expect(requestUrlMock).toHaveBeenCalledTimes(firstRequestCount);

    const processWritesBeforeReview = app.vault.getProcessCount();
    const frontmatterWritesBeforeReview = app.fileManager.getWriteCount();
    clickButton(labels.cleanupReview.reviewChanges);
    await waitForText(labels.cleanupReview.title);
    expect(app.vault.getProcessCount()).toBe(processWritesBeforeReview);
    expect(app.fileManager.getWriteCount()).toBe(frontmatterWritesBeforeReview);
    expect(pageText()).toContain(labels.cleanupReview.frontmatterSource);
    expect(pageText()).toContain(labels.cleanupReview.inlineSource);
    const inlineRows = Array.from(document.querySelectorAll<HTMLElement>(".tag-curator-cleanup-review__occurrence"));
    expect(inlineRows.length).toBeGreaterThanOrEqual(2);
    const firstInlineToggle = requiredElement(inlineRows[0].querySelector<HTMLInputElement>('input[type="checkbox"]'));
    firstInlineToggle.checked = false;
    firstInlineToggle.dispatchEvent(new Event("change", { bubbles: true }));
    expect(pageText()).toContain(labels.cleanupReview.partialWarning(1));
    clickButton(labels.cleanupReview.apply);
    await waitForText(labels.cleanupReview.confirmTitle);
    clickButton(labels.cleanupReview.confirmApply);
    await waitForText(labels.cleanupReview.appliedResult);
    await waitFor(() => {
      expect(app.getNoteTags("notes/hyphen.md")).toEqual(["ml-notes"]);
      expect(app.getNoteTags("notes/shared.md")).toEqual(["ml-notes"]);
      expect(app.vault.getNote("notes/hyphen.md").content).toContain("#ml-notes");
      expect(app.vault.getNote("notes/shared.md").content).toBe(
        "Mixed #ml-notes and #ml_notes then #ml-notes and #ml-notes tags."
      );
    });
    await waitFor(() => expect(notices).toContain(labels.health.cleanupPlan.cleanupApplied(2)));

    clickButton(labels.cleanupReview.undo);
    await waitFor(() => {
      expect(app.getNoteTags("notes/hyphen.md")).toEqual(["ml-notes"]);
      expect(app.getNoteTags("notes/shared.md")).toEqual(["ml-notes", "ml_notes"]);
      expect(app.vault.getNote("notes/shared.md").content).toBe(
        "Mixed #ml-notes and #ml_notes then #ml-notes and #ml_notes tags."
      );
    });
    await waitFor(() => expect(notices).toContain(labels.health.cleanupPlan.cleanupUndone));
  });

  it("reports recoverable preconditions and preserves the health report after AI failure", async () => {
    setMockLanguage("zh-CN");
    const labels = getLabels("zh-CN");
    const app = createFakeApp(sampleNotes(), {
      pluginData: {
        settings: {
          uiLanguage: "zh-CN"
        }
      }
    });
    const plugin = await loadPlugin(app);

    runCommand(plugin, "show-tag-index-summary");
    expect(notices).toContain(labels.notices.noTagIndex);

    runCommand(plugin, "suggest-tags-for-current-note");
    expect(notices).toContain(labels.notices.openMarkdownForSuggest);

    app.workspace.setActiveFile(app.vault.getAbstractFileByPath("notes/current.md"));
    runCommand(plugin, "suggest-tags-for-current-note");
    expect(notices).toContain(labels.notices.configureApiKey);

    runCommand(plugin, "undo-last-tag-curator-change");
    expect(notices).toContain(labels.notices.noUndoRecord);

    plugin.settings.apiKey = "sk-e2e";
    runCommand(plugin, "analyze-tag-health");
    await waitForText(labels.health.title);
    queueAiError(new Error("Provider is unavailable."));
    clickButton(labels.health.workflow.generateAiButton);
    await waitFor(() => expect(notices).toContain("Provider is unavailable."));
    expect(pageText()).toContain(labels.health.title);
    expect(pageText()).toContain(labels.health.workflow.evidenceTitle);
    expect(app.getNoteTags("notes/lower.md")).toEqual(["ml_notes"]);
  });

  it("blocks mutation commands behind unresolved cleanup while keeping health analysis readable", async () => {
    setMockLanguage("zh-CN");
    const labels = getLabels("zh-CN");
    const app = createFakeApp(sampleNotes(), {
      activeFilePath: "notes/current.md",
      pluginData: {
        settings: { apiKey: "sk-e2e", uiLanguage: "zh-CN" },
        operations: [
          {
            id: "unresolved-cleanup",
            type: "cleanup",
            schemaVersion: 2,
            status: "recoveryRequired",
            recoveryTarget: "before",
            itemId: "rename",
            title: "Rename",
            action: "rename",
            sourceTags: ["old"],
            targetTag: "new",
            partial: false,
            createdAt: "2026-08-04T00:00:00.000Z",
            files: []
          }
        ]
      }
    });
    const plugin = await loadPlugin(app);
    notices.length = 0;

    runCommand(plugin, "suggest-tags-for-current-note");
    runCommand(plugin, "suggest-tags-for-folder");
    expect(notices.filter((notice) => notice === labels.cleanupReview.unresolvedMutationBlocked)).toHaveLength(2);
    expect(requestUrlMock).not.toHaveBeenCalled();

    runCommand(plugin, "analyze-tag-health");
    await waitForText(labels.health.title);
    expect(pageText()).toContain(labels.health.workflow.evidenceTitle);
  });

  it("keeps legacy frontmatter-only cleanup undo compatible", async () => {
    setMockLanguage("en");
    const app = createFakeApp([{ path: "legacy.md", content: "body #old", frontmatterTags: ["new"] }], {
      pluginData: {
        settings: { uiLanguage: "en" },
        operations: [
          {
            id: "legacy-cleanup",
            type: "cleanup",
            itemId: "legacy",
            title: "Legacy cleanup",
            action: "rename",
            createdAt: "2026-01-01T00:00:00.000Z",
            files: [{ notePath: "legacy.md", beforeTags: ["old"], afterTags: ["new"] }]
          }
        ]
      }
    });
    const plugin = await loadPlugin(app);

    await (plugin as unknown as { undoLatestCleanup(): Promise<void> }).undoLatestCleanup();

    expect(app.getNoteTags("legacy.md")).toEqual(["old"]);
    expect(app.vault.getNote("legacy.md").content).toBe("body #old");
    expect((app.savedData as PluginDataSnapshot).operations).toEqual([]);
  });
});

async function loadPlugin(app: FakeObsidianApp): Promise<LoadedPlugin> {
  vi.doMock("obsidian", () => obsidianMock);
  const module = await import("../../src/main");
  const PluginClass = module.default as unknown as new (app: unknown, manifest: unknown) => LoadedPlugin;
  const plugin = new PluginClass(app, manifest);
  await plugin.onload();
  return plugin;
}

function sampleNotes(): Array<{ path: string; content: string; frontmatterTags?: string[] }> {
  return [
    {
      path: "notes/current.md",
      content: "Semantic search and durable note workflows. #workflow",
      frontmatterTags: ["project/ai"]
    },
    {
      path: "notes/caps.md",
      content: "AI systems and prompt notes.",
      frontmatterTags: ["AI"]
    },
    {
      path: "notes/extra-ai.md",
      content: "Additional AI taxonomy evidence.",
      frontmatterTags: ["AI"]
    },
    {
      path: "notes/lower.md",
      content: "Machine learning implementation notes.",
      frontmatterTags: ["ml_notes"]
    },
    {
      path: "notes/hyphen.md",
      content: "Machine learning taxonomy #ml-notes notes.",
      frontmatterTags: ["ml-notes"]
    },
    {
      path: "notes/shared.md",
      content: "Mixed #ml-notes and #ml_notes then #ml-notes and #ml_notes tags.",
      frontmatterTags: ["ml-notes", "ml_notes"]
    },
    {
      path: "notes/one-off.md",
      content: "Temporary taxonomy experiment.",
      frontmatterTags: ["temporary-long-tag"]
    }
  ];
}

function runCommand(plugin: LoadedPlugin, id: string): void {
  const command = plugin.commands[id];
  expect(command).toBeDefined();
  command.callback?.();
}

async function waitForText(text: string): Promise<void> {
  await waitFor(() => expect(pageText()).toContain(text));
}

async function waitFor(assertion: () => void, timeoutMs = 1500): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

function pageText(): string {
  return document.body.textContent ?? "";
}

function formatMonthDayTime(value: string): string {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function evidenceLayerText(): string {
  const layer = requiredElement(document.querySelector(".tag-curator-health-evidence"));
  return layer.textContent ?? "";
}

function clickButton(text: string): HTMLButtonElement {
  const button = findButtons(text)[0];
  expect(button, `Expected button with text: ${text}`).toBeDefined();
  button.click();
  return button;
}

function findButtons(text: string): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(
    (button) => button.textContent?.trim() === text
  );
}

function requiredElement<T>(value: T | null | undefined): T {
  expect(value).toBeTruthy();
  return value as T;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function setCheckboxValue(input: HTMLInputElement, checked: boolean): void {
  input.checked = checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
