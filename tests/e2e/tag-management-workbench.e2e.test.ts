// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLabels } from "../../src/ui/labels";
import { getManagementLabels } from "../../src/ui/managementLabels";
import type { TagManagementAdapter } from "../../src/management/TagManagementView";
import type { CleanupOperationRecordV2, OperationLog } from "../../src/operations/OperationLog";
import type { CachedTagHealthAiAnalysis } from "../../src/health/TagHealthAiAnalysis";
import type { PluginDataStore } from "../../src/operations/PluginDataStore";
import type { TagIndex } from "../../src/index/TagIndex";
import type { TagIndexService } from "../../src/index/TagIndexService";
import type { MutationCoordinator } from "../../src/policy/MutationCoordinator";
import { hashContent } from "../../src/utils/hashContent";
import {
  createDeferred, createFakeApp, getFrontMatterInfo, installDomHelpers, markdownBody, obsidianMock,
  notices, openModals, parseYaml, queueAiResponse, requestUrlMock, resetObsidianMockState, withFrontmatter,
  type FakeObsidianApp, type Plugin, type WorkspaceLeaf
} from "./obsidian-harness";

type PersistedData = {
  tagIndex?: TagIndex;
  operations?: ReturnType<OperationLog["toJSON"]>;
  healthAiAnalysisCache?: unknown;
  tagMutationPolicy?: { revision: number; excludedFolders: string[] };
};

type LoadedPlugin = Plugin & {
  onload(): Promise<void>;
  operationLog: OperationLog;
  coordinator: MutationCoordinator;
  isRecoveryPath(path: string): boolean;
  settings: { operationLogLimit: number };
  healthAiAnalysisCache: CachedTagHealthAiAnalysis | undefined;
  managementScopeRevision: number;
  tagIndex: TagIndex | undefined;
  dataStore: PluginDataStore<PersistedData>;
  indexService: Pick<TagIndexService, "getSnapshot" | "subscribe"> & { persistTail: Promise<void> };
  managementAdapter(): TagManagementAdapter;
  savePluginData(): Promise<void>;
};

const labels = getManagementLabels("en");
const cleanupLabels = getLabels("en").cleanupReview;
const viewType = "tag-curator-management";
const loaded: LoadedPlugin[] = [];

beforeEach(() => { vi.resetModules(); installDomHelpers(); resetObsidianMockState(); });
afterEach(() => { for (const plugin of loaded.splice(0)) plugin.unload(); });

async function load(app: FakeObsidianApp): Promise<LoadedPlugin> {
  vi.doMock("obsidian", () => obsidianMock);
  const module = await import("../../src/main");
  const PluginClass = module.default as unknown as new (app: FakeObsidianApp, manifest: unknown) => LoadedPlugin;
  const plugin = new PluginClass(app, { id: "ai-tag-curator", name: "AI Tag Curator", version: "0.0.0-e2e", minAppVersion: "1.5.0" });
  await plugin.onload();
  loaded.push(plugin);
  return plugin;
}

function appWithNotes(notes = [{ path: "Notes/a.md", content: withFrontmatter("Body #Old and #KeepCase.\n", { tags: ["Old", "KeepCase", "KeepCase"], nested: { enabled: true, count: 2 }, description: "line one\nline two\n" }) }], extra: Record<string, unknown> = {}) {
  return createFakeApp(notes, { activeFilePath: null, pluginData: { settings: { uiLanguage: "en", refreshIndexOnLoad: false, apiKey: "" }, ...extra } });
}

async function openWorkbench(plugin: LoadedPlugin): Promise<WorkspaceLeaf> {
  plugin.commands["open-tag-manager"].callback!();
  await vi.waitFor(() => expect(plugin.app.workspace.getLeavesOfType(viewType)[0]?.view?.contentEl.textContent).toContain(labels.title));
  return plugin.app.workspace.getLeavesOfType(viewType)[0];
}

function button(label: string, root: ParentNode = document): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(element => element.getAttribute("aria-label") === label || element.textContent === label);
  expect(button, `button ${label}`).toBeDefined();
  return button!;
}

function input(label: string): HTMLInputElement {
  const input = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find(element => element.getAttribute("aria-label") === label);
  expect(input, `input ${label}`).toBeDefined();
  return input!;
}

async function refresh(plugin: LoadedPlugin, leaf: WorkspaceLeaf): Promise<void> {
  button(labels.refresh, leaf.view!.contentEl).click();
  await vi.waitFor(() => expect(plugin.managementAdapter().getState().freshness).toBe("ready"));
  await vi.waitFor(() => expect(button(labels.refresh, leaf.view!.contentEl).disabled).toBe(false));
}

async function reviewRename(plugin: LoadedPlugin, leaf: WorkspaceLeaf): Promise<void> {
  const row = leaf.view!.contentEl.querySelector<HTMLElement>('[data-tag="old"]')!;
  expect(row).not.toBeNull();
  row.querySelector<HTMLButtonElement>("button")!.click();
  button(labels.rename, leaf.view!.contentEl).click();
  const target = input(labels.target);
  target.value = "New/Name";
  target.dispatchEvent(new Event("input", { bubbles: true }));
  input(labels.scopeConsent).click();
  button(labels.preview).click();
  await vi.waitFor(() => expect(openModals.some(modal => modal.titleEl.textContent === cleanupLabels.title)).toBe(true));
  expect(plugin.app.vault.getProcessCount()).toBe(0);
}

