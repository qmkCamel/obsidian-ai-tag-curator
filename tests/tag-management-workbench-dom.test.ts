// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    setIcon: (el: HTMLElement, icon: string) => { el.dataset.icon = icon; },
    ItemView: class {
      app: unknown; contentEl: HTMLElement;
      constructor(leaf: { app: unknown; document?: Document }) {
        this.app = leaf.app; const doc = leaf.document ?? document;
        this.contentEl = doc.createElement("div"); doc.body.appendChild(this.contentEl);
      }
    },
  };
});
import { TagManagementView, isManagementTagSupported, projectManagementTags, type TagManagementAdapter, type TagManagementState, type ManagementHistoryEntry } from "../src/management/TagManagementView";
import { validateTagText } from "../src/management/ManualTagIntent";
import { validateTagLiteral } from "../src/obsidian/TagValuePatch";
import { TagManagementManualModal, TagManagementPolicyModal, TagManagementHistoryModal } from "../src/management/TagManagementModals";
import { getManagementLabels, managementHistoryText } from "../src/ui/managementLabels";
import { createFakeApp, installDomHelpers, resetObsidianMockState, requestUrlMock, openModals, Modal } from "./e2e/obsidian-harness";
import type { TagUsage } from "../src/index/TagIndex";
import { Platform } from "./e2e/obsidian-harness";

const labels = getManagementLabels("en");
const usage = (tag: string, count = 1): TagUsage => ({ tag, normalized: tag, count: 9999,
  files: Array.from({ length: count }, (_, i) => ({ path: `Project/note-${i}.md`, count: 88, sources: ["frontmatter", "inline"] })),
  examples: [], namingSignals: { depth: 1, hasHierarchy: false } });

function fixture(tags: Record<string, TagUsage> = { old: usage("old") }) {
  let state: TagManagementState = { index: { updatedAt: "2026-09-10", tags }, indexRevision: 1, freshness: "ready",
    scope: { include: [{ path: "", recursive: true }] }, policy: { schemaVersion: 1, revision: 1, excludedFolders: [], protectedTags: [] }, history: [], folders: ["Project"] };
  const listeners = new Set<() => void>();
  const commands = { refresh: vi.fn<TagManagementAdapter["commands"]["refresh"]>(async () => undefined), cancelRefresh: vi.fn(), saveScopeAndPolicy: vi.fn(async () => undefined),
    startManual: vi.fn<TagManagementAdapter["commands"]["startManual"]>(async () => undefined), openFile: vi.fn(async () => undefined), undo: vi.fn(async () => undefined), recover: vi.fn(async () => undefined) };
  const adapter: TagManagementAdapter = { getState: () => state, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, commands };
  return { adapter, commands, listeners, state: () => state, update: (next: Partial<TagManagementState>) => { state = { ...state, ...next }; for (const listener of listeners) listener(); } };
}
function button(label: string, root: ParentNode = document): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(el => el.getAttribute("aria-label") === label);
  expect(found, label).toBeDefined(); return found!;
}
function input(label: string): HTMLInputElement {
  const found = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find(el => el.getAttribute("aria-label") === label);
  expect(found, label).toBeDefined(); return found!;
}
function fill(label: string, value: string): void { const el = input(label); el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); }
function select(label: string, value: string): void {
  const el = Array.from(document.querySelectorAll("select")).find(el => el.getAttribute("aria-label") === label)!;
  el.value = value; el.dispatchEvent(new Event("change", { bubbles: true }));
}
function confirm(): void { input(labels.scopeConsent).click(); }
async function mounted(f = fixture(), language = "en") {
  const view = new TagManagementView({ app: createFakeApp([]) } as never, { adapter: f.adapter, language }); await view.onOpen(); return { ...f, view };
}
beforeEach(() => { installDomHelpers(); resetObsidianMockState(); });

