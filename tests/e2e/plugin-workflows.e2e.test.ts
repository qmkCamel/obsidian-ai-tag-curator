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
    getSettingDefinitions?: () => Array<{
      heading: string;
      items: Array<{ name: string; visible?: boolean | (() => boolean) }>;
    }>;
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

    const definitions = tab.getSettingDefinitions?.() ?? [];
    const searchableNames = definitions.flatMap((group) => group.items.map((item) => item.name));
    expect(searchableNames).toEqual(
      expect.arrayContaining([
        getLabels("en").settings.languageName,
        getLabels("en").settings.providerPresetName,
        getLabels("en").settings.providerTypeName,
        getLabels("en").settings.apiBaseUrlName,
        getLabels("en").settings.modelName,
        getLabels("en").settings.apiKeyName,
        getLabels("en").settings.providerTestName,
        getLabels("en").settings.supportsJsonModeName,
        getLabels("en").settings.promptProfileName,
        getLabels("en").settings.providerConcurrencyName,
        getLabels("en").settings.maxRecommendationsName,
        getLabels("en").settings.allowNewTagsName,
        getLabels("en").settings.newTagStrictnessName,
        getLabels("en").settings.maxFolderBatchFilesName,
        getLabels("en").settings.readInlineTagsName,
        getLabels("en").settings.refreshIndexOnLoadName,
        getLabels("en").settings.devModeName,
        getLabels("en").settings.feedbackName
      ])
    );

    expect(tab.containerEl.textContent).toContain(getLabels("en").settings.feedbackName);
    expect(tab.containerEl.textContent).toContain(getLabels("en").settings.feedbackButton);
    expect(tab.containerEl.textContent).toContain(getLabels("en").settings.sectionGeneral);
    expect(tab.containerEl.textContent).toContain(getLabels("en").settings.sectionProvider);
    expect(tab.containerEl.textContent).toContain(getLabels("en").settings.sectionProviderAdvanced);
    expect(tab.containerEl.textContent).toContain(getLabels("en").settings.sectionRecommendations);
    expect(tab.containerEl.textContent).toContain(getLabels("en").settings.sectionIndexing);
    expect(tab.containerEl.textContent).toContain(getLabels("en").settings.sectionDiagnostics);
    expect(requiredElement(tab.containerEl.querySelector<HTMLDetailsElement>("details")).open).toBe(false);
    expect(
      Array.from(tab.containerEl.querySelectorAll<HTMLSelectElement>("select")).some((select) =>
        Array.from(select.options).some((option) => option.value === "local-openai-compatible")
      )
    ).toBe(false);
    expect(tab.containerEl.textContent).not.toContain(getLabels("en").settings.newTagStrictnessName);

    const language = requiredElement(tab.containerEl.querySelector<HTMLSelectElement>("select"));
    setSelectValue(language, "zh-CN");
    await waitFor(() => expect(plugin.settings.uiLanguage).toBe("zh-CN"));
    await waitFor(() => expect(notices).toContain(getLabels("zh-CN").notices.languageChanged));

    const customPreset = Array.from(tab.containerEl.querySelectorAll<HTMLSelectElement>("select")).find((select) =>
      Array.from(select.options).some((option) => option.value === "custom")
    );
    setSelectValue(requiredElement(customPreset), "custom");
    await waitFor(() => expect(plugin.settings.providerPreset).toBe("custom"));
    await waitFor(() =>
      expect(
        Array.from(tab.containerEl.querySelectorAll<HTMLInputElement>("input")).find(
          (input) => input.placeholder.includes("https://api") && !input.disabled
        )
      ).toBeTruthy()
    );

    const freshInputs = () => Array.from(tab.containerEl.querySelectorAll<HTMLInputElement>("input"));
    const apiBaseUrl = requiredElement(
      freshInputs().find((input) => input.placeholder.includes("https://api") && !input.disabled)
    );
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
    expect(toggles).toHaveLength(5);
    setCheckboxValue(toggles[1], true);
    setCheckboxValue(toggles[2], false);
    setCheckboxValue(toggles[3], true);
    setCheckboxValue(toggles[4], true);

    await waitFor(() => {
      const data = app.savedData as PluginDataSnapshot;
      expect(data.settings).toMatchObject({
        uiLanguage: "zh-CN",
        apiBaseUrl: "https://provider.example/v1",
        apiKey: "sk-e2e",
        model: "test-model",
        providerType: "openai-compatible",
        providerPreset: "custom",
        supportsJsonMode: true,
        providerConcurrency: 2,
        promptProfile: "default",
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
          devMode: true
        }
      }
    });
    const plugin = await loadPlugin(app);
    const recommendationGate = createDeferred<void>();
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
      }),
      recommendationGate
    );

    runCommand(plugin, "suggest-tags-for-current-note");
    await waitForText(labels.loading.suggestRequestProvider);
    clickButton(labels.loading.minimize);
    expect(pageText()).toContain(labels.loading.suggestTitle);
    expect(findButtons(labels.loading.expand)).toHaveLength(1);
    app.workspace.setActiveFile(app.vault.getAbstractFileByPath("notes/hyphen.md"));
    expect(app.workspace.getActiveFile()?.path).toBe("notes/hyphen.md");

    recommendationGate.resolve();
    await waitForText(labels.recommendations.devTimingTitle);
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    expect(pageText()).toContain(labels.recommendations.devTimingTitle);

    clickButton(labels.recommendations.apply);
    await waitFor(() => {
      expect(app.getNoteTags("notes/current.md")).toEqual(["project/ai", "workflow", "research", "learning"]);
    });
    await waitFor(() => expect(notices).toContain(labels.notices.tagsUpdated));

    app.workspace.setActiveFile(app.vault.getAbstractFileByPath("notes/current.md"));
    runCommand(plugin, "undo-last-tag-curator-change");
    await waitFor(() => {
      expect(app.getNoteTags("notes/current.md")).toEqual(["project/ai"]);
    });
    await waitFor(() => expect(notices).toContain(labels.notices.undoComplete));
  });

  it("keeps recommendation progress visible, blocks duplicates, and discards a cancelled late result", async () => {
    setMockLanguage("zh-CN");
    const labels = getLabels("zh-CN");
    const app = createFakeApp(sampleNotes(), {
      activeFilePath: "notes/current.md",
      pluginData: {
        settings: {
          providerType: "local-openai-compatible",
          apiBaseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          model: "qwen3:4b",
          uiLanguage: "zh-CN"
        }
      }
    });
    const plugin = await loadPlugin(app);
    const lateResultGate = createDeferred<void>();
    queueAiResponse(
      JSON.stringify({
        recommendations: [{ tag: "research", type: "existing", confidence: "high", reason: "late" }],
        warnings: []
      }),
      lateResultGate
    );

    runCommand(plugin, "suggest-tags-for-current-note");
    await waitForText(labels.loading.suggestRequestProvider);
    expect(pageText()).toContain(labels.loading.suggestModel("qwen3:4b"));
    expect(pageText()).toContain(labels.loading.suggestElapsed("0:00"));

    app.workspace.setActiveFile(app.vault.getAbstractFileByPath("notes/hyphen.md"));
    runCommand(plugin, "suggest-tags-for-current-note");
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    expect(notices).toContain(labels.notices.suggestAlreadyRunning);

    clickButton(labels.loading.suggestCancel);
    expect(pageText()).toContain(labels.loading.suggestCancelled);
    expect(requiredElement(findButtons(labels.loading.suggestCancel)[0]).disabled).toBe(true);
    runCommand(plugin, "suggest-tags-for-current-note");
    expect(requestUrlMock).toHaveBeenCalledTimes(1);

    lateResultGate.resolve();
    await waitFor(() => expect(pageText()).not.toContain(labels.loading.suggestTitle));
    expect(pageText()).not.toContain(labels.recommendations.title);
    expect(app.getNoteTags("notes/current.md")).toEqual(["project/ai"]);
    expect(app.fileManager.getWriteCount()).toBe(0);

    app.workspace.setActiveFile(app.vault.getAbstractFileByPath("notes/current.md"));
    queueAiResponse(
      JSON.stringify({
        recommendations: [{ tag: "research", type: "existing", confidence: "high", reason: "retry" }],
        warnings: []
      })
    );
    runCommand(plugin, "suggest-tags-for-current-note");
    await waitFor(() => expect(findButtons(labels.recommendations.apply)).toHaveLength(1));
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
  });

  it("runs current-note recommendations against a local provider without an API key", async () => {
    setMockLanguage("zh-CN");
    const labels = getLabels("zh-CN");
    const app = createFakeApp(sampleNotes(), {
      activeFilePath: "notes/current.md",
      pluginData: {
        settings: {
          providerType: "local-openai-compatible",
          apiBaseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          model: "qwen3:4b",
          supportsJsonMode: false,
          uiLanguage: "zh-CN"
        }
      }
    });
    const plugin = await loadPlugin(app);
    queueAiResponse(
      JSON.stringify({
        recommendations: [{ tag: "research", type: "existing", confidence: "high", reason: "reuse" }],
        warnings: []
      })
    );

    runCommand(plugin, "suggest-tags-for-current-note");
    await waitFor(() => expect(findButtons(labels.recommendations.apply)).toHaveLength(1));
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    const request = requestUrlMock.mock.calls[0][0] as { headers: Record<string, string>; body: string };
    expect(request.headers.Authorization).toBeUndefined();
    expect(JSON.parse(request.body)).not.toHaveProperty("response_format");
  });

  it("does not write files when a local provider returns non-JSON content", async () => {
    setMockLanguage("zh-CN");
    const app = createFakeApp([{ path: "notes/current.md", content: "body", frontmatterTags: [] }], {
      activeFilePath: "notes/current.md",
      pluginData: {
        settings: {
          providerType: "local-openai-compatible",
          apiBaseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          model: "qwen3:4b",
          supportsJsonMode: false,
          uiLanguage: "zh-CN"
        }
      }
    });
    const plugin = await loadPlugin(app);
    queueAiResponse("plain text");

    runCommand(plugin, "suggest-tags-for-current-note");
    await waitFor(() => expect(notices).toContain("AI response must be valid JSON."));
    expect(app.getNoteTags("notes/current.md")).toEqual([]);
    expect(app.fileManager.getWriteCount()).toBe(0);
  });

  it("closes progress and preserves local inline sync items after provider failure", async () => {
    setMockLanguage("zh-CN");
    const labels = getLabels("zh-CN");
    const app = createFakeApp(sampleNotes(), {
      activeFilePath: "notes/current.md",
      pluginData: {
        settings: {
          providerType: "local-openai-compatible",
          apiBaseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          model: "qwen3:4b",
          uiLanguage: "zh-CN"
        }
      }
    });
    const plugin = await loadPlugin(app);
    queueAiError(new Error("Provider is unavailable."));

    runCommand(plugin, "suggest-tags-for-current-note");
    await waitForText(labels.recommendations.aiFailed("Provider is unavailable."));
    expect(pageText()).toContain(labels.recommendations.aiFailed("Provider is unavailable."));
    expect(pageText()).toContain("#workflow");
    expect(pageText()).not.toContain(labels.loading.suggestTitle);
    expect(app.getNoteTags("notes/current.md")).toEqual(["project/ai"]);
    expect(app.fileManager.getWriteCount()).toBe(0);
  });

  it("tests a local provider from settings only after the user clicks the test button", async () => {
    setMockLanguage("en");
    const labels = getLabels("en");
    const app = createFakeApp(sampleNotes(), {
      pluginData: { settings: { uiLanguage: "en" } }
    });
    const plugin = await loadPlugin(app);
    const tab = plugin.settingTabs[0];
    tab.display();
    expect(requestUrlMock).not.toHaveBeenCalled();

    const presetSelect = Array.from(tab.containerEl.querySelectorAll<HTMLSelectElement>("select")).find((select) =>
      Array.from(select.options).some((option) => option.value === "ollama")
    );
    setSelectValue(requiredElement(presetSelect), "ollama");
    await waitFor(() => expect(plugin.settings.providerPreset).toBe("ollama"));
    await waitFor(() =>
      expect(
        Array.from(tab.containerEl.querySelectorAll<HTMLInputElement>("input")).find(
          (input) => input.type === "text" && !input.disabled && input.value === ""
        )
      ).toBeTruthy()
    );
    const model = requiredElement(
      Array.from(tab.containerEl.querySelectorAll<HTMLInputElement>("input")).find(
        (input) => input.type === "text" && !input.disabled && input.value === ""
      )
    );
    setInputValue(model, "qwen3:4b");
    queueAiResponse(JSON.stringify({ models: [] }));
    queueAiResponse(JSON.stringify({ ok: true }));

    requiredElement(
      Array.from(tab.containerEl.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === labels.settings.providerTestButton
      )
    ).click();
    await waitFor(() => expect(notices).toContain(labels.notices.providerTestSucceeded("qwen3:4b", "disabled")));
    await waitFor(() => expect(tab.containerEl.textContent).toContain("Connection succeeded"));
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
  });

  it("keeps provider-test progress local, supports unrelated settings, and discards a late result after cancellation", async () => {
    setMockLanguage("en");
    const labels = getLabels("en");
    const app = createFakeApp(sampleNotes(), {
      pluginData: {
        settings: {
          uiLanguage: "en",
          providerType: "local-openai-compatible",
          providerPreset: "ollama",
          apiBaseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          model: "qwen3.8:27b",
          supportsJsonMode: true,
          providerConcurrency: 1,
          promptProfile: "edge-small"
        }
      }
    });
    const plugin = await loadPlugin(app);
    const tab = plugin.settingTabs[0];
    tab.display();
    const chatGate = createDeferred<void>();
    queueAiResponse(JSON.stringify({ models: [] }));
    queueAiResponse(JSON.stringify({ ok: true }), chatGate);

    findSettingButton(tab.containerEl, labels.settings.providerTestButton).click();
    await waitFor(() => expect(requestUrlMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(tab.containerEl.textContent).toContain(labels.settings.providerTestStageChat));
    expect(findSettingButton(tab.containerEl, labels.settings.providerTestRunning).disabled).toBe(true);
    expect(tab.containerEl.textContent).toContain("qwen3.8:27b");
    expect(tab.containerEl.textContent).toContain("00:00");

    const allowNewTags = findSettingInput(tab.containerEl, labels.settings.allowNewTagsName, 'input[type="checkbox"]');
    setCheckboxValue(allowNewTags, true);
    await waitFor(() => expect(plugin.settings.allowNewTags).toBe(true));
    await waitFor(() => expect(tab.containerEl.textContent).toContain(labels.settings.providerTestStageChat));
    expect(tab.containerEl.textContent).toContain(labels.settings.newTagStrictnessName);

    findSettingButton(tab.containerEl, labels.settings.providerTestRunning).click();
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
    findSettingButton(tab.containerEl, labels.settings.providerTestCancelButton).click();
    await waitFor(() => expect(tab.containerEl.textContent).toContain(labels.settings.providerTestCancelRequested));
    expect(findSettingButton(tab.containerEl, labels.settings.providerTestRunning).disabled).toBe(true);

    chatGate.resolve();
    await waitFor(() => expect(tab.containerEl.textContent).toContain("Test cancelled"));
    expect(tab.containerEl.textContent).not.toContain("Connection succeeded");
    expect(notices).not.toContain(labels.notices.providerTestSucceeded("qwen3.8:27b", "enabled"));
  });

  it("keeps provider settings after a connection-test failure and renders a recoverable inline result", async () => {
    setMockLanguage("en");
    const labels = getLabels("en");
    const app = createFakeApp(sampleNotes(), {
      pluginData: {
        settings: {
          uiLanguage: "en",
          providerType: "local-openai-compatible",
          providerPreset: "ollama",
          apiBaseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          model: "qwen3.8:27b"
        }
      }
    });
    const plugin = await loadPlugin(app);
    const tab = plugin.settingTabs[0];
    tab.display();
    const before = { ...plugin.settings };
    queueAiResponse(JSON.stringify({ models: [] }));
    queueAiError(new Error("404 model not found"));

    findSettingButton(tab.containerEl, labels.settings.providerTestButton).click();
    await waitFor(() => expect(tab.containerEl.textContent).toContain("Connection failed"));

    expect(tab.containerEl.textContent).toContain("model-error");
    expect(plugin.settings).toEqual(before);
    expect(findSettingButton(tab.containerEl, labels.settings.providerTestButton).disabled).toBe(false);
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

    clickButton(labels.health.cleanupPlan.applyThisSuggestion);
    await waitFor(() => {
      expect(app.getNoteTags("notes/hyphen.md")).toEqual(["ml_notes"]);
      expect(app.getNoteTags("notes/shared.md")).toEqual(["ml_notes"]);
    });
    await waitFor(() => expect(notices).toContain(labels.health.cleanupPlan.cleanupApplied(2)));

    clickButton(labels.health.cleanupPlan.undoThisOperation);
    await waitFor(() => {
      expect(app.getNoteTags("notes/hyphen.md")).toEqual(["ml-notes"]);
      expect(app.getNoteTags("notes/shared.md")).toEqual(["ml-notes", "ml_notes"]);
    });
    await waitFor(() => expect(notices).toContain(labels.health.cleanupPlan.cleanupUndone));
  });

  it("runs tag health AI against a local provider without an API key", async () => {
    setMockLanguage("zh-CN");
    const labels = getLabels("zh-CN");
    const app = createFakeApp(sampleNotes(), {
      pluginData: {
        settings: {
          providerType: "local-openai-compatible",
          apiBaseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          model: "qwen3:4b",
          supportsJsonMode: false,
          uiLanguage: "zh-CN"
        }
      }
    });
    const plugin = await loadPlugin(app);

    runCommand(plugin, "analyze-tag-health");
    await waitForText(labels.health.title);
    queueAiResponse(
      JSON.stringify({
        summary: "Local health summary.",
        priorities: []
      })
    );
    clickButton(labels.health.workflow.generateAiButton);
    await waitForText("Local health summary.");
    const request = requestUrlMock.mock.calls[0][0] as { headers: Record<string, string>; body: string };
    expect(request.headers.Authorization).toBeUndefined();
    expect(JSON.parse(request.body)).not.toHaveProperty("response_format");
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
      content: "Machine learning taxonomy notes.",
      frontmatterTags: ["ml-notes"]
    },
    {
      path: "notes/shared.md",
      content: "Mixed separator duplicate tags.",
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

function findSettingButton(containerEl: HTMLElement, text: string): HTMLButtonElement {
  return requiredElement(
    Array.from(containerEl.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === text
    )
  );
}

function findSettingInput(containerEl: HTMLElement, name: string, selector: string): HTMLInputElement {
  const setting = requiredElement(
    Array.from(containerEl.querySelectorAll<HTMLElement>(".setting-item")).find(
      (item) => item.querySelector(".setting-item-name")?.textContent?.trim() === name
    )
  );
  return requiredElement(setting.querySelector<HTMLInputElement>(selector));
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
