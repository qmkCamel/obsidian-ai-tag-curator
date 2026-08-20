// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TagCuratorSettings } from "../../src/settings/PluginSettings";
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

type LoadedPlugin = {
  onload: () => Promise<void> | void;
  commands: Record<string, { callback?: () => unknown }>;
  settings: TagCuratorSettings;
};

const manifest = {
  id: "ai-tag-curator",
  name: "AI Tag Curator",
  version: "0.0.0-e2e",
  minAppVersion: "1.5.0",
  description: "Folder batch e2e",
  author: "e2e"
};

describe("folder batch e2e", () => {
  beforeEach(() => {
    vi.resetModules();
    installDomHelpers();
    resetObsidianMockState();
    setMockLanguage("zh-CN");
  });

  it("blocks missing active note, blank API key, empty/over-limit work before reads, index work, or requests", async () => {
    const labels = getLabels("zh-CN");
    const noActive = createFakeApp([{ path: "notes/a.md", content: "body" }], {
      pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN" } }
    });
    const noActivePlugin = await loadPlugin(noActive);
    runCommand(noActivePlugin, "suggest-tags-for-folder");
    expect(notices).toContain(labels.notices.openMarkdownForFolderBatch);
    expect(noActive.vault.getReadCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();

    resetObsidianMockState();
    const blankKey = createFakeApp([{ path: "notes/a.md", content: "body" }], {
      activeFilePath: "notes/a.md",
      pluginData: { settings: { apiKey: "   ", uiLanguage: "zh-CN" } }
    });
    const blankPlugin = await loadPlugin(blankKey);
    runCommand(blankPlugin, "suggest-tags-for-folder");
    expect(notices).toContain(labels.notices.configureApiKey);
    expect(blankKey.vault.getReadCount()).toBe(0);

    resetObsidianMockState();
    const overLimit = createFakeApp(
      [
        { path: "notes/a.md", content: "a" },
        { path: "notes/b.md", content: "b" }
      ],
      {
        activeFilePath: "notes/a.md",
        pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN", maxFolderBatchFiles: 1 } }
      }
    );
    const overLimitPlugin = await loadPlugin(overLimit);
    runCommand(overLimitPlugin, "suggest-tags-for-folder");
    await waitForText(labels.folderBatch.overLimit(2, 1));
    expect(button(labels.folderBatch.start).disabled).toBe(true);
    expect(overLimit.vault.getReadCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it("defaults to the active parent, recomputes recursion, and can choose the vault root without requests", async () => {
    const labels = getLabels("zh-CN");
    const app = createFakeApp(
      [
        { path: "notes/current.md", content: "current" },
        { path: "notes/sub/nested.md", content: "nested" },
        { path: "other.md", content: "other" }
      ],
      {
        activeFilePath: "notes/current.md",
        pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN" } }
      }
    );
    const plugin = await loadPlugin(app);
    runCommand(plugin, "suggest-tags-for-folder");
    await waitForText(labels.folderBatch.fileCount(2));
    expect(pageText()).toContain("notes");

    const recursion = requiredElement(document.querySelector<HTMLInputElement>('input[type="checkbox"]'));
    setCheckbox(recursion, false);
    await waitForText(labels.folderBatch.fileCount(1));
    click(labels.folderBatch.chooseFolder);
    await waitForText(labels.folderBatch.rootFolder);
    click(labels.folderBatch.rootFolder);
    await waitForText(labels.folderBatch.fileCount(1));
    setCheckbox(requiredElement(document.querySelector<HTMLInputElement>('input[type="checkbox"]')), true);
    await waitForText(labels.folderBatch.fileCount(3));
    expect(requestUrlMock).not.toHaveBeenCalled();
    expect(app.vault.getReadCount()).toBe(0);
  });

  it("generates, distinguishes sources and risk, applies the selected union without body edits, and undoes after reload", async () => {
    const labels = getLabels("zh-CN");
    const originalCurrent = "body #inline";
    const originalNested = "nested #nested-inline";
    const app = createFakeApp(
      [
        { path: "notes/current.md", content: originalCurrent, frontmatterTags: ["base"] },
        { path: "notes/sub/nested.md", content: originalNested, frontmatterTags: [] },
        { path: "taxonomy.md", content: "taxonomy", frontmatterTags: ["vault/existing"] }
      ],
      {
        activeFilePath: "notes/current.md",
        pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN", allowNewTags: true } }
      }
    );
    const plugin = await loadPlugin(app);
    queueAiResponse(aiResponse([
      { tag: "vault/existing", type: "existing", confidence: "high", reason: "reuse" },
      { tag: "new-topic", type: "new", confidence: "medium", reason: "new taxonomy" }
    ]));
    queueAiResponse(aiResponse([]));

    runCommand(plugin, "suggest-tags-for-folder");
    click(labels.folderBatch.start);
    await waitForText(labels.folderBatch.previewTitle);
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
    expect(pageText()).toContain(labels.folderBatch.frontmatterSource);
    expect(pageText()).toContain(labels.folderBatch.inlineSource);
    expect(pageText()).toContain(labels.folderBatch.aiSource);
    expect(pageText()).toContain(labels.folderBatch.riskMedium);
    const newTagToggle = checkboxForText("#new-topic");
    expect(newTagToggle.checked).toBe(false);
    setCheckbox(newTagToggle, true);

    click(labels.folderBatch.apply);
    await waitForText(labels.folderBatch.confirmTitle);
    click(labels.folderBatch.confirmApply);
    await waitForText(labels.folderBatch.appliedResult);
    expect(app.getNoteTags("notes/current.md")).toEqual(["base", "inline", "vault/existing", "new-topic"]);
    expect(app.getNoteTags("notes/sub/nested.md")).toEqual(["nested-inline"]);
    expect(await app.vault.cachedRead(requiredElement(app.vault.getAbstractFileByPath("notes/current.md")))).toBe(originalCurrent);
    expect(await app.vault.cachedRead(requiredElement(app.vault.getAbstractFileByPath("notes/sub/nested.md")))).toBe(originalNested);

    const persisted = app.savedData;
    const reloaded = createFakeApp(
      [
        { path: "notes/current.md", content: originalCurrent, frontmatterTags: app.getNoteTags("notes/current.md") },
        { path: "notes/sub/nested.md", content: originalNested, frontmatterTags: app.getNoteTags("notes/sub/nested.md") }
      ],
      { activeFilePath: "notes/current.md", pluginData: persisted }
    );
    const reloadedPlugin = await loadPlugin(reloaded);
    runCommand(reloadedPlugin, "undo-last-folder-batch");
    await waitFor(() => expect(reloaded.getNoteTags("notes/current.md")).toEqual(["base"]));
    expect(reloaded.getNoteTags("notes/sub/nested.md")).toEqual([]);
    expect(notices).toContain(labels.notices.folderBatchUndone);
    expect(pageText()).toContain(labels.folderBatch.removedResult);
  });

  it("cancels immediately at two in-flight requests, discards late results, and keeps local sync items", async () => {
    const labels = getLabels("zh-CN");
    const app = createFakeApp(
      ["a", "b", "c", "d"].map((name) => ({ path: `notes/${name}.md`, content: `body #${name}` })),
      {
        activeFilePath: "notes/a.md",
        pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN", allowNewTags: true } }
      }
    );
    const plugin = await loadPlugin(app);
    const first = createDeferred<void>();
    const second = createDeferred<void>();
    queueAiResponse(aiResponse([]), first);
    queueAiResponse(aiResponse([]), second);

    runCommand(plugin, "suggest-tags-for-folder");
    click(labels.folderBatch.start);
    await waitFor(() => expect(requestUrlMock).toHaveBeenCalledTimes(2));
    click(labels.folderBatch.cancel);
    first.resolve();
    second.resolve();
    await waitForText(labels.folderBatch.previewTitle);
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
    expect(pageText()).toContain(labels.folderBatch.aiCancelled);
    expect(pageText()).toContain("#a");
    expect(app.fileManager.getWriteCount()).toBe(0);
  });

  it("uses a local provider without an API key and defaults folder batches to one in-flight request", async () => {
    const labels = getLabels("zh-CN");
    const app = createFakeApp(
      ["a", "b"].map((name) => ({ path: `notes/${name}.md`, content: `body #${name}` })),
      {
        activeFilePath: "notes/a.md",
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
      }
    );
    const plugin = await loadPlugin(app);
    const first = createDeferred<void>();
    queueAiResponse(aiResponse([]), first);
    queueAiResponse(aiResponse([]));

    runCommand(plugin, "suggest-tags-for-folder");
    await waitForText(labels.folderBatch.providerNoticeLoopback("127.0.0.1:11434"));
    click(labels.folderBatch.start);
    await waitFor(() => expect(requestUrlMock).toHaveBeenCalledTimes(1));
    const request = requestUrlMock.mock.calls[0][0] as { headers: Record<string, string>; body: string };
    expect(request.headers.Authorization).toBeUndefined();
    expect(JSON.parse(request.body)).not.toHaveProperty("response_format");
    first.resolve();
    await waitForText(labels.folderBatch.previewTitle);
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
  });

  it("keeps local inline sync review when folder or single-note AI fails", async () => {
    const labels = getLabels("zh-CN");
    const app = createFakeApp([{ path: "notes/a.md", content: "body #inline", frontmatterTags: ["base"] }], {
      activeFilePath: "notes/a.md",
      pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN" } }
    });
    const plugin = await loadPlugin(app);
    queueAiError(new Error("provider failed"));
    runCommand(plugin, "suggest-tags-for-folder");
    click(labels.folderBatch.start);
    await waitForText(labels.folderBatch.aiFailed("provider failed"));
    click(labels.folderBatch.apply);
    click(labels.folderBatch.confirmApply);
    await waitFor(() => expect(app.getNoteTags("notes/a.md")).toEqual(["base", "inline"]));

    const single = createFakeApp([{ path: "a.md", content: "single #local", frontmatterTags: [] }], {
      activeFilePath: "a.md",
      pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN" } }
    });
    resetObsidianMockState();
    const singlePlugin = await loadPlugin(single);
    queueAiError(new Error("single failed"));
    runCommand(singlePlugin, "suggest-tags-for-current-note");
    await waitForText(labels.recommendations.aiFailed("single failed"));
    click(labels.recommendations.apply);
    await waitFor(() => expect(single.getNoteTags("a.md")).toEqual(["local"]));
    expect(await single.vault.cachedRead(requiredElement(single.vault.getAbstractFileByPath("a.md")))).toBe("single #local");
    runCommand(singlePlugin, "undo-last-tag-curator-change");
    await waitFor(() => expect(single.getNoteTags("a.md")).toEqual([]));
  });

  it("retries only failed AI items while preserving successful results and inline selection", async () => {
    const labels = getLabels("zh-CN");
    const app = createFakeApp(
      [
        { path: "notes/a.md", content: "a #inline-a" },
        { path: "notes/b.md", content: "b #inline-b" }
      ],
      {
        activeFilePath: "notes/a.md",
        pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN", allowNewTags: true } }
      }
    );
    const plugin = await loadPlugin(app);
    queueAiError(new Error("first failed"));
    queueAiResponse(aiResponse([{ tag: "existing-b", type: "existing", confidence: "high", reason: "reuse" }]));
    runCommand(plugin, "suggest-tags-for-folder");
    click(labels.folderBatch.start);
    await waitForText(labels.folderBatch.retryFailed);
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
    queueAiResponse(aiResponse([{ tag: "existing-a", type: "existing", confidence: "high", reason: "reuse" }]));
    click(labels.folderBatch.retryFailed);
    await waitForText(labels.folderBatch.previewTitle);
    await waitFor(() => expect(requestUrlMock).toHaveBeenCalledTimes(3));
    expect(pageText()).toContain("#existing-a");
    expect(pageText()).toContain("#existing-b");
    expect(checkboxForText("#inline-a").checked).toBe(true);
  });

  it("blocks stale preview content with zero writes and compensates a post-preflight failure", async () => {
    const labels = getLabels("zh-CN");
    const stale = createFakeApp(
      [
        { path: "notes/a.md", content: "body #inline", frontmatterTags: [] },
        { path: "notes/b.md", content: "other #inline-b", frontmatterTags: [] }
      ],
      {
        activeFilePath: "notes/a.md",
        pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN" } }
      }
    );
    const stalePlugin = await loadPlugin(stale);
    queueAiResponse(aiResponse([]));
    queueAiResponse(aiResponse([]));
    runCommand(stalePlugin, "suggest-tags-for-folder");
    click(labels.folderBatch.start);
    await waitForText(labels.folderBatch.previewTitle);
    click(labels.folderBatch.apply);
    stale.vault.getNote("notes/a.md").content = "changed #inline";
    stale.vault.getNote("notes/b.md").frontmatterTags = ["manual"];
    click(labels.folderBatch.confirmApply);
    await waitForText(labels.folderBatch.conflictResult);
    expect(stale.getNoteTags("notes/a.md")).toEqual([]);
    expect(stale.getNoteTags("notes/b.md")).toEqual(["manual"]);
    expect(stale.fileManager.getWriteCount()).toBe(0);

    resetObsidianMockState();
    const failing = createFakeApp(
      [
        { path: "notes/a.md", content: "a #inline-a", frontmatterTags: [] },
        { path: "notes/b.md", content: "b #inline-b", frontmatterTags: [] }
      ],
      {
        activeFilePath: "notes/a.md",
        pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN" } }
      }
    );
    const failingPlugin = await loadPlugin(failing);
    queueAiResponse(aiResponse([]));
    queueAiResponse(aiResponse([]));
    runCommand(failingPlugin, "suggest-tags-for-folder");
    click(labels.folderBatch.start);
    await waitForText(labels.folderBatch.previewTitle);
    failing.fileManager.setWriteInterceptor((_file, _tags, count) => {
      if (count === 2) throw new Error("injected write failure");
    });
    click(labels.folderBatch.apply);
    click(labels.folderBatch.confirmApply);
    await waitForText(labels.folderBatch.rolledBackResult);
    expect(failing.getNoteTags("notes/a.md")).toEqual([]);
    expect(failing.getNoteTags("notes/b.md")).toEqual([]);
  });

  it("persists target=before after incomplete compensation and retries that fixed direction", async () => {
    const labels = getLabels("zh-CN");
    const app = createFakeApp(
      [
        { path: "notes/a.md", content: "a #inline-a", frontmatterTags: [] },
        { path: "notes/b.md", content: "b #inline-b", frontmatterTags: [] }
      ],
      {
        activeFilePath: "notes/a.md",
        pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN" } }
      }
    );
    const plugin = await loadPlugin(app);
    queueAiResponse(aiResponse([]));
    queueAiResponse(aiResponse([]));
    runCommand(plugin, "suggest-tags-for-folder");
    click(labels.folderBatch.start);
    await waitForText(labels.folderBatch.previewTitle);
    app.fileManager.setWriteInterceptor((_file, _tags, count) => {
      if (count === 2 || count === 3) throw new Error("injected failure");
    });
    click(labels.folderBatch.apply);
    click(labels.folderBatch.confirmApply);
    await waitForText(labels.folderBatch.recoveryResult("before"));
    app.fileManager.setWriteInterceptor(null);
    click(labels.folderBatch.retryRecovery);
    await waitFor(() => {
      expect(app.getNoteTags("notes/a.md")).toEqual([]);
      expect(app.getNoteTags("notes/b.md")).toEqual([]);
    });
  });

  it("fixes target=after when undo compensation fails, blocks new writes, and can finish recovery", async () => {
    const labels = getLabels("zh-CN");
    const app = createFakeApp(
      [
        { path: "notes/a.md", content: "a #inline-a", frontmatterTags: [] },
        { path: "notes/b.md", content: "b #inline-b", frontmatterTags: [] }
      ],
      {
        activeFilePath: "notes/a.md",
        pluginData: { settings: { apiKey: "sk-test", uiLanguage: "zh-CN" } }
      }
    );
    const plugin = await loadPlugin(app);
    queueAiResponse(aiResponse([]));
    queueAiResponse(aiResponse([]));
    runCommand(plugin, "suggest-tags-for-folder");
    click(labels.folderBatch.start);
    await waitForText(labels.folderBatch.previewTitle);
    click(labels.folderBatch.apply);
    click(labels.folderBatch.confirmApply);
    await waitForText(labels.folderBatch.appliedResult);

    const writesBeforeConflict = app.fileManager.getWriteCount();
    app.vault.getNote("notes/b.md").frontmatterTags = ["manual"];
    click(labels.folderBatch.undo);
    await waitForText(labels.folderBatch.conflictResult);
    expect(app.fileManager.getWriteCount()).toBe(writesBeforeConflict);
    expect(app.getNoteTags("notes/a.md")).toEqual(["inline-a"]);
    expect(app.getNoteTags("notes/b.md")).toEqual(["manual"]);
    click(labels.folderBatch.close);
    app.vault.getNote("notes/b.md").frontmatterTags = ["inline-b"];

    app.fileManager.setWriteInterceptor((file, currentTags) => {
      if (file.path === "notes/a.md" && currentTags.includes("inline-a")) {
        throw new Error("undo failed");
      }
      if (file.path === "notes/b.md" && currentTags.length === 0) {
        throw new Error("undo compensation failed");
      }
    });
    runCommand(plugin, "undo-last-folder-batch");
    await waitForText(labels.folderBatch.recoveryResult("after"));
    runCommand(plugin, "suggest-tags-for-folder");
    expect(notices).toContain(labels.notices.unresolvedBatchBlocked);

    app.fileManager.setWriteInterceptor(null);
    click(labels.folderBatch.retryRecovery);
    await waitFor(() => {
      expect(app.getNoteTags("notes/a.md")).toEqual(["inline-a"]);
      expect(app.getNoteTags("notes/b.md")).toEqual(["inline-b"]);
    });
    runCommand(plugin, "undo-last-folder-batch");
    await waitFor(() => {
      expect(app.getNoteTags("notes/a.md")).toEqual([]);
      expect(app.getNoteTags("notes/b.md")).toEqual([]);
    });
  });

  it.each([
    ["applying", "before"],
    ["undoing", "after"]
  ] as const)("reconciles a mixed %s record on reload to fixed target %s", async (status, target) => {
    const labels = getLabels("zh-CN");
    const app = createFakeApp(
      [
        { path: "notes/a.md", content: "a", frontmatterTags: ["before"] },
        { path: "notes/b.md", content: "b", frontmatterTags: ["before", "after"] }
      ],
      {
        activeFilePath: "notes/a.md",
        pluginData: {
          settings: { apiKey: "sk-test", uiLanguage: "zh-CN" },
          operations: [batchRecord(status)]
        }
      }
    );
    await loadPlugin(app);
    await waitForText(labels.folderBatch.recoveryResult(target));
    click(labels.folderBatch.retryRecovery);
    await waitFor(() => {
      if (target === "before") {
        expect(app.getNoteTags("notes/a.md")).toEqual(["before"]);
        expect(app.getNoteTags("notes/b.md")).toEqual(["before"]);
      } else {
        expect(app.getNoteTags("notes/a.md")).toEqual(["before", "after"]);
        expect(app.getNoteTags("notes/b.md")).toEqual(["before", "after"]);
      }
    });
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

function runCommand(plugin: LoadedPlugin, id: string): void {
  const command = plugin.commands[id];
  expect(command).toBeDefined();
  command.callback?.();
}

function aiResponse(recommendations: unknown[]): string {
  return JSON.stringify({ recommendations, warnings: [] });
}

function batchRecord(status: "applying" | "undoing") {
  return {
    id: `batch-${status}`,
    type: "batch",
    status,
    folderPath: "notes",
    includeSubfolders: true,
    indexUpdatedAt: "2026-08-04T00:00:00.000Z",
    settings: {
      providerType: "openai-compatible",
      providerPreset: "openai",
      model: "model",
      supportsJsonMode: true,
      providerConcurrency: 2,
      promptProfile: "default",
      maxRecommendations: 5,
      maxFolderBatchFiles: 50,
      allowNewTags: false,
      newTagStrictness: "strict",
      uiLanguage: "zh-CN"
    },
    createdAt: "2026-08-04T00:00:00.000Z",
    files: ["notes/a.md", "notes/b.md"].map((notePath) => ({
      notePath,
      beforeTags: ["before"],
      afterTags: ["before", "after"],
      syncedInlineTags: ["after"],
      aiAddedTags: []
    }))
  };
}

function pageText(): string {
  return document.body.textContent ?? "";
}

function button(text: string): HTMLButtonElement {
  return requiredElement(
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.textContent?.trim() === text
    )
  );
}

function click(text: string): void {
  button(text).click();
}

function checkboxForText(text: string): HTMLInputElement {
  const setting = Array.from(document.querySelectorAll<HTMLElement>(".setting-item")).find((item) =>
    item.textContent?.includes(text)
  );
  return requiredElement(setting?.querySelector<HTMLInputElement>('input[type="checkbox"]'));
}

function setCheckbox(input: HTMLInputElement, checked: boolean): void {
  input.checked = checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitForText(text: string): Promise<void> {
  await waitFor(() => expect(pageText()).toContain(text));
}

async function waitFor(assertion: () => void, timeoutMs = 2500): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError;
}

function requiredElement<T>(value: T | null | undefined): T {
  expect(value).toBeTruthy();
  return value as T;
}