describe("relationship integration and read-only handoff",()=>{
  async function compare(f:Awaited<ReturnType<typeof mounted>>){
    button("Relationships").click();await vi.waitFor(()=>expect(document.querySelector(".tag-graph")?.getAttribute("data-phase")).toBe("ready"));
    fill("Exact tag A","old");fill("Exact tag B","other");button("Compare pair").click();
    await vi.waitFor(()=>expect(document.querySelector(".tag-graph__error")?.textContent).toContain("Worker unavailable"));
    button("Retry as relationship table").click();await vi.waitFor(()=>expect(document.querySelector(".tag-graph__details")?.textContent).toContain("Shared / only A / only B"));
    await vi.waitFor(()=>expect(document.querySelector(".tag-graph")?.getAttribute("data-phase")).toBe("ready"));
  }
  it("starts with full search, survives progress without rebuilding input, and never invokes AI or writes",async()=>{
    const f=await mounted(fixture({old:usage("old",2),other:usage("other",1)}));button("Relationships").click();
    const search=input("Search all scoped tags");search.focus();fill("Search all scoped tags","ol");f.update({progress:{completed:1,total:10},freshness:"refreshing"});
    expect(input("Search all scoped tags")).toBe(search);expect(document.activeElement).toBe(search);
    expect(document.querySelector(".tag-graph__canvas svg")).toBeNull();expect(f.commands.refresh).not.toHaveBeenCalled();expect(f.commands.startManual).not.toHaveBeenCalled();expect(requestUrlMock).not.toHaveBeenCalled();await f.view.onClose();
  });
  it("hands off no selection or intent and returns to the same difference group",async()=>{
    const f=await mounted(fixture({old:usage("old",2),other:usage("other",1)}));await compare(f);button("Only A files").click();await vi.waitFor(()=>expect(document.querySelectorAll(".tag-graph__file")).toHaveLength(1));
    button("Bring to management").click();expect(document.querySelectorAll("[data-tag] input:checked")).toHaveLength(0);expect(f.commands.startManual).not.toHaveBeenCalled();expect(document.querySelector(".tag-graph__context")?.textContent).toContain("old / other");
    button("Cancel management and return to comparison").click();await vi.waitFor(()=>expect(button("Only A files").getAttribute("aria-pressed")).toBe("true"));expect(f.commands.startManual).not.toHaveBeenCalled();await f.view.onClose();
  });
  it("revokes paths and handoff immediately when scope or exclusions change",async()=>{
    const f=await mounted(fixture({old:usage("old",2),other:usage("other",1)}));await compare(f);button("Bring to management").click();
    f.update({scope:{include:[{path:"Elsewhere",recursive:true}]}});expect(document.querySelector(".tag-graph__context")).toBeNull();expect(document.querySelectorAll(".tag-graph__file")).toHaveLength(0);expect(document.querySelector(".tag-graph__details")?.textContent).toBe("");await f.view.onClose();
  });
  it("allows read-only comparison during recovery and retains stale provenance",async()=>{
    const f=await mounted(fixture({old:usage("old",2),other:usage("other",1)}));f.update({busy:true,recoveryRequired:true,historyError:"recovery",freshness:"stale",vaultRevision:2});await compare(f);
    expect(document.querySelector(".tag-graph__status")?.textContent).toContain("Stale index/evidence");expect(document.querySelector(".tag-graph")?.textContent).toContain("2026-09-10");button("Bring to management").click();expect(f.commands.startManual).not.toHaveBeenCalled();await f.view.onClose();
  });
  it("marks handoff stale after apply/undo revisions and revalidates missing endpoints on return",async()=>{
    const f=await mounted(fixture({old:usage("old",2),other:usage("other",1)}));await compare(f);button("Bring to management").click();
    // Applied writes and undo both advance the vault version; old evidence remains labelled.
    for(const vaultRevision of [2,3]){f.update({vaultRevision,freshness:"stale"});expect(document.querySelector(".tag-graph__context")?.textContent).toContain("Comparison is stale");}
    button(labels.history,document.querySelector(".tag-graph__context")!).click();expect(button(labels.history).getAttribute("aria-selected")).toBe("true");button(labels.tags).click();
    f.update({freshness:"ready",indexRevision:2,index:{updatedAt:"2026-10-28",tags:{other:usage("other")}}});
    button("Cancel management and return to comparison").click();
    await vi.waitFor(()=>expect(document.querySelector(".tag-graph__error")?.textContent).toContain("endpoint has no eligible files"));
    expect(f.commands.startManual).not.toHaveBeenCalled();expect(f.commands.undo).not.toHaveBeenCalled();await f.view.onClose();expect(f.listeners.size).toBe(0);
  });
  it("protection changes invalidate handoff evidence and do not authorize protected writes",async()=>{
    const f=await mounted(fixture({old:usage("old",2),other:usage("other",1)}));await compare(f);button("Bring to management").click();
    f.update({policy:{...f.state().policy,revision:2,protectedTags:[{tag:"old",mode:"exact"}]}});
    expect(document.querySelector(".tag-graph__context")?.textContent).toContain("Comparison is stale");
    document.querySelector<HTMLButtonElement>('[data-focus="tag-old"]')!.click();expect(button(labels.rename).disabled).toBe(true);
    expect(f.commands.startManual).not.toHaveBeenCalled();await f.view.onClose();
  });
  it("mobile entry stays explicitly unsupported without creating a worker",async()=>{
    Platform.isMobile=true;
    try{const f=await mounted();button("Relationships").click();expect(document.querySelector(".tag-graph")?.textContent).toContain("desktop only");expect(document.querySelector(".tag-graph")?.getAttribute("data-phase")).toBe("idle");button("Back to tags").click();expect(button(labels.tags).getAttribute("aria-selected")).toBe("true");await f.view.onClose();}
    finally{Platform.isMobile=false;}
  });
});