describe("workbench plugin integration with real Markdown", () => {
  it("opens without an API key or active note, reuses its leaf and releases listeners on unload", async () => {
    const app = appWithNotes();
    const baseline = app.vault.listenerCount();
    const plugin = await load(app);
    const leaf = await openWorkbench(plugin);
    const firstView = leaf.view;
    await openWorkbench(plugin);
    plugin.ribbonIcons[0].click();
    await Promise.resolve();
    expect(app.workspace.getLeavesOfType(viewType)).toHaveLength(1);
    expect(leaf.view).toBe(firstView);
    expect(app.workspace.getActiveFile()).toBeNull();
    expect(app.vault.getReadCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
    expect(app.vault.listenerCount()).toBe(baseline + 4);
    expect(app.metadataCache.listenerCount()).toBe(2);
    plugin.unload();
    expect(app.workspace.getLeavesOfType(viewType)).toHaveLength(0);
    expect(app.vault.listenerCount()).toBe(baseline);
    expect(app.metadataCache.listenerCount()).toBe(0);
    expect(document.querySelector(".tag-curator-workbench")).toBeNull();
  });

  it("manually renames mixed YAML/inline tags, persists intent before writing, and undoes after reload", async () => {
    const app = appWithNotes();
    const original = app.vault.getNote("Notes/a.md").content;
    const beforeProperties = parseYaml(getFrontMatterInfo(original).frontmatter) as Record<string, unknown>;
    const plugin = await load(app);
    const leaf = await openWorkbench(plugin);
    await refresh(plugin, leaf);
    await reviewRename(plugin, leaf);
    let intentChecks = 0;
    app.vault.setProcessInterceptor(() => {
      const data = app.pluginData as { operations: Array<{ status: string; origin: string; files: unknown[] }> };
      expect(data.operations[0]).toMatchObject({ status: "applying", origin: "manual" });
      expect(data.operations[0].files).toHaveLength(1);
      intentChecks++;
    });
    button(cleanupLabels.apply).click();
    button(cleanupLabels.confirmApply).click();
    await vi.waitFor(() => expect(plugin.operationLog.latestCleanupV2()?.status).toBe("applied"));
    await vi.waitFor(() => expect(plugin.managementAdapter().getState().freshness).toBe("ready"));
    expect(intentChecks).toBe(2);
    expect(app.fileManager.getWriteCount()).toBe(0);
    const applied = app.vault.getNote("Notes/a.md").content;
    expect(app.getNoteTags("Notes/a.md")).toEqual(["New/Name", "KeepCase", "KeepCase"]);
    expect(markdownBody(applied)).toBe("Body #New/Name and #KeepCase.\n");
    expect(parseYaml(getFrontMatterInfo(applied).frontmatter)).toEqual({ ...beforeProperties, tags: ["New/Name", "KeepCase", "KeepCase"] });
    expect(requestUrlMock).not.toHaveBeenCalled();

    plugin.unload();
    for (const modal of [...openModals]) modal.close();
    const reloadedApp = appWithNotes([{ path: "Notes/a.md", content: applied }], app.savedData as Record<string, unknown>);
    const reloaded = await load(reloadedApp);
    const historyLeaf = await openWorkbench(reloaded);
    button(labels.history, historyLeaf.view!.contentEl).click();
    const operationId = reloaded.operationLog.latest()!.id;
    historyLeaf.view!.contentEl.querySelector<HTMLButtonElement>(`[data-focus="history-${operationId}"]`)!.click();
    button(labels.undo, historyLeaf.view!.contentEl).click();
    button(labels.confirmUndo).click();
    await vi.waitFor(() => expect(reloaded.operationLog.toJSON()).toHaveLength(0));
    expect(reloadedApp.vault.getNote("Notes/a.md").content).toBe(original);
    expect(reloaded.operationLog.receiptsToJSON()[0]).toMatchObject({ origin: "manual", status: "undone" });
    expect(reloaded.operationLog.receiptsToJSON()[0].files[0].inlineChanges).toEqual([{ before: "#Old", after: "#New/Name" }]);
    await vi.waitFor(() => expect((reloadedApp.savedData as { receipts: unknown[] }).receipts).toHaveLength(1));
    expect(JSON.stringify(reloaded.operationLog.receiptsToJSON())).not.toMatch(/inlineEdits|beforeText|context|description/);
    await vi.waitFor(() => expect(reloaded.managementAdapter().getState().freshness).toBe("ready"));
    reloaded.unload();
    for (const modal of [...openModals]) modal.close();
    const receiptApp = appWithNotes([{ path: "Notes/a.md", content: original }], reloadedApp.savedData as Record<string, unknown>);
    const receiptPlugin = await load(receiptApp);
    const receiptLeaf = await openWorkbench(receiptPlugin);
    button(labels.history, receiptLeaf.view!.contentEl).click();
    receiptLeaf.view!.contentEl.querySelector<HTMLButtonElement>(`[data-focus="history-${operationId}"]`)!.click();
    expect(receiptPlugin.managementAdapter().getState().history[0]).toMatchObject({ status: "undone", canUndo: false, canRecover: false, files: [{ inlineChanges: [{ before: "#Old", after: "#New/Name" }] }] });
    expect(receiptLeaf.view!.contentEl.textContent).toContain("#Old");
    expect(receiptLeaf.view!.contentEl.textContent).toContain("#New/Name");
    expect(receiptApp.vault.getReadCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it("reprojects restored recovery evidence after a failed finalization save while a view is subscribed", async () => {
    const app = appWithNotes();
    const plugin = await load(app);
    const leaf = await openWorkbench(plugin);
    await refresh(plugin, leaf);
    await reviewRename(plugin, leaf);
    button(cleanupLabels.apply).click();
    button(cleanupLabels.confirmApply).click();
    await vi.waitFor(() => expect(plugin.operationLog.latestCleanupV2()?.status).toBe("applied"));
    await vi.waitFor(() => expect(plugin.coordinator.busy).toBe(false));
    const adapter = plugin.managementAdapter();
    const id = plugin.operationLog.latest()!.id;
    plugin.operationLog.updateCleanupStatus(id, "undoing");
    await plugin.savePluginData();
    const observed: string[] = [];
    const unsubscribe = adapter.subscribe(() => { observed.push(adapter.getState().history[0]?.status ?? "empty"); });
    const saveData = plugin.saveData.bind(plugin);
    vi.spyOn(plugin, "saveData").mockImplementation(async data => {
      if ((data as { receipts?: unknown[] }).receipts?.length) throw new Error("receipt persistence failed");
      await saveData(data);
    });
    await expect(plugin.coordinator.run(() => plugin.operationLog.removeAndPersist(
      id, () => plugin.savePluginData(), { status: "undone" }
    ), id)).rejects.toThrow("receipt persistence failed");
    unsubscribe();
    expect(observed).toContain("undone");
    expect(observed.at(-1)).toBe("undoing");
    expect(plugin.operationLog.latest()).toMatchObject({ id, status: "undoing" });
    expect(plugin.operationLog.receiptsToJSON()).toEqual([]);
    expect(adapter.getState()).toMatchObject({ recoveryRequired: true, busy: false,
      history: [{ id, status: "undoing", unresolved: true }], error: "receipt persistence failed" });
    expect(plugin.coordinator.error).toBe("receipt persistence failed");
  });

  it("merges exact sources without a key or active note, preserving existing raw targets and unrelated literals", async () => {
    const notes = [
      { path: "Notes/mixed.md", content: withFrontmatter("#SourceA #SourceB #Target/Case #KeepCase #SourceA/Child\n", { tags: ["SourceA", "KeepCase", "Target/Case", "KeepCase", "SourceB", "Target/Case"], nested: { keep: true } }) },
      { path: "Notes/inline.md", content: "#SourceB #KeepCase\n" },
      { path: "Notes/property.md", content: withFrontmatter("Unchanged body\n", { tags: ["SourceA", "KeepCase", "KeepCase"] }) },
      { path: "Notes/target-only.md", content: withFrontmatter("#Target/Case\n", { tags: ["Target/Case"] }) },
      { path: "Notes/child-only.md", content: "#SourceA/Child\n" }
    ];
    const app = appWithNotes(notes);
    const plugin = await load(app);
    const leaf = await openWorkbench(plugin);
    await refresh(plugin, leaf);
    const read = vi.spyOn(app.vault, "cachedRead");
    for (const key of ["sourcea", "sourceb", "target/case"]) {
      const checkbox = leaf.view!.contentEl.querySelector<HTMLInputElement>(`[data-tag="${key}"] input[type="checkbox"]`);
      expect(checkbox).not.toBeNull();
      checkbox!.click();
    }
    button(labels.merge, leaf.view!.contentEl).click();
    const target = input(labels.target);
    target.value = "Target/CASE";
    target.dispatchEvent(new Event("input", { bubbles: true }));
    input(labels.scopeConsent).click();
    button(labels.preview).click();
    await vi.waitFor(() => expect(openModals.some(modal => modal.titleEl.textContent === cleanupLabels.title)).toBe(true));
    expect([...new Set(read.mock.calls.map(([file]) => file.path))].sort()).toEqual(["Notes/inline.md", "Notes/mixed.md", "Notes/property.md"]);
    expect(app.vault.getProcessCount()).toBe(0);
    const writes: string[] = [];
    app.vault.setProcessInterceptor(file => { writes.push(file.path); });
    button(cleanupLabels.apply).click();
    button(cleanupLabels.confirmApply).click();
    await vi.waitFor(() => expect(plugin.operationLog.latestCleanupV2()?.status).toBe("applied"));
    await vi.waitFor(() => expect(plugin.managementAdapter().getState().freshness).toBe("ready"));
    expect(app.getNoteTags("Notes/mixed.md")).toEqual(["KeepCase", "Target/Case", "KeepCase", "Target/Case"]);
    expect(markdownBody(app.vault.getNote("Notes/mixed.md").content)).toBe("#Target/CASE #Target/CASE #Target/Case #KeepCase #SourceA/Child\n");
    expect(parseYaml(getFrontMatterInfo(app.vault.getNote("Notes/mixed.md").content).frontmatter)).toEqual({ tags: ["KeepCase", "Target/Case", "KeepCase", "Target/Case"], nested: { keep: true } });
    expect(app.vault.getNote("Notes/inline.md").content).toBe("#Target/CASE #KeepCase\n");
    expect(app.getNoteTags("Notes/property.md")).toEqual(["Target/CASE", "KeepCase", "KeepCase"]);
    expect(markdownBody(app.vault.getNote("Notes/property.md").content)).toBe("Unchanged body\n");
    for (const note of notes.slice(3)) expect(app.vault.getNote(note.path).content).toBe(note.content);
    expect([...new Set(writes)].sort()).toEqual(["Notes/inline.md", "Notes/mixed.md", "Notes/property.md"]);
    expect(app.workspace.getActiveFile()).toBeNull();
    expect(requestUrlMock).not.toHaveBeenCalled();
    expect(plugin.operationLog.latestCleanupV2()).toMatchObject({ action: "merge", origin: "manual", targetTag: "Target/CASE", sourceTags: ["sourcea", "sourceb"] });
    await plugin.managementAdapter().commands.undo(plugin.operationLog.latest()!.id);
    for (const note of notes) expect(app.vault.getNote(note.path).content).toBe(note.content);
  });

  it("excludes policy folders before reading any content or calling a provider", async () => {
    const app = appWithNotes([
      { path: "Public/a.md", content: withFrontmatter("#Old", { tags: ["Old"] }) },
      { path: "Secret/private.md", content: withFrontmatter("#Secret", { tags: ["Secret"] }) }
    ]);
    const plugin = await load(app);
    const adapter = plugin.managementAdapter();
    await adapter.commands.saveScopeAndPolicy({ include: [{ path: "", recursive: true }] }, { ...adapter.getState().policy, excludedFolders: ["Secret"] });
    const read = vi.spyOn(app.vault, "cachedRead");
    const leaf = await openWorkbench(plugin);
    await refresh(plugin, leaf);
    expect(read.mock.calls.map(([file]) => file.path)).toEqual(["Public/a.md"]);
    expect(Object.keys(adapter.getState().index!.tags)).toEqual(["old"]);
    expect(leaf.view!.contentEl.textContent).not.toContain("Secret/private.md");
    expect(requestUrlMock).not.toHaveBeenCalled();
    expect(app.vault.getProcessCount()).toBe(0);
  });

  it("shares busy state across leaves and makes real vault events invalidate review availability", async () => {
    const app = appWithNotes();
    const plugin = await load(app);
    const first = await openWorkbench(plugin);
    await refresh(plugin, first);
    const second = app.workspace.getLeaf("split");
    await second.setViewState({ type: viewType });
    for (const leaf of [first, second]) leaf.view!.contentEl.querySelector<HTMLButtonElement>('[data-tag="old"] button')!.click();
    const gate = createDeferred();
    const running = plugin.coordinator.run(() => gate.promise);
    for (const leaf of [first, second]) expect(button(labels.rename, leaf.view!.contentEl).disabled).toBe(true);
    await expect(plugin.coordinator.run(async () => {})).rejects.toThrow("already running");
    first.detach();
    expect(plugin.coordinator.busy).toBe(true);
    gate.resolve();
    await running;
    expect(button(labels.rename, second.view!.contentEl).disabled).toBe(false);
    const file = app.vault.getNote("Notes/a.md").file;
    await app.vault.modify(file, `${app.vault.getNote(file.path).content}External edit\n`);
    expect(plugin.managementAdapter().getState().freshness).toBe("stale");
    expect(button(labels.rename, second.view!.contentEl).disabled).toBe(true);
    await expect(plugin.managementAdapter().commands.startManual({ kind: "rename", source: "old", target: "new", scope: { include: [{ path: "", recursive: true }] } }, new AbortController().signal)).rejects.toThrow("Refresh");
    expect(app.vault.getProcessCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it("blocks the legacy recommendation command for an excluded active note before reading or provider validation", async () => {
    const app = appWithNotes([{ path: "Secret/private.md", content: "Private #Old\n" }]);
    const plugin = await load(app);
    const adapter = plugin.managementAdapter();
    await adapter.commands.saveScopeAndPolicy({ include: [{ path: "", recursive: true }] }, { ...adapter.getState().policy, excludedFolders: ["Secret"] });
    app.workspace.setActiveFile(app.vault.getNote("Secret/private.md").file);
    const reads = app.vault.getReadCount();
    await plugin.commands["suggest-tags-for-current-note"].callback!();
    expect(notices.at(-1)).toBe("The current note is in an excluded folder.");
    expect(app.vault.getReadCount()).toBe(reads);
    expect(requestUrlMock).not.toHaveBeenCalled();
    expect(app.vault.getProcessCount()).toBe(0);
    expect(plugin.operationLog.toJSON()).toEqual([]);
  });

  it.each([null, false, 0, "future-format", { schemaVersion: 99, evidence: ["keep"] }, [{ id: "future", type: "cleanup", schemaVersion: 99, files: [{ evidence: "keep" }] }]])("keeps invalid operations read-only without overwriting raw plugin data (%#)", async operations => {
    const app = appWithNotes(undefined, { operations });
    const original = structuredClone(app.pluginData);
    const plugin = await load(app);
    const leaf = await openWorkbench(plugin);
    button(labels.history, leaf.view!.contentEl).click();
    expect(plugin.managementAdapter().getState().historyError).toBeTruthy();
    expect(leaf.view!.contentEl.querySelector('[role="alert"]')).not.toBeNull();
    const adapter = plugin.managementAdapter();
    expect(adapter.getState().history.length).toBeGreaterThan(0);
    expect(adapter.getState().history.every(row => !row.canUndo && !row.canRecover)).toBe(true);
    await expect(adapter.commands.startManual({ kind: "rename", source: "old", target: "new", scope: { include: [{ path: "", recursive: true }] } }, new AbortController().signal)).rejects.toThrow();
    await expect(adapter.commands.undo(adapter.getState().history[0].id)).rejects.toThrow();
    expect(plugin.operationLog.toJSON()).toEqual(operations);
    await expect(plugin.savePluginData()).rejects.toThrow();
    expect(app.pluginData).toEqual(original);
    expect(app.saves).toHaveLength(0);
    expect(app.vault.getProcessCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it("does not let an older cleanup bypass a newer recommendation on a disjoint file", async () => {
    const oldContent = withFrontmatter("Body", { tags: ["new"] });
    const recentContent = withFrontmatter("Another body", { tags: ["keep", "added"] });
    const app = appWithNotes([{ path: "Notes/old.md", content: oldContent }, { path: "Notes/recent.md", content: recentContent }], {
      operations: [
        { id: "recent", plan: { notePath: "Notes/recent.md", beforeTags: ["keep"], afterTags: ["keep", "added"], addedTags: ["added"], unchangedTags: ["keep"], skippedTags: [], createdAt: "2026-01-01" } },
        { id: "older-cleanup", type: "cleanup", schemaVersion: 2, status: "applied", itemId: "one", title: "Rename", action: "rename", sourceTags: ["old"], targetTag: "new", partial: false, createdAt: "2026-12-31",
          files: [{ notePath: "Notes/old.md", beforeTags: ["old"], afterTags: ["new"], sourceContentHash: await hashContent(oldContent), beforeBodyHash: await hashContent("Body"), afterBodyHash: await hashContent("Body"), inlineEdits: [] }] }
      ]
    });
    const plugin = await load(app);
    const adapter = plugin.managementAdapter();
    expect(adapter.getState().history.map(row => [row.id, row.canUndo])).toEqual([["recent", true], ["older-cleanup", false]]);
    await expect(adapter.commands.undo("older-cleanup")).rejects.toThrow();
    expect(app.vault.getProcessCount()).toBe(0);
    expect(app.fileManager.getWriteCount()).toBe(0);
    await adapter.commands.undo("recent");
    expect(app.getNoteTags("Notes/recent.md")).toEqual(["keep"]);
    expect(app.vault.getNote("Notes/old.md").content).toBe(oldContent);
    expect(adapter.getState().history.find(row => row.id === "older-cleanup")?.canUndo).toBe(true);
    expect(plugin.operationLog.receiptsToJSON()[0]).toMatchObject({ operationId: "recent", status: "undone" });
  });

  it("rejects a confirmed stale modal after a new source file is created, without an intent or writes", async () => {
    const app = appWithNotes();
    const plugin = await load(app);
    const leaf = await openWorkbench(plugin);
    await refresh(plugin, leaf);
    await reviewRename(plugin, leaf);
    await app.vault.create("Notes/new-source.md", "#Old");
    button(cleanupLabels.apply).click();
    button(cleanupLabels.confirmApply).click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Index or scope changed"));
    expect(plugin.operationLog.toJSON()).toEqual([]);
    expect(app.vault.getProcessCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it("does not let a previously opened undo confirmation remove a newer record", async () => {
    const notes = [
      { path: "Notes/old.md", content: withFrontmatter("Old body", { tags: ["old", "added"] }) },
      { path: "Notes/new.md", content: withFrontmatter("New body", { tags: ["new", "added"] }) }
    ];
    const app = appWithNotes(notes);
    const plugin = await load(app);
    const old = plugin.operationLog.add({ notePath: "Notes/old.md", beforeTags: ["old"], afterTags: ["old", "added"], addedTags: ["added"], unchangedTags: ["old"], skippedTags: [], syncedInlineTags: [], aiAddedTags: ["added"], sourceContentHash: await hashContent(notes[0].content), createdAt: "2026-01-01" }, 10);
    await plugin.savePluginData();
    const leaf = await openWorkbench(plugin);
    button(labels.history, leaf.view!.contentEl).click();
    leaf.view!.contentEl.querySelector<HTMLButtonElement>(`[data-focus="history-${old.id}"]`)!.click();
    button(labels.undo, leaf.view!.contentEl).click();
    const confirm = button(labels.confirmUndo);
    expect(confirm.disabled).toBe(false);
    const newest = plugin.operationLog.add({ notePath: "Notes/new.md", beforeTags: ["new"], afterTags: ["new", "added"], addedTags: ["added"], unchangedTags: ["new"], skippedTags: [], syncedInlineTags: [], aiAddedTags: ["added"], sourceContentHash: await hashContent(notes[1].content), createdAt: "2025-01-01" }, 10);
    await plugin.savePluginData();
    expect(confirm.disabled).toBe(true);
    confirm.click();
    await expect(plugin.managementAdapter().commands.undo(old.id)).rejects.toThrow();
    expect(plugin.operationLog.toJSON().map(record => record.id)).toEqual([newest.id, old.id]);
    expect(plugin.operationLog.receiptsToJSON()).toEqual([]);
    expect(app.vault.getProcessCount()).toBe(0);
    expect(app.fileManager.getWriteCount()).toBe(0);
    for (const note of notes) expect(app.vault.getNote(note.path).content).toBe(note.content);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it("rejects a reviewed rename after policy revision changes with no intent or Markdown writes", async () => {
    const app = appWithNotes();
    const original = app.vault.getNote("Notes/a.md").content;
    const plugin = await load(app);
    const leaf = await openWorkbench(plugin);
    await refresh(plugin, leaf);
    await reviewRename(plugin, leaf);
    const adapter = plugin.managementAdapter();
    const previousRevision = adapter.getState().policy.revision;
    await adapter.commands.saveScopeAndPolicy(adapter.getState().scope, { ...adapter.getState().policy, excludedFolders: ["Notes"] });
    expect(adapter.getState().policy.revision).toBe(previousRevision + 1);
    button(cleanupLabels.apply).click();
    button(cleanupLabels.confirmApply).click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Scope or protection rules changed. Review again."));
    expect(plugin.operationLog.toJSON()).toEqual([]);
    expect(app.vault.getNote("Notes/a.md").content).toBe(original);
    expect(app.vault.getProcessCount()).toBe(0);
    expect(app.fileManager.getWriteCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });
});

describe("workbench main adapter index persistence races", () => {
  async function prepareRefresh() {
    const app = appWithNotes();
    const plugin = await load(app);
    const adapter = plugin.managementAdapter();
    await adapter.commands.refresh();
    const previous = plugin.indexService.getSnapshot();
    expect(previous.state).toBe("ready");
    expect(plugin.tagIndex).toBe(previous.index);
    const content = withFrontmatter("Unchanged body\n", { tags: ["Candidate"] });
    await app.vault.modify(app.vault.getNote("Notes/a.md").file, content);
    return { app, plugin, adapter, previous, content };
  }

  it.each(["cancel", "policy change"] as const)("skips a candidate queued behind an existing main save after %s", async mode => {
    const { app, plugin, adapter, previous } = await prepareRefresh();
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    const saveData = plugin.saveData.bind(plugin);
    const diskWrites = vi.spyOn(plugin, "saveData").mockImplementationOnce(async data => {
      firstStarted.resolve();
      await releaseFirst.promise;
      await saveData(data);
    });
    const existingSave = plugin.savePluginData();
    await firstStarted.promise;
    const queued = vi.spyOn(plugin.dataStore, "save");
    const refresh = adapter.commands.refresh();
    const cancelled = expect(refresh).rejects.toThrow("cancelled or became stale");
    await vi.waitFor(() => expect(queued).toHaveBeenCalledWith(expect.any(Function), expect.any(Function)));
    expect(diskWrites).toHaveBeenCalledTimes(1);
    expect(plugin.tagIndex).toBe(previous.index);
    expect(plugin.indexService.getSnapshot().index).toBe(previous.index);
    const policyRevision = adapter.getState().policy.revision;
    const invalidated = mode === "policy change"
      ? adapter.commands.saveScopeAndPolicy(adapter.getState().scope, { ...adapter.getState().policy, excludedFolders: ["Notes"] })
      : Promise.resolve(adapter.commands.cancelRefresh());
    await cancelled;
    releaseFirst.resolve();
    await Promise.all([existingSave, invalidated]);
    // Cancellation settles refresh before the underlying persistence callback/repair has finished.
    await plugin.indexService.persistTail;
    expect(diskWrites.mock.calls.every(([data]) => !(data as PersistedData).tagIndex?.tags.candidate)).toBe(true);
    const disk = app.pluginData as PersistedData;
    expect(disk.tagIndex).toEqual(mode === "cancel" ? previous.index : undefined);
    expect(plugin.tagIndex).toBe(plugin.indexService.getSnapshot().index);
    expect(plugin.indexService.getSnapshot().state).toBe(mode === "cancel" ? "stale" : "missing");
    if (mode === "policy change") expect(disk.tagMutationPolicy).toMatchObject({ revision: policyRevision + 1, excludedFolders: ["Notes"] });
    expect(plugin.coordinator.error).toBeNull();
    expect(app.vault.getProcessCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it("retains the previous main/service index and blocks mutations when the actual candidate save rejects", async () => {
    const { app, plugin, adapter, previous } = await prepareRefresh();
    const originalDisk = structuredClone(app.pluginData);
    const started = createDeferred();
    const diskGate = createDeferred();
    const failure = new Error("index disk write rejected");
    let candidate: PersistedData | undefined;
    vi.spyOn(plugin, "saveData").mockImplementationOnce(async data => {
      candidate = data as PersistedData;
      started.resolve();
      await diskGate.promise;
    });
    const published: Array<TagIndex | undefined> = [];
    const unsubscribe = plugin.indexService.subscribe(snapshot => published.push(snapshot.index));
    const refresh = adapter.commands.refresh();
    const rejected = expect(refresh).rejects.toThrow(failure.message);
    await started.promise;
    expect(candidate?.tagIndex?.tags.candidate).toBeDefined();
    expect(candidate?.tagIndex).not.toEqual(previous.index);
    expect(plugin.tagIndex).toBe(previous.index);
    expect(plugin.indexService.getSnapshot()).toMatchObject({ state: "refreshing", revision: previous.revision });
    expect(plugin.indexService.getSnapshot().index).toBe(previous.index);
    diskGate.reject(failure);
    await rejected;
    await plugin.indexService.persistTail;
    expect(plugin.tagIndex).toBe(previous.index);
    expect(plugin.indexService.getSnapshot()).toMatchObject({ state: "error", revision: previous.revision, error: failure.message });
    expect(plugin.indexService.getSnapshot().index).toBe(previous.index);
    expect(published.every(index => index === previous.index)).toBe(true);
    expect(app.pluginData).toEqual(originalDisk);
    expect(plugin.dataStore.requiresReload).toBe(true);
    expect(plugin.coordinator.error).toBe(failure.message);
    expect(adapter.getState().error).toBe(failure.message);
    const mutation = vi.fn(async () => {});
    await expect(plugin.coordinator.run(mutation)).rejects.toThrow(failure.message);
    expect(mutation).not.toHaveBeenCalled();
    await expect(adapter.commands.startManual({ kind: "rename", source: "old", target: "new", scope: adapter.getState().scope }, new AbortController().signal)).rejects.toThrow();
    expect(plugin.operationLog.toJSON()).toEqual([]);
    expect(app.vault.getProcessCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("repairs a cancelled in-flight index save using the latest intent at the corrective save queue head", async () => {
    const { app, plugin, adapter, previous, content } = await prepareRefresh();
    const candidateStarted = createDeferred();
    const releaseCandidate = createDeferred();
    const interveningStarted = createDeferred();
    const releaseIntervening = createDeferred();
    const saveData = plugin.saveData.bind(plugin);
    const diskWrites = vi.spyOn(plugin, "saveData")
      .mockImplementationOnce(async data => {
        candidateStarted.resolve();
        await releaseCandidate.promise;
        await saveData(data);
      })
      .mockImplementationOnce(async data => {
        interveningStarted.resolve();
        await releaseIntervening.promise;
        await saveData(data);
      });
    const refresh = adapter.commands.refresh();
    const cancelled = expect(refresh).rejects.toThrow("cancelled or became stale");
    await candidateStarted.promise;
    expect((diskWrites.mock.calls[0][0] as PersistedData).tagIndex?.tags.candidate).toBeDefined();
    expect(plugin.tagIndex).toBe(previous.index);
    expect(plugin.indexService.getSnapshot().index).toBe(previous.index);
    const queued = vi.spyOn(plugin.dataStore, "save");
    const interveningSave = plugin.savePluginData();
    adapter.commands.cancelRefresh();
    await cancelled;
    releaseCandidate.resolve();
    await interveningStarted.promise;
    // The second request is main's corrective save, now queued behind the intervening write.
    await vi.waitFor(() => expect(queued).toHaveBeenCalledTimes(2));
    expect((app.pluginData as PersistedData).tagIndex?.tags.candidate).toBeDefined();
    const bodyHash = await hashContent(markdownBody(content));
    const intent = plugin.operationLog.addCleanupIntent({
      itemId: "latest-intent", title: "Rename Candidate", action: "rename", sourceTags: ["candidate"], targetTag: "Final", partial: false, origin: "manual",
      files: [{ notePath: "Notes/a.md", beforeTags: ["candidate"], afterTags: ["final"], sourceContentHash: await hashContent(content), beforeBodyHash: bodyHash, afterBodyHash: bodyHash, inlineEdits: [], tagValueVersion: 1,
        tagValuePatch: { before: { kind: "list", values: ["Candidate"] }, after: { kind: "list", values: ["Final"] } } }]
    }, 10);
    const latestOperations = plugin.operationLog.toJSON();
    const intentSave = plugin.savePluginData();
    releaseIntervening.resolve();
    await Promise.all([interveningSave, intentSave, plugin.indexService.persistTail]);
    expect(diskWrites).toHaveBeenCalledTimes(4);
    for (const [data] of diskWrites.mock.calls.slice(2)) {
      expect((data as PersistedData).operations).toEqual(latestOperations);
      expect((data as PersistedData).tagIndex).toEqual(previous.index);
    }
    const disk = app.pluginData as PersistedData;
    expect(disk.operations).toEqual(latestOperations);
    expect(disk.operations?.[0]).toMatchObject({ id: intent.id, status: "applying", origin: "manual" });
    expect(disk.tagIndex).toEqual(previous.index);
    expect(disk.healthAiAnalysisCache).toBeUndefined();
    expect(plugin.tagIndex).toBe(previous.index);
    expect(plugin.indexService.getSnapshot().index).toBe(previous.index);
    expect(plugin.indexService.getSnapshot().state).toBe("stale");
    expect(plugin.coordinator.error).toBeNull();
    expect(app.vault.getProcessCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });
});

describe("workbench main scope and retention integration", () => {
  it("keeps a ready index and AI cache on scope-only save but invalidates the old manual review", async () => {
    const app = appWithNotes();
    const plugin = await load(app);
    const adapter = plugin.managementAdapter();
    const leaf = await openWorkbench(plugin);
    await refresh(plugin, leaf);
    await reviewRename(plugin, leaf);
    const before = plugin.indexService.getSnapshot();
    const policyRevision = adapter.getState().policy.revision;
    const scopeRevision = plugin.managementScopeRevision;
    const cache: CachedTagHealthAiAnalysis = {
      analysis: { summary: "Cached health summary", priorities: [] },
      analyzedAt: "2026-01-01T00:00:00Z", indexUpdatedAt: before.index!.updatedAt
    };
    plugin.healthAiAnalysisCache = cache;
    await plugin.savePluginData();
    const reads = app.vault.getReadCount();
    const nextScope = { include: [{ path: "Notes", recursive: false }] };
    await adapter.commands.saveScopeAndPolicy(nextScope, adapter.getState().policy);
    expect(plugin.managementScopeRevision).toBe(scopeRevision + 1);
    expect(adapter.getState().scope).toEqual(nextScope);
    expect(adapter.getState().policy.revision).toBe(policyRevision);
    expect(adapter.getState().freshness).toBe("ready");
    expect(plugin.indexService.getSnapshot()).toEqual(before);
    expect(plugin.tagIndex).toBe(before.index);
    expect(plugin.healthAiAnalysisCache).toBe(cache);
    expect(app.pluginData).toMatchObject({ tagIndex: before.index, healthAiAnalysisCache: cache, managementScope: nextScope, tagMutationPolicy: { revision: policyRevision } });
    expect(app.vault.getReadCount()).toBe(reads);
    button(cleanupLabels.apply).click();
    button(cleanupLabels.confirmApply).click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Index or scope changed. Refresh and review again."));
    expect(plugin.operationLog.toJSON()).toEqual([]);
    expect((app.pluginData as PersistedData).operations).toEqual([]);
    expect(app.vault.getProcessCount()).toBe(0);
    expect(app.fileManager.getWriteCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it.each([["Missing", "Notes"], ["Notes", "Missing"]])("rejects the entire manual scope containing valid and missing folders in order %j/%j", async (first, second) => {
    const app = appWithNotes();
    const plugin = await load(app);
    const adapter = plugin.managementAdapter();
    await adapter.commands.refresh();
    const reads = app.vault.getReadCount();
    const saves = app.saves.length;
    const modals = openModals.length;
    const before = plugin.indexService.getSnapshot();
    await expect(adapter.commands.startManual({
      kind: "rename", source: "old", target: "New/Name",
      scope: { include: [first, second].map(path => ({ path, recursive: true })) }
    }, new AbortController().signal)).rejects.toThrow("Folder not found: Missing");
    expect(plugin.indexService.getSnapshot()).toEqual(before);
    expect(app.vault.getReadCount()).toBe(reads);
    expect(app.saves).toHaveLength(saves);
    expect(openModals).toHaveLength(modals);
    expect(plugin.operationLog.toJSON()).toEqual([]);
    expect(app.vault.getProcessCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it("enforces the main history limit on load/change without losing unresolved evidence or re-enforcing uncertain saves", async () => {
    const pending: CleanupOperationRecordV2 = {
      id: "pending", type: "cleanup", schemaVersion: 2, status: "recoveryRequired", recoveryTarget: "before",
      itemId: "manual", title: "Interrupted rename", action: "rename", sourceTags: ["old"], targetTag: "New", partial: false, origin: "manual", createdAt: "2026-01-01",
      files: [{ notePath: "Notes/a.md", beforeTags: ["old", "keepcase"], afterTags: ["new", "keepcase"], sourceContentHash: "source", beforeBodyHash: "before", afterBodyHash: "after", recoveryState: "conflict",
        inlineEdits: [{ occurrenceId: "inline-old", beforeText: "#Old", afterText: "#New", beforeBodyStart: 0, beforeBodyEnd: 4, afterBodyStart: 0, afterBodyEnd: 4 }],
        tagValueVersion: 1, tagValuePatch: { before: { kind: "list", values: ["Old", "KeepCase", "KeepCase"] }, after: { kind: "list", values: ["New", "KeepCase", "KeepCase"] } } }]
    };
    const completed = [3, 2, 1].map(sequence => ({ id: `completed-${sequence}`, plan: {
      notePath: `Notes/completed-${sequence}.md`, beforeTags: ["old"], afterTags: ["old", "added"], addedTags: ["added"], unchangedTags: ["old"], skippedTags: [], syncedInlineTags: [], aiAddedTags: ["added"], sourceContentHash: "source", createdAt: "2026-01-01"
    } }));
    const app = appWithNotes(undefined, { settings: { uiLanguage: "en", refreshIndexOnLoad: false, apiKey: "", operationLogLimit: 2 }, operations: [pending, ...completed] });
    const plugin = await load(app);
    expect(plugin.operationLog.toJSON().map(record => record.id)).toEqual(["pending", "completed-3", "completed-2"]);
    const retainedPending = plugin.operationLog.latestUnresolvedCleanup()!;
    expect(retainedPending.files).toEqual(pending.files);
    expect(retainedPending.recoveryTarget).toBe("before");
    const enforce = vi.spyOn(plugin.operationLog, "enforceRetention");
    plugin.settings.operationLogLimit = 0;
    await plugin.savePluginData();
    expect(enforce).toHaveBeenCalledExactlyOnceWith(0);
    expect(plugin.operationLog.toJSON()).toEqual([retainedPending]);
    expect(app.pluginData).toMatchObject({ settings: { operationLogLimit: 0 }, operations: [retainedPending] });
    await plugin.savePluginData();
    expect(enforce).toHaveBeenCalledTimes(1);
    const error = new Error("uncertain receipt save");
    vi.spyOn(plugin, "saveData").mockRejectedValueOnce(error);
    await expect(plugin.operationLog.removeAndPersist("pending", () => plugin.savePluginData())).rejects.toThrow(error.message);
    expect(plugin.operationLog.validationErrors.join()).toContain("reload");
    await plugin.savePluginData();
    expect(enforce).toHaveBeenCalledTimes(1);
    expect(plugin.operationLog.toJSON()).toEqual([retainedPending]);
    expect((app.pluginData as PersistedData).operations).toEqual([retainedPending]);
    expect(plugin.operationLog.receiptsToJSON()).toEqual([]);
    expect(plugin.coordinator.error).toBe(error.message);
    expect(app.vault.getProcessCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
    plugin.unload();
    for (const modal of [...openModals]) modal.close();
    const reloaded = await load(appWithNotes(undefined, app.savedData as Record<string, unknown>));
    expect(reloaded.settings.operationLogLimit).toBe(0);
    expect(reloaded.operationLog.toJSON()).toEqual([retainedPending]);
    expect(reloaded.managementAdapter().getState().recoveryRequired).toBe(true);
  });
});

describe("main policy entrypoint matrix", () => {
  it.each(["current-note", "folder", "health", "manual"] as const)("%s excludes private notes and preserves protected raw literals during a real forward workflow", async entry => {
    const ui = getLabels("en");
    const publicPath = "Public/a.md";
    const privatePath = "Public/Secret/private.md";
    const body = "Topic #ml_notes #Keep_Case #Blocked\n";
    const privateContent = withFrontmatter("SECRET_SENTINEL #ml_notes #Keep_Case\n", { tags: ["ml_notes", "Keep_Case", "Keep_Case"] });
    const app = appWithNotes([
      { path: publicPath, content: withFrontmatter(body, { tags: ["ml_notes", "Keep_Case", "Keep_Case"] }) },
      { path: "Taxonomy/terms.md", content: withFrontmatter("Taxonomy", { tags: ["ml-notes", "keep-case", "allowed"] }) },
      { path: privatePath, content: privateContent }
    ], { settings: { apiKey: "sk-test", uiLanguage: "en", refreshIndexOnLoad: false, allowNewTags: true } });
    const plugin = await load(app);
    const adapter = plugin.managementAdapter();
    await adapter.commands.saveScopeAndPolicy(adapter.getState().scope, { ...adapter.getState().policy,
      excludedFolders: ["Public/Secret"], protectedTags: [{ tag: "keep_case", mode: "exact" }, { tag: "blocked", mode: "exact" }] });
    const read = vi.spyOn(app.vault, "cachedRead");
    const written: string[] = [];
    app.vault.setProcessInterceptor(file => { written.push(file.path); });
    app.workspace.setActiveFile(app.vault.getNote(publicPath).file);
    if (entry === "current-note" || entry === "folder") {
      queueAiResponse(JSON.stringify({ recommendations: [
        { tag: "allowed", type: "existing", confidence: "high", reason: "Allowed addition" },
        { tag: "blocked", type: "existing", confidence: "high", reason: "Must not be added" }
      ], warnings: [] }));
      await plugin.commands[entry === "current-note" ? "suggest-tags-for-current-note" : "suggest-tags-for-folder"].callback!();
      if (entry === "folder") {
        expect(document.body.textContent).toContain(ui.folderBatch.fileCount(1));
        button(ui.folderBatch.start).click();
        await vi.waitFor(() => expect(document.body.textContent).toContain(ui.folderBatch.previewTitle));
        button(ui.folderBatch.apply).click();
        button(ui.folderBatch.confirmApply).click();
      } else {
        await vi.waitFor(() => expect(document.body.textContent).toContain(ui.recommendations.title));
        button(ui.recommendations.apply).click();
      }
    } else if (entry === "health") {
      await plugin.commands["analyze-tag-health"].callback!();
      await vi.waitFor(() => expect(document.body.textContent).toContain(ui.health.title));
      queueAiResponse(JSON.stringify({ summary: "Policy matrix health analysis", priorities: [
        { issueType: "nearDuplicates", tags: ["ml_notes", "ml-notes"], severity: "high", confidence: "high", diagnosis: "Separator duplicate", suggestedAction: "merge", targetTag: "ml-notes", reason: "Same topic", riskNote: "Review exact sources" },
        { issueType: "nearDuplicates", tags: ["keep_case", "keep-case"], severity: "high", confidence: "high", diagnosis: "Protected separator duplicate", suggestedAction: "merge", targetTag: "keep-case", reason: "Must remain protected", riskNote: "No protected writes" }
      ] }));
      button(ui.health.workflow.generateAiButton).click();
      await vi.waitFor(() => expect(document.body.textContent).toContain("Policy matrix health analysis"));
      const protectedCard = Array.from(document.querySelectorAll<HTMLElement>(".tag-curator-health-action-card")).find(card => card.textContent?.includes("keep_case"))!;
      expect(protectedCard).toBeDefined();
      const readsBefore = read.mock.calls.length;
      button(cleanupLabels.reviewChanges, protectedCard).click();
      await vi.waitFor(() => expect(notices).toContain("This operation involves protected tags."));
      expect(read).toHaveBeenCalledTimes(readsBefore);
      expect(app.vault.getProcessCount()).toBe(0);
      await plugin.commands["analyze-tag-health"].callback!();
      await vi.waitFor(() => expect(document.body.textContent).toContain("Policy matrix health analysis"));
      const allowedCard = Array.from(document.querySelectorAll<HTMLElement>(".tag-curator-health-action-card")).find(card => card.textContent?.includes("ml_notes"))!;
      button(cleanupLabels.reviewChanges, allowedCard).click();
    } else {
      await adapter.commands.refresh();
      const readsBefore = read.mock.calls.length;
      for (const [source, target] of [["keep_case", "Other"], ["ml_notes", "Blocked"]]) {
        await expect(adapter.commands.startManual({ kind: "rename", source, target, scope: adapter.getState().scope }, new AbortController().signal)).rejects.toThrow(/protected/i);
      }
      expect(read).toHaveBeenCalledTimes(readsBefore);
      await adapter.commands.startManual({ kind: "rename", source: "ml_notes", target: "Final/Name", scope: adapter.getState().scope }, new AbortController().signal);
    }
    if (entry === "health" || entry === "manual") {
      await vi.waitFor(() => expect(openModals.some(modal => modal.titleEl.textContent === cleanupLabels.title)).toBe(true));
      button(cleanupLabels.apply).click();
      button(cleanupLabels.confirmApply).click();
    }
    await vi.waitFor(() => expect(adapter.getState().history[0]?.status).toBe("applied"));
    await vi.waitFor(() => expect(adapter.getState().freshness).toBe("ready"));
    const expectedTags = entry === "health" ? ["ml_notes", "Keep_Case", "Keep_Case"] : entry === "manual" ? ["Final/Name", "Keep_Case", "Keep_Case"] : ["ml_notes", "Keep_Case", "Keep_Case", "allowed"];
    expect(app.getNoteTags(publicPath)).toEqual(expectedTags);
    expect(app.getNoteTags(publicPath).filter(tag => tag === "Keep_Case")).toEqual(["Keep_Case", "Keep_Case"]);
    expect(markdownBody(app.vault.getNote(publicPath).content)).toBe(entry === "manual" ? body.replace("#ml_notes", "#Final/Name") : body);
    if (entry === "health") {
      expect(plugin.operationLog.latestCleanupV2()).toMatchObject({ targetTag: "ml_notes", status: "applied" });
      expect(app.getNoteTags("Taxonomy/terms.md")).toEqual(["ml_notes", "keep-case", "allowed"]);
    }
    expect(app.vault.getNote(privatePath).content).toBe(privateContent);
    expect(written.length).toBeGreaterThan(0);
    expect(written.every(path => path !== privatePath)).toBe(true);
    expect(read.mock.calls.length).toBeGreaterThan(0);
    expect(read.mock.calls.every(([file]) => file.path !== privatePath)).toBe(true);
    expect(requestUrlMock).toHaveBeenCalledTimes(entry === "manual" ? 0 : 1);
    expect(JSON.stringify(requestUrlMock.mock.calls)).not.toMatch(/SECRET_SENTINEL|Public\/Secret/);
    expect(app.fileManager.getWriteCount()).toBe(0);
  });

  it.each([
    { action: "undo", conflict: false }, { action: "undo", conflict: true },
    { action: "recover", conflict: false }, { action: "recover", conflict: true }
  ] as const)("$action after new protection/exclusion only touches the original record (conflict=$conflict)", async ({ action, conflict }) => {
    const notes = [
      { path: "Notes/a.md", content: withFrontmatter("#Old #KeepCase\n", { tags: ["Old", "KeepCase", "KeepCase"] }) },
      { path: "Notes/b.md", content: withFrontmatter("#Old #KeepCase\n", { tags: ["Old", "KeepCase", "KeepCase"] }) },
      { path: "Notes/unrelated.md", content: withFrontmatter("#New/Name #KeepCase\n", { tags: ["New/Name", "KeepCase", "KeepCase"] }) }
    ];
    const app = appWithNotes(notes);
    const plugin = await load(app);
    const adapter = plugin.managementAdapter();
    const leaf = await openWorkbench(plugin);
    await refresh(plugin, leaf);
    await reviewRename(plugin, leaf);
    button(cleanupLabels.apply).click();
    button(cleanupLabels.confirmApply).click();
    await vi.waitFor(() => expect(plugin.operationLog.latestCleanupV2()?.status).toBe("applied"));
    await vi.waitFor(() => expect(adapter.getState().freshness).toBe("ready"));
    const record = plugin.operationLog.latestCleanupV2()!;
    expect(record.files.map(file => file.notePath).sort()).toEqual(["Notes/a.md", "Notes/b.md"]);
    await adapter.commands.saveScopeAndPolicy(adapter.getState().scope, { ...adapter.getState().policy, excludedFolders: ["Notes"],
      protectedTags: [{ tag: "new/name", mode: "exact" }, { tag: "keepcase", mode: "exact" }] });
    if (action === "recover") {
      plugin.operationLog.setCleanupRecoveryTarget(record.id, "before");
      await plugin.savePluginData();
    }
    const history = adapter.getState().history.find(row => row.id === record.id)!;
    expect(history.policyExceptions?.slice().sort()).toEqual(["Notes/a.md", "Notes/b.md"]);
    if (conflict) {
      const file = app.vault.getNote("Notes/b.md").file;
      await app.vault.modify(file, app.vault.getNote(file.path).content.replace("#New/Name", "#UserEdited"));
    }
    const before = notes.map(note => app.vault.getNote(note.path).content);
    const writesBefore = app.vault.getProcessCount();
    const other = app.vault.getNote("Notes/unrelated.md");
    await expect(plugin.coordinator.run(async () => plugin.isRecoveryPath(other.file.path), record.id)).rejects.toThrow("Recovery may only modify paths in its original operation.");
    expect(app.vault.getProcessCount()).toBe(writesBefore);
    const restored: string[] = [];
    app.vault.setProcessInterceptor(file => {
      expect(plugin.coordinator.recoveryId).toBe(record.id);
      restored.push(file.path);
    });
    await adapter.commands[action](record.id);
    expect(plugin.coordinator.recoveryId).toBeUndefined();
    expect(app.vault.getNote(other.file.path).content).toBe(notes[2].content);
    if (conflict) {
      expect(app.vault.getProcessCount()).toBe(writesBefore);
      expect(restored).toEqual([]);
      expect(notes.map(note => app.vault.getNote(note.path).content)).toEqual(before);
      expect(plugin.operationLog.latest()?.id).toBe(record.id);
      expect(plugin.operationLog.receiptsToJSON()).toEqual([]);
      expect(document.body.textContent).toContain(cleanupLabels.conflictResult);
    } else {
      expect([...new Set(restored)].sort()).toEqual(["Notes/a.md", "Notes/b.md"]);
      for (const note of notes) expect(app.vault.getNote(note.path).content).toBe(note.content);
      expect(plugin.operationLog.toJSON()).toEqual([]);
      expect(plugin.operationLog.receiptsToJSON()[0]).toMatchObject({ operationId: record.id, status: action === "undo" ? "undone" : "rolledBack" });
    }
    expect(app.fileManager.getWriteCount()).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });
});