describe("native tag management workbench", () => {
  it.each([[0, "0 files"], [1, "1 file"], [2, "2 files"]] as const)("uses English file count %s in history DOM", async (count, expected) => {
    expect(labels.fileCount(count)).toBe(expected);
    expect(getManagementLabels("zh-CN").fileCount(count)).toBe(`${count} 个文件`);
    const f = fixture();
    f.update({ history: [{ id: "count", origin: "manual", action: "rename", status: "applied", canUndo: false, canRecover: false,
      files: Array.from({ length: count }, (_, i) => ({ path: `Project/${i}.md` })) }] });
    await mounted(f); button(labels.history).click();
    expect(document.querySelector(".tag-curator-workbench__history-row")?.textContent).toContain(` · ${expected} · `);
  });
  it("uses only 100 tag rows, preserves cross-page selection and clears on search/source", async () => {
    const f = await mounted(fixture(Object.fromEntries(Array.from({ length: 205 }, (_, i) => [`tag${i}`, usage(`tag${i}`)]))));
    expect(document.querySelectorAll("[data-tag]")).toHaveLength(100);
    input(labels.selectPage).click(); expect(document.body.textContent).toContain("100 tags selected");
    button(labels.next).click(); expect(document.body.textContent).toContain("100 tags selected");
    input(labels.selectPage).click(); expect(document.body.textContent).toContain("200 tags selected");
    fill(labels.search, "tag20"); expect(document.body.textContent).toContain("0 tags selected");
    expect(document.querySelectorAll("[data-tag]").length).toBeLessThan(100);
    input(labels.selectPage).click();
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Source"]')!; select.value = "inline"; select.dispatchEvent(new Event("change"));
    expect(document.body.textContent).toContain(labels.selectionCleared);
    expect(requestUrlMock).not.toHaveBeenCalled(); expect(f.commands.startManual).not.toHaveBeenCalled();
    await f.view.onClose(); expect(f.listeners.size).toBe(0);
  });

  it("deduplicates canonical identities and pages exact related files at 50", async () => {
    const f = await mounted(fixture({ old: usage("#Old", 51), alias: usage("old"), child: usage("old/child", 2) }));
    expect(projectManagementTags(f.state()).find(row => row.key === "old")?.files).toHaveLength(51);
    button("#Old").click(); const detail = document.querySelector(".tag-curator-workbench__detail")!;
    expect(Array.from(detail.querySelectorAll(".tag-curator-workbench__metrics > div")).map(el => [el.querySelector("dt")?.textContent, el.querySelector("dd")?.textContent]))
      .toEqual([[labels.distinctFiles, "51 files"], [labels.frontmatter, "51 files"], [labels.inline, "51 files"]]);
    expect(detail.querySelectorAll(".tag-curator-workbench__file-row")).toHaveLength(50);
    button(labels.next, detail).click(); expect(document.querySelectorAll(".tag-curator-workbench__file-row")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("9999");
  });

  it("keeps focus through refresh updates, arrow-key tabs and returns from narrow detail", async () => {
    const f = await mounted(); input(labels.search).focus(); fill(labels.search, "ol"); f.update({ freshness: "stale" });
    expect(document.activeElement).toBe(input(labels.search));
    button(labels.tags).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(button(labels.history).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(button(labels.history));
    button(labels.tags).click(); button("old").click(); button(labels.back).click(); expect(document.activeElement).toBe(button("old"));
  });

  it("distinguishes missing, empty, no result and broken history; disables stale writes", async () => {
    const f = await mounted(); button("old").click(); f.update({ freshness: "stale" }); expect(button(labels.rename).disabled).toBe(true);
    f.update({ index: null, freshness: "missing" }); expect(document.body.textContent).toContain(labels.missingBody);
    f.update({ index: { updatedAt: "", tags: {} }, freshness: "ready" }); expect(document.body.textContent).toContain(labels.empty);
    fill(labels.search, "none"); expect(document.body.textContent).toContain(labels.noResults);
    f.update({ historyError: "unknown schema" }); button(labels.history).click();
    expect(document.body.textContent).toContain("unknown schema"); expect(document.body.textContent).not.toContain(labels.noHistory);
  });

  it("keeps cancel refresh available while refresh promise is pending", async () => {
    const f = fixture(); let resolve!: () => void;
    f.commands.refresh.mockImplementation(() => new Promise<void>(done => { resolve = done; f.update({ freshness: "refreshing" }); }));
    await mounted(f); button(labels.refresh).click(); button(labels.cancelRefresh).click(); await Promise.resolve();
    expect(f.commands.cancelRefresh).toHaveBeenCalledTimes(1); resolve();
  });

  it.each(["en", "zh-CN"])("renders native localized navigation in %s", async language => {
    await mounted(fixture(), language); const l = getManagementLabels(language);
    expect(button(l.tags).getAttribute("role")).toBe("tab"); expect(button(l.settings).dataset.icon).toBe("sliders-horizontal");
  });
  it("never normalizes unsupported source text into an executable selection", async () => {
    await mounted(fixture({ invalid: usage("a b"), emoji: usage("😀") }));
    expect(input("a b").disabled).toBe(true); expect(input("😀").disabled).toBe(true);
    button("a b").click(); expect(button(labels.rename).disabled).toBe(true);
  });
  it("retains focus in the owning document instead of a different workspace window", async () => {
    const frame = document.createElement("iframe"); document.body.appendChild(frame); const doc = frame.contentDocument!;
    const prototype = Object.getPrototypeOf(doc.createElement("div"));
    for (const name of ["addClass", "empty", "createEl", "createDiv", "createSpan"]) {
      prototype[name] = (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
    }
    const f = fixture(); const view = new TagManagementView({ app: createFakeApp([]), document: doc } as never, { adapter: f.adapter }); await view.onOpen();
    const search = view.contentEl.querySelector<HTMLInputElement>('input[type="search"]')!; search.focus(); f.update({ freshness: "stale" });
    expect(doc.activeElement).toBe(view.contentEl.querySelector('input[type="search"]')); await view.onClose();
  });
});

describe("manual review boundary", () => {
  function open(f = fixture(), sources = ["old"], kind: "rename" | "merge" = "rename") {
    const modal = new TagManagementManualModal(createFakeApp([]) as never, f.adapter, labels, sources, kind); modal.open(); return { ...f, modal };
  }
  it.each(["123", "123/456", "１２３/٤٥٦", "Ⅻ/²", "a//b", "a b", "", "😀"])("rejects invalid target %s without dispatch", value => {
    const f = open(); fill(labels.target, value); confirm(); button(labels.preview).click();
    expect(document.body.textContent).toContain(labels.invalidTag); expect(f.commands.startManual).not.toHaveBeenCalled();
  });
  it.each(["123/456", "１２３/٤٥٦", "Ⅻ/²"])("keeps numeric hierarchy %s read-only as a source", async source => {
    await mounted(fixture({ [source]: usage(source) }));
    expect(input(source).disabled).toBe(true); button(source).click(); expect(button(labels.rename).disabled).toBe(true);
    const f = open(fixture({ [source]: usage(source) }), [source]); fill(labels.target, "valid/123"); confirm(); button(labels.preview).click();
    expect(f.commands.startManual).not.toHaveBeenCalled(); expect(document.body.textContent).toContain(labels.invalidTag);
  });
  it.each(["123/456", "１２３/٤٥٦", "Ⅻ/²", "123/a", "123/_", "123/-", "中文/123", "Ⅻ/字", "123//a"])("matches both core validators for %s", tag => {
    for (const validator of [validateTagText, validateTagLiteral]) {
      if (isManagementTagSupported(tag)) expect(validator(tag)).toBe(tag);
      else expect(() => validator(tag)).toThrow();
    }
  });
  it("requires new scope consent each time, preserves target literal and never submits source filter", async () => {
    const f = open(); fill(labels.target, " #New/中文 "); expect(button(labels.preview).disabled).toBe(true);
    confirm(); button(labels.preview).click(); await Promise.resolve();
    expect(f.commands.startManual).toHaveBeenCalledWith({ kind: "rename", source: "old", target: "New/中文", scope: f.state().scope }, expect.any(AbortSignal));
    f.modal.close(); open(f); expect(button(labels.preview).disabled).toBe(true);
  });
  it("rejects same identity and removes an existing target from merge sources", () => {
    const f = open(); fill(labels.target, "OLD"); confirm(); button(labels.preview).click(); expect(document.body.textContent).toContain(labels.sameTag);
    f.modal.close(); const next = open(fixture({ old: usage("old"), target: usage("target") }), ["old", "target"], "merge");
    fill(labels.target, "target"); confirm(); button(labels.preview).click();
    expect(next.commands.startManual.mock.calls[0]?.[0]).toEqual({ kind: "merge", sources: ["old"], target: "target", scope: next.state().scope });
  });
  it("blocks protected targets, >200 candidates and stale snapshots", () => {
    const f = fixture(); f.update({ policy: { ...f.state().policy, protectedTags: [{ tag: "status", mode: "subtree" }] } });
    let opened = open(f); fill(labels.target, "status/active"); confirm(); button(labels.preview).click(); expect(document.body.textContent).toContain(labels.protected); opened.modal.close();
    opened = open(fixture({ old: usage("old", 201) })); fill(labels.target, "new"); confirm(); button(labels.preview).click(); expect(document.body.textContent).toContain(labels.overLimit); opened.modal.close();
    opened = open(); fill(labels.target, "new"); confirm(); opened.update({ indexRevision: 2 }); button(labels.preview).click(); expect(document.body.textContent).toContain(labels.changed);
    expect(opened.commands.startManual).not.toHaveBeenCalled();
  });
  it("aborts preparation on close, ignores late failure and unsubscribes", async () => {
    const f = fixture(); let reject!: (error: Error) => void;
    f.commands.startManual.mockImplementation(() => new Promise<void>((_, fail) => { reject = fail; }));
    const opened = open(f); fill(labels.target, "new"); confirm(); button(labels.preview).click();
    const signal = f.commands.startManual.mock.calls[0]?.[1] as AbortSignal;
    button(labels.cancel).click(); expect(signal.aborted).toBe(true); expect(f.listeners.size).toBe(0);
    reject(new Error("late")); await Promise.resolve(); await Promise.resolve();
    expect(openModals).toHaveLength(0); expect(document.body.textContent).not.toContain("late");
  });
  it("hands focus to a newly opened review without aborting its completed preparation", async () => {
    const f = fixture(); let reviewButton!: HTMLButtonElement;
    f.commands.startManual.mockImplementation(async () => {
      const review = new Modal(createFakeApp([])); reviewButton = review.contentEl.createEl("button", { text: "Review selection" }); review.open();
    });
    open(f); fill(labels.target, "new"); confirm(); button(labels.preview).click(); await Promise.resolve(); await Promise.resolve();
    expect(document.activeElement).toBe(reviewButton); expect(f.commands.startManual.mock.calls[0][1].aborted).toBe(false);
    expect(openModals).toHaveLength(1);
  });
});

describe("policy and history modals", () => {
  it("saves structured policy and rejects invalid/missing scope paths", () => {
    const f = fixture(); new TagManagementPolicyModal(createFakeApp([]) as never, f.adapter, labels).open();
    fill(labels.scope, "../Secret"); button(labels.save).click(); expect(document.body.textContent).toContain(labels.invalidPath);
    fill(labels.scope, "Missing"); button(labels.save).click(); expect(f.commands.saveScopeAndPolicy).not.toHaveBeenCalled();
    fill(labels.scope, "Project"); button(labels.save).click();
    expect(f.commands.saveScopeAndPolicy).toHaveBeenCalledWith({ include: [{ path: "Project", recursive: true }] }, f.state().policy);
  });
  it("preserves explicit root exclusions rather than silently clearing them", () => {
    const f = fixture(); f.update({ policy: { ...f.state().policy, excludedFolders: [""] } });
    new TagManagementPolicyModal(createFakeApp([]) as never, f.adapter, labels).open();
    expect(input(labels.excludeRoot).checked).toBe(true); button(labels.save).click();
    expect(f.commands.saveScopeAndPolicy).toHaveBeenCalledWith(f.state().scope, f.state().policy);
  });
  it("renders only minimal historical changes and rechecks undo eligibility before dispatch", async () => {
    const f = fixture(); const entry = { id: "one", origin: "manual", action: "rename", status: "applied", canUndo: true, canRecover: false,
      files: [{ path: "Project/a.md", beforeTags: ["Old"], afterTags: ["new"], inlineChanges: [{ before: "#Old", after: "#new", line: 2 }] }], policyExceptions: ["Project"] };
    f.update({ history: [entry] }); await mounted(f); button(labels.history).click(); button(`${labels.historyActions.rename} · ${labels.historyOrigins.manual}`).click();
    expect(document.body.textContent).toContain("#Old → #new"); button(labels.undo).focus(); button(labels.undo).click();
    expect(document.body.textContent).toContain(labels.exceptions);
    f.update({ history: [{ ...entry, canUndo: false }] }); expect(button(labels.confirmUndo).disabled).toBe(true);
    button(labels.confirmUndo).click(); expect(f.commands.undo).not.toHaveBeenCalled(); button(labels.cancel).click();
  });
  it("recovery stays available despite forward-write gate and dispatches fixed id once", async () => {
    const f = fixture(); f.update({ recoveryRequired: true, history: [{ id: "recover-me", origin: "batch", action: "addTags", status: "recoveryRequired", files: [], unresolved: true, canUndo: false, canRecover: true }] });
    new TagManagementHistoryModal(createFakeApp([]) as never, f.adapter, labels, "recover-me", "recover").open();
    button(labels.confirmRecovery).click(); button(labels.confirmRecovery).click(); expect(f.commands.recover).toHaveBeenCalledExactlyOnceWith("recover-me"); await Promise.resolve();
  });
  it("restores initiating button after an asynchronous view rerender", async () => {
    const f = await mounted(); button(labels.settings).focus(); button(labels.settings).click();
    f.update({ freshness: "stale" }); button(labels.cancel).click(); expect(document.activeElement).toBe(button(labels.settings));
  });
  it("uses a styled text input for protection and returns focus after removal", () => {
    const f = fixture(); new TagManagementPolicyModal(createFakeApp([]) as never, f.adapter, labels).open();
    button(labels.addProtection).click(); expect(input(labels.tag).getAttribute("type")).toBe("text");
    fill(labels.tag, "status"); const row = input(labels.tag).closest(".tag-curator-workbench__rule")!;
    button(labels.remove, row).click(); expect(document.activeElement).toBe(button(labels.addProtection));
    button(labels.save).click(); expect(f.commands.saveScopeAndPolicy).toHaveBeenCalledWith(f.state().scope, f.state().policy);
  });
  it.each(["en", "zh-CN"])("shows invalid folder updates immediately in view and open policy modal in %s", async language => {
    const l = getManagementLabels(language); const f = await mounted(fixture(), language);
    expect(document.querySelector("[data-invalid-folders]")).toBeNull(); button(l.settings).click();
    const invalidFolders = ["Project/很长的已改名目录-with-English-components", "Project/Archive"];
    f.update({ invalidFolders });
    const warnings = document.querySelectorAll("[data-invalid-folders]"); expect(warnings).toHaveLength(2);
    for (const warning of Array.from(warnings)) {
      expect(warning.textContent).toContain(l.invalidFolders);
      for (const path of invalidFolders) expect(warning.textContent).toContain(path);
      expect(warning.getAttribute("aria-live")).toBe("polite");
    }
    expect(f.commands.saveScopeAndPolicy).not.toHaveBeenCalled();
    expect(f.state().scope).toEqual({ include: [{ path: "", recursive: true }] });
    f.update({ invalidFolders: [] }); expect(document.querySelector(".tag-curator-workbench [data-invalid-folders]")).toBeNull();
    expect(document.querySelector(".modal-content [data-invalid-folders]")?.textContent).toBe("");
  });
});

describe("localized history filters", () => {
  const entry = (id: string, patch: Partial<ManagementHistoryEntry> = {}): ManagementHistoryEntry => ({
    id, origin: "manual", action: "rename", status: "applied", files: [{ path: `Project/${id}.md` }], canUndo: false, canRecover: false, ...patch,
  });
  const historyRows = () => Array.from(document.querySelectorAll(".tag-curator-workbench__history-row button")).map(el => (el as HTMLElement).dataset.focus);
  it.each(["en", "zh-CN"])("renders recorded model or unknown and separates raw/legacy evidence in %s", async language => {
    const l = getManagementLabels(language); const f = fixture();
    const history = [entry("recorded", { origin: "recommendation", model: "RecordedModel/2026", canUndo: true }),
      entry("missing-model", { origin: "batch", legacy: true }), entry("manual"), entry("health", { origin: "health" })];
    f.update({ history }); await mounted(f, language); button(l.history).click();
    document.querySelector<HTMLButtonElement>('[data-focus="history-recorded"]')!.click();
    let detail = document.querySelector(".tag-curator-workbench__detail")!;
    expect(detail.textContent).toContain(`${l.recordedModel}: RecordedModel/2026`); expect(detail.textContent).toContain(l.rawHistory);
    button(l.undo).click(); expect(document.querySelector(".modal-content")?.textContent).toContain(`${l.recordedModel}: RecordedModel/2026`);
    expect(document.querySelector(".modal-content")?.textContent).toContain(l.rawHistory); button(l.cancel).click();
    button(l.back).click(); document.querySelector<HTMLButtonElement>('[data-focus="history-missing-model"]')!.click();
    detail = document.querySelector(".tag-curator-workbench__detail")!;
    expect(detail.textContent).toContain(`${l.recordedModel}: ${l.unknown}`); expect(detail.textContent).toContain(l.legacy);
    expect(detail.textContent).not.toContain("RecordedModel/2026"); expect(detail.textContent).not.toContain(l.rawHistory);
    for (const id of ["manual", "health"]) {
      button(l.back).click(); document.querySelector<HTMLButtonElement>(`[data-focus="history-${id}"]`)!.click();
      expect(document.querySelector(".tag-curator-workbench__detail")?.textContent).not.toContain(l.recordedModel);
    }
  });
  it.each(["en", "zh-CN"])("filters localized values, paths, raw tags and inline tokens without granting undo in %s", async language => {
    const l = getManagementLabels(language); const f = fixture();
    f.update({ history: [entry("latest", { canUndo: true }), entry("older", { origin: "recommendation", action: "addTags", unavailableReason: "notLatest",
      files: [{ path: "Project/超长中文目录/旧笔记.md", beforeTags: ["KeepCASE"], inlineChanges: [{ before: "#OnlyBody", after: "#AfterBody" }] }] }), entry("receipt", { status: "undone" })] });
    await mounted(f, language); button(l.history).click();
    for (const query of [l.historyOrigins.recommendation, l.historyActions.addTags, "旧笔记", "keepcase", "#onlybody", "#afterbody"]) {
      fill(l.historySearch, query); expect(historyRows()).toEqual(["history-older"]);
    }
    button(`${l.historyActions.addTags} · ${l.historyOrigins.recommendation}`).click();
    expect(document.querySelector('[data-focus="undo"]')).toBeNull(); expect(document.body.textContent).toContain(l.historyReasons.notLatest);
    fill(l.historySearch, ""); select(l.historyOrigin, "manual"); select(l.historyStatus, "undone");
    expect(historyRows()).toEqual(["history-receipt"]); expect(document.querySelector(".tag-curator-workbench__split--detail")).toBeNull();
    select(l.historyStatus, "recoveryRequired"); expect(document.body.textContent).toContain(l.noHistoryResults);
    button(l.clearFilters).click(); expect(historyRows()).toHaveLength(3); expect(document.activeElement).toBe(input(l.historySearch));
    expect(f.commands.undo).not.toHaveBeenCalled(); expect(f.state().history[1].canUndo).toBe(false);
  });
  it("keeps hidden unresolved history blocking writes and prioritizes it without timestamp sorting", async () => {
    const f = fixture(); f.update({ history: [entry("latest", { canUndo: true, createdAt: "2000-01-01" }), entry("unfinished", { origin: "batch", status: "recoveryRequired", unresolved: true, canRecover: true })] });
    await mounted(f); button(labels.history).click(); expect(historyRows()).toEqual(["history-unfinished", "history-latest"]);
    select(labels.historyOrigin, "manual"); button(`${labels.historyActions.rename} · ${labels.historyOrigins.manual}`).click();
    expect(button(labels.undo).disabled).toBe(true); expect(document.body.textContent).toContain(labels.recoveryBlocked);
    button(labels.tags).click(); button("old").click(); expect(button(labels.rename).disabled).toBe(true);
  });
  it.each(["en", "zh-CN"])("localizes all known enums and filters unknown values safely in %s", async language => {
    const l = getManagementLabels(language);
    for (const [kind, values] of [["origin", l.historyOrigins], ["action", l.historyActions], ["status", l.historyStatuses], ["reason", l.historyReasons]] as const) {
      for (const [key, value] of Object.entries(values)) expect(managementHistoryText(l, kind, key)).toBe(value);
    }
    const f = fixture(); f.update({ history: [entry("future", { origin: "futureOrigin", action: "toString", status: "futureStatus", unavailableReason: "invalidHistory" }), entry("known")] });
    await mounted(f, language); button(l.history).click(); select(l.historyOrigin, "unknown"); select(l.historyStatus, "unknown");
    expect(historyRows()).toEqual(["history-future"]); expect(document.body.textContent).toContain(l.historyActions.unknown);
    expect(document.body.textContent).toContain(l.historyReasons.invalidHistory); expect(document.body.textContent).not.toContain("futureStatus");
  });
  it("bounds history lists and file detail pages, resets search pagination and clamps after updates", async () => {
    const f = fixture(); const history = Array.from({ length: 105 }, (_, i) => entry(`entry-${i}`, { files: Array.from({ length: 51 }, (_, j) => ({ path: `Project/${i}/${j}.md` })) }));
    f.update({ history }); await mounted(f); button(labels.history).click(); expect(historyRows()).toHaveLength(50);
    button(labels.next).click(); expect(historyRows()[0]).toBe("history-entry-50");
    fill(labels.historySearch, "Project/104/"); expect(historyRows()).toEqual(["history-entry-104"]);
    document.querySelector<HTMLButtonElement>('[data-focus="history-entry-104"]')!.click();
    expect(document.querySelectorAll(".tag-curator-workbench__file-row")).toHaveLength(50);
    document.querySelector<HTMLButtonElement>('[data-focus="history-files-next"]')!.click(); expect(document.querySelectorAll(".tag-curator-workbench__file-row")).toHaveLength(1);
    f.update({ history: [entry("entry-104")] }); expect(document.querySelectorAll(".tag-curator-workbench__file-row")).toHaveLength(1);
    expect(document.querySelector('[data-focus="history-files-next"]')).toBeNull();
    button(labels.back).click(); expect(document.activeElement).toBe(input(labels.historySearch));
  });
});
