import { ItemView, Platform, setIcon, type WorkspaceLeaf } from "obsidian";
import { TagGraphPanel, type TagRelationshipContext } from "../graph/TagGraphPanel";
import { scopeKey as graphScopeKey, snapshotKey as graphSnapshotKey } from "../graph/TagRelationshipModel";
import type { TagIndex, TagFileUsage } from "../index/TagIndex";
import { getManagementLabels, managementHistoryText, type ManagementLabels } from "../ui/managementLabels";
import { TagManagementPolicyModal, TagManagementManualModal, TagManagementHistoryModal } from "./TagManagementModals";
import { TagManagementViewModel, type TagManagementRow } from "./TagManagementViewModel";
import { normalizeTag } from "../utils/normalizeTag";
import { pathInScope } from "./TagScope";
import { isProtectedTag, pathExcluded } from "../policy/TagMutationPolicy";

export const TAG_MANAGEMENT_VIEW_TYPE = "tag-curator-management";
export interface ManagementScope { include: Array<{ path: string; recursive: boolean }> }
export interface ManagementPolicy {
  schemaVersion: 1; revision: number; excludedFolders: string[];
  protectedTags: Array<{ tag: string; mode: "exact" | "subtree" }>;
}
// A minimal presentation projection, never raw operation objects or full note contents.
export interface ManagementHistoryEntry {
  id: string; createdAt?: string; origin: string; action: string; status: string;
  files: Array<{ path: string; beforeTags?: string[]; afterTags?: string[]; inlineChanges?: Array<{ before: string; after: string; line?: number }> }>;
  canUndo: boolean; canRecover: boolean; unresolved?: boolean; readOnlyReason?: string; unavailableReason?: string;
  legacy?: boolean; policyExceptions?: string[]; model?: string;
}
export interface TagManagementState {
  index: TagIndex | null;
  freshness: "missing" | "ready" | "stale" | "refreshing" | "error";
  indexRevision?: number; scope: ManagementScope; policy: ManagementPolicy;
  vaultRevision?: number; readInlineTags?: boolean;
  history: ManagementHistoryEntry[]; historyError?: string; error?: string;
  busy?: boolean; recoveryRequired?: boolean; failedPaths?: string[];
  progress?: { completed: number; total: number }; folders?: string[]; missingPaths?: string[]; invalidFolders?: string[];
}
export type ManagementManualIntent =
  | { kind: "rename"; source: string; target: string; scope: ManagementScope }
  | { kind: "merge"; sources: string[]; target: string; scope: ManagementScope };
export interface TagManagementAdapter {
  getState(): TagManagementState;
  subscribe(listener: () => void): () => void;
  commands: {
    refresh(): Promise<void> | void; cancelRefresh(): Promise<void> | void;
    saveScopeAndPolicy(scope: ManagementScope, policy: ManagementPolicy): Promise<void>;
    // The service owns validation, hydration generation, review and all writes. Honor signal after awaits.
    startManual(intent: ManagementManualIntent, signal: AbortSignal): Promise<void>;
    openFile(path: string): Promise<void> | void;
    openGraphFile?(path: string): Promise<void> | void;
    undo(recordId: string): Promise<void>; recover(recordId: string): Promise<void>;
    openHealth?(): Promise<void> | void;
    openGraphSettings?(): void;
  };
}
export interface TagManagementViewProps { adapter: TagManagementAdapter; language?: string }
export interface ManagementTagRow { key: string; tag: string; files: TagFileUsage[] }

export function isManagementTagSupported(tag: string): boolean {
  return /^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(tag) && /[^\p{N}/]/u.test(tag);
}
export function isManagementTagProtected(tag: string, policy: ManagementPolicy): boolean {
  return isProtectedTag(tag, policy);
}
export function managementPathInScope(path: string, scope: ManagementScope, policy: ManagementPolicy): boolean {
  return pathInScope(path, scope) && !pathExcluded(path, policy);
}
export function projectManagementTags(state: TagManagementState): ManagementTagRow[] {
  const rows = new Map<string, { tag: string; files: Map<string, TagFileUsage> }>();
  for (const usage of Object.values(state.index?.tags ?? {})) {
    const key = normalizeTag(usage.normalized || usage.tag);
    let row = rows.get(key);
    if (!row) { row = { tag: usage.tag, files: new Map() }; rows.set(key, row); }
    for (const file of usage.files) {
      if (!managementPathInScope(file.path, state.scope, state.policy)) continue;
      const existing = row.files.get(file.path);
      row.files.set(file.path, { path: file.path, count: 1, sources: [...new Set([...(existing?.sources ?? []), ...file.sources])] });
    }
  }
  return [...rows].filter(([, row]) => row.files.size).map(([key, row]) => ({ key, tag: row.tag, files: [...row.files.values()].sort((a, b) => a.path.localeCompare(b.path)) }));
}

export class TagManagementView extends ItemView {
  private readonly adapter: TagManagementAdapter;
  private readonly labels: ManagementLabels;
  private unsubscribe?: () => void;
  private tab: "tags" | "history" | "relationships" = "tags";
  private frame?: HTMLElement;
  private graphHost?: HTMLElement;
  private graphPanel?: TagGraphPanel;
  private relationshipContext?: TagRelationshipContext;
  private readonly language: string;
  private graphState?: TagManagementState;
  private search = "";
  private source = "all";
  private sort = "count";
  private page = 0;
  private filePage = 0;
  private detail?: string;
  private historyDetail?: string;
  private historySearch = "";
  private historyOrigin = "all";
  private historyStatus = "all";
  private historyPage = 0;
  private historyFilePage = 0;
  private selected = new Set<string>();
  private scopeKey = "";
  private notice = "";
  private localError = "";
  private pending = false;
  private alive = false;
  private modals = new Set<TagManagementPolicyModal | TagManagementManualModal | TagManagementHistoryModal>();
  private model = new TagManagementViewModel();

  constructor(leaf: WorkspaceLeaf, props: TagManagementViewProps) {
    super(leaf); this.adapter = props.adapter; this.language=props.language??"en"; this.labels = getManagementLabels(this.language);
  }
  getViewType(): string { return TAG_MANAGEMENT_VIEW_TYPE; }
  getDisplayText(): string { return this.labels.title; }
  getIcon(): string { return "tags"; }
  getState(): Record<string, unknown> { return { tab: this.tab, scope: this.adapter.getState().scope }; }
  async setState(state: Record<string, unknown>): Promise<void> {
    this.tab = state.tab === "relationships" ? "relationships" : state.tab === "history" ? "history" : "tags";
    // Scope persistence/restoration belongs to the adapter; never restore transient selections or search.
    if (this.alive) this.render();
  }
  async onOpen(): Promise<void> {
    this.alive = true; this.contentEl.addClass("tag-curator-workbench");
    this.unsubscribe?.(); this.unsubscribe = this.adapter.subscribe(() => { if (this.alive) this.render(); }); this.render();
  }
  async onClose(): Promise<void> {
    this.alive = false; this.unsubscribe?.(); this.unsubscribe = undefined;
    this.graphPanel?.dispose(); this.graphPanel=undefined;this.graphHost=undefined;this.frame=undefined;this.relationshipContext=undefined;
    for (const modal of this.modals) modal.close(); this.modals.clear(); this.contentEl.empty();
  }
  private blocked(state: TagManagementState): boolean {
    return this.pending || !!state.busy || !!state.historyError || !!state.recoveryRequired || state.history.some(entry => entry.unresolved) || state.freshness !== "ready" || !state.index;
  }
  private button(parent: HTMLElement, label: string, icon: string | undefined, action: () => void, key: string, disabled = false): HTMLButtonElement {
    const button = parent.createEl("button", { attr: { type: "button", "aria-label": label, "data-focus": key, title: label } });
    if (icon) { button.addClass("tag-curator-workbench__icon"); setIcon(button, icon); } else button.textContent = label;
    button.disabled = disabled; button.addEventListener("click", action); return button;
  }
  private async run(action: () => Promise<void> | void): Promise<void> {
    if (this.pending) return; this.pending = true; this.localError = ""; this.render();
    try { await action(); } catch (error) { this.localError = error instanceof Error ? error.message : this.labels.failure; }
    finally { this.pending = false; if (this.alive) this.render(); }
  }
  private openModal(modal: TagManagementPolicyModal | TagManagementManualModal | TagManagementHistoryModal): void {
    this.modals.add(modal); modal.onDismiss = () => this.modals.delete(modal); modal.open();
  }
  private clearForFilter(): void { this.selected.clear(); this.page = 0; this.notice = this.labels.selectionCleared; }
  private clearHistoryDetail(): void { this.historyPage = 0; this.historyFilePage = 0; this.historyDetail = undefined; }
  private render(): void {
    const doc = this.contentEl.ownerDocument;
    const active = doc.activeElement as HTMLInputElement | null;
    const focusKey = this.contentEl.contains(active) ? active?.dataset.focus : undefined;
    const caret = active?.tagName === "INPUT" && active.type === "search" ? active.selectionStart : null;
    const state = this.adapter.getState(); const l = this.labels;
    this.graphState=state;
    const key = JSON.stringify(state.scope);
    if (this.scopeKey && key !== this.scopeKey) { this.clearForFilter(); this.detail = undefined; }
    this.scopeKey = key;
    this.frame ??= this.contentEl.createDiv({cls:"tag-curator-workbench__frame"});
    this.frame.classList.toggle("tag-curator-workbench__frame--graph",this.tab==="relationships");
    this.frame.empty();
    if(this.relationshipContext&&this.relationshipContext.result.identity.scopeKey!==graphScopeKey(state))this.relationshipContext=undefined;
    this.graphPanel?.update();
    const header = this.frame.createDiv({ cls: "tag-curator-workbench__toolbar" });
    header.createEl("h2", { text: l.title });
    this.button(header, state.freshness === "refreshing" ? l.cancelRefresh : l.refresh, state.freshness === "refreshing" ? "x" : "refresh-cw", () => {
      // Cancellation must stay reachable while the refresh promise is pending.
      if (state.freshness === "refreshing") void Promise.resolve().then(() => this.adapter.commands.cancelRefresh()).catch(error => { this.localError = String(error); if (this.alive) this.render(); });
      else void this.run(() => this.adapter.commands.refresh());
    }, "refresh", state.freshness !== "refreshing" && (this.pending || !!state.busy));
    this.button(header, l.settings, "sliders-horizontal", () => this.openModal(new TagManagementPolicyModal(this.app, this.adapter, l)), "settings");
    if (this.adapter.commands.openHealth) this.button(header, l.health, "activity", () => void this.run(() => this.adapter.commands.openHealth?.()), "health");
    const status = this.frame.createDiv({ cls: "tag-curator-workbench__status", attr: { role: "status", "aria-live": "polite" } });
    status.createSpan({ text: l[state.freshness] });
    if (state.index) status.createSpan({ text: state.index.updatedAt });
    if (state.progress) status.createSpan({ text: l.progress(state.progress.completed, state.progress.total) });
    if (state.failedPaths?.length) status.createSpan({ text: l.failed(state.failedPaths.length) });
    if (state.busy) status.createSpan({ text: l.busy });
    if (state.recoveryRequired || state.history.some(entry => entry.unresolved)) status.createSpan({ text: l.recoveryBlocked });
    if (this.notice) status.createSpan({ text: this.notice });
    if (state.error || state.historyError || this.localError) this.frame.createDiv({ cls: "tag-curator-workbench__error", text: [state.historyError && l.historyError, state.historyError, state.error, this.localError].filter(Boolean).join(": "), attr: { role: "alert" } });
    if (state.invalidFolders?.length) this.frame.createDiv({ cls: "tag-curator-workbench__error", text: `${l.invalidFolders}: ${state.invalidFolders.map(path => path || l.root).join(", ")}`, attr: { role: "status", "aria-live": "polite", "data-invalid-folders": "true" } });
    const tabs = this.frame.createDiv({ cls: "tag-curator-workbench__tabs", attr: { role: "tablist", "aria-label": l.title } });
    const tabLabels={...l,relationships:this.language.startsWith("zh")?"关系图":"Relationships"};
    const tabOrder=["tags","history","relationships"] as const;
    for (const tab of tabOrder) {
      const button = this.button(tabs, tabLabels[tab], undefined, () => { this.tab = tab; this.render(); }, `tab-${tab}`);
      button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(this.tab === tab)); button.tabIndex = this.tab === tab ? 0 : -1;
      button.addEventListener("keydown", event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); this.tab = event.key === "Home" ? "tags" : event.key === "End" ? "relationships" : tabOrder[(tabOrder.indexOf(this.tab)+(event.key==="ArrowRight"?1:2))%3]; this.render(); this.contentEl.querySelector<HTMLButtonElement>(`[data-focus="tab-${this.tab}"]`)?.focus(); } });
    }
    if(this.tab==="relationships"){
      this.ensureGraph().show();
    }else{
      this.graphPanel?.hide();
      const panel = this.frame.createDiv({ cls: "tag-curator-workbench__panel", attr: { role: "tabpanel", "aria-label": tabLabels[this.tab] } });
      if(this.tab==="tags"){
        if(this.relationshipContext){
          const c=this.relationshipContext,r=c.result,v=r.value;
          if(v.kind==="comparison"){
            const box=panel.createDiv({cls:"tag-graph__context"});box.createEl("p",{text:`${r.data.tags[v.a]} / ${r.data.tags[v.b]} · ${r.query.source} · ${this.language.startsWith("zh")?"只读比较上下文：请另行选择操作和范围，浏览来源不代表修改范围。":"Read-only comparison: choose the operation and scope separately; browse sources do not authorize changes."}`});
            if(r.snapshotKey!==graphSnapshotKey(state)||r.index!==state.index)box.createEl("p",{text:this.language.startsWith("zh")?"比较已过期，请显式刷新索引。":"Comparison is stale; refresh the index explicitly."});
            this.button(box,this.language.startsWith("zh")?"取消整理，返回比较":"Cancel management and return to comparison",undefined,()=>{this.tab="relationships";this.render();this.ensureGraph().restore(c);},"return-comparison");
            this.button(box,l.history,undefined,()=>{this.tab="history";this.render();},"comparison-history");
          }
        }
        this.renderTags(panel,state);
      }else this.renderHistory(panel,state);
    }
    if (focusKey) {
      const next = Array.from(this.contentEl.querySelectorAll<HTMLElement>("[data-focus]")).find(el => el.dataset.focus === focusKey);
      next?.focus(); if (caret !== null && next?.tagName === "INPUT") (next as HTMLInputElement).setSelectionRange(caret, caret);
    }
  }
  private ensureGraph():TagGraphPanel{
    if(!this.graphPanel){
      this.graphHost=this.contentEl.createDiv({attr:{role:"tabpanel","aria-label":this.language.startsWith("zh")?"关系图":"Relationships"}});
      this.graphPanel=new TagGraphPanel(this.graphHost,{state:()=>this.graphState??this.adapter.getState(),language:this.language,mobile:Platform?.isMobile??false,
        openFile:path=>(this.adapter.commands.openGraphFile??this.adapter.commands.openFile)(path),refresh:()=>this.adapter.commands.refresh(),
        settings:()=>{if(this.adapter.commands.openGraphSettings)this.adapter.commands.openGraphSettings();else this.openModal(new TagManagementPolicyModal(this.app,this.adapter,this.labels));},
        showTag:key=>{this.tab="tags";this.selected.clear();this.search="";this.source="all";this.detail=key;this.filePage=0;this.render();},
        handoff:context=>{this.relationshipContext=context;this.selected.clear();this.detail=undefined;this.tab="tags";this.render();}
      });
    }return this.graphPanel;
  }
  openRelationships(root?:string):void{this.tab="relationships";if(this.alive){this.render();if(root)this.ensureGraph().show(root,this.source as "all"|"inline"|"frontmatter");}}
  private pager(parent: HTMLElement, page: number, total: number, size: number, change: (page: number) => void, key: string): void {
    const pages = Math.max(1, Math.ceil(total / size));
    const bar = parent.createDiv({ cls: "tag-curator-workbench__pager" });
    this.button(bar, this.labels.previous, "chevron-left", () => change(page - 1), `${key}-previous`, page === 0);
    bar.createSpan({ text: this.labels.page(page + 1, pages) });
    this.button(bar, this.labels.next, "chevron-right", () => change(page + 1), `${key}-next`, page >= pages - 1);
  }
  private renderTags(panel: HTMLElement, state: TagManagementState): void {
    const l = this.labels;
    this.model.setIndex(state.index, state.indexRevision);
    const filter = { scope: state.scope, excludedFolders: state.policy.excludedFolders };
    const filters = panel.createDiv({ cls: "tag-curator-workbench__filters" });
    const search = filters.createEl("input", { attr: { type: "search", placeholder: l.search, "aria-label": l.search, "data-focus": "search" } });
    search.value = this.search; search.addEventListener("input", () => { this.search = search.value; this.clearForFilter(); this.render(); });
    for (const [name, value, options] of [["source", this.source, [["all", l.all], ["frontmatter", l.frontmatter], ["inline", l.inline]]], ["sort", this.sort, [["count", l.countSort], ["name", l.nameSort]]]] as const) {
      const label = filters.createEl("label", { text: l[name] }); const select = label.createEl("select", { attr: { "aria-label": l[name], "data-focus": name } });
      for (const [value, text] of options) select.createEl("option", { text, attr: { value } });
      select.value = value; select.addEventListener("change", () => { if (name === "source") { this.source = select.value; this.clearForFilter(); } else { this.sort = select.value; this.page = 0; } this.render(); });
    }
    panel.createDiv({ cls: "tag-curator-workbench__muted", text: `${l.scope}: ${state.scope.include.map(rule => `${rule.path || l.root}${rule.recursive ? " /..." : ""}`).join(", ")}` });
    const result = this.model.query({ ...filter, search: this.search, source: this.source as "all" | "inline" | "frontmatter", sort: this.sort === "count" ? "fileCount" : "tag", page: this.page + 1 });
    this.page = result.page - 1;
    const page = result.items;
    if (result.hasIndex) panel.createDiv({ cls: "tag-curator-workbench__result-count", text: this.search || this.source !== "all" ? l.resultCount(result.total, result.totalTags) : l.tagCount(result.totalTags) });
    const layout = panel.createDiv({ cls: `tag-curator-workbench__split${this.detail ? " tag-curator-workbench__split--detail" : ""}` });
    const list = layout.createDiv({ cls: "tag-curator-workbench__list" });
    if (!state.index) list.createEl("p", { text: l.missingBody });
    else if (!result.total) list.createEl("p", { text: this.search || this.source !== "all" ? l.noResults : l.empty });
    const selectable = (row: TagManagementRow) => isManagementTagSupported(row.tagText.trim().replace(/^#/, "")) && !isManagementTagProtected(row.tagKey, state.policy);
    const pageLabel = list.createEl("label", { cls: "tag-curator-workbench__toolbar" });
    const all = pageLabel.createEl("input", { attr: { type: "checkbox", "aria-label": l.selectPage, "data-focus": "select-page" } });
    const eligible = page.filter(selectable); all.disabled = eligible.length === 0;
    all.checked = eligible.length > 0 && eligible.every(row => this.selected.has(row.tagKey)); all.indeterminate = !all.checked && eligible.some(row => this.selected.has(row.tagKey));
    pageLabel.createSpan({ text: l.selectPage });
    all.addEventListener("change", () => { for (const row of eligible) { if (all.checked) this.selected.add(row.tagKey); else this.selected.delete(row.tagKey); } this.render(); });
    for (const row of page) {
      const line = list.createDiv({ cls: "tag-curator-workbench__tag-row", attr: { "data-tag": row.tagKey } });
      const check = line.createEl("input", { attr: { type: "checkbox", "aria-label": row.tagText, "data-focus": `select-${row.tagKey}` } });
      check.checked = this.selected.has(row.tagKey); check.disabled = !selectable(row);
      check.addEventListener("change", () => { if (check.checked) this.selected.add(row.tagKey); else this.selected.delete(row.tagKey); this.render(); });
      line.classList.toggle("tag-curator-workbench__row--active", row.tagKey === this.detail);
      this.button(line, row.tagText, undefined, () => { this.detail = row.tagKey; this.filePage = 0; this.render(); this.contentEl.querySelector<HTMLElement>('[data-focus="detail-back"]')?.focus(); }, `tag-${row.tagKey}`).addClass("tag-curator-workbench__link");
      line.createSpan({ text: l.fileCount(row.fileCount) });
      line.createSpan({ cls: "tag-curator-workbench__muted", text: [row.frontmatterFileCount && `${l.frontmatter} ${row.frontmatterFileCount}`, row.inlineFileCount && `${l.inline} ${row.inlineFileCount}`, row.metadataFileCount && `${l.metadata} ${row.metadataFileCount}`].filter(Boolean).join(" / ") });
      if (!selectable(row)) line.createSpan({ cls: "tag-curator-workbench__reason", text: isManagementTagProtected(row.tagKey, state.policy) ? l.protected : l.unsupported });
    }
    this.pager(list, this.page, result.total, 100, page => { this.page = page; this.render(); }, "tags");
    const detail = layout.createDiv({ cls: "tag-curator-workbench__detail" });
    // Exact lookup within the model's filtered projection, independent of the browser's source filter.
    let row: TagManagementRow | undefined;
    if (this.detail) {
      let lookupPage = 1;
      do {
        const matches = this.model.query({ ...filter, search: this.detail, sort: "tag", page: lookupPage });
        row = matches.items.find(row => row.tagKey === this.detail);
        if (row || lookupPage >= matches.pageCount) break;
        lookupPage++;
      } while (!row);
    }
    if (this.detail) {
      this.button(detail, l.back, "arrow-left", () => { const key = this.detail; this.detail = undefined; this.render(); Array.from(this.contentEl.querySelectorAll<HTMLElement>("[data-focus]")).find(el => el.dataset.focus === `tag-${key}`)?.focus(); }, "detail-back");
    }
    if (row) {
      detail.createEl("h3", { text: row.tagText });
      this.button(detail,this.language.startsWith("zh")?"查看关系":"View relationships",undefined,()=>this.openRelationships(row!.tagKey),"tag-relationships");
      const metrics = detail.createEl("dl", { cls: "tag-curator-workbench__metrics" });
      for (const [name, count] of [[l.distinctFiles, row.fileCount], [l.frontmatter, row.frontmatterFileCount], [l.inline, row.inlineFileCount], ...(row.metadataFileCount ? [[l.metadata, row.metadataFileCount] as const] : [])] as const) {
        const metric = metrics.createDiv(); metric.createEl("dt", { text: name }); metric.createEl("dd", { text: l.fileCount(count) });
      }
      if (!selectable(row)) detail.createEl("p", { text: isManagementTagProtected(row.tagKey, state.policy) ? l.protected : l.unsupported });
      const parentKey = row.tagKey;
      detail.createEl("p", { text: l.children(new Set(Object.values(state.index?.tags ?? {}).map(tag => normalizeTag(tag.normalized || tag.tag)).filter(key => key.startsWith(`${parentKey}/`))).size) });
      this.button(detail, l.rename, undefined, () => this.manual([row.tagKey], "rename"), "rename", this.blocked(state) || !selectable(row));
      detail.createEl("h4", { text: l.relatedFiles });
      const files = this.model.getRelatedFiles(row.tagKey, { ...filter, page: this.filePage + 1 }); this.filePage = files.page - 1;
      for (const file of files.items) {
        const line = detail.createDiv({ cls: "tag-curator-workbench__file-row" });
        this.button(line, file.path, undefined, () => void this.run(() => this.adapter.commands.openFile(file.path)), `file-${file.path}`, state.missingPaths?.includes(file.path)).addClass("tag-curator-workbench__link");
        line.createSpan({ text: state.missingPaths?.includes(file.path) ? l.missingFile : file.sources.map(source => l[source]).join(" / ") });
      }
      this.pager(detail, this.filePage, files.total, 50, page => { this.filePage = page; this.render(); }, "files");
    } else detail.createEl("p", { text: this.detail ? l.tagUnavailable : l.chooseTag });
    const selection = panel.createDiv({ cls: "tag-curator-workbench__selection" }); selection.createSpan({ text: l.selected(this.selected.size) });
    this.button(selection, l.merge, undefined, () => this.manual([...this.selected], "merge"), "merge", this.blocked(state) || this.selected.size < 2 || [...this.selected].some(key => isManagementTagProtected(key, state.policy)));
    this.button(selection, l.clear, "x", () => { this.selected.clear(); this.render(); }, "clear", !this.selected.size);
  }
  private manual(sources: string[], kind: "rename" | "merge"): void {
    if (this.blocked(this.adapter.getState())) return;
    this.openModal(new TagManagementManualModal(this.app, this.adapter, this.labels, sources, kind));
  }
  private renderHistory(panel: HTMLElement, state: TagManagementState): void {
    const l = this.labels;
    const text = (kind: "origin" | "action" | "status" | "reason", value: string) => managementHistoryText(l, kind, value);
    const filters = panel.createDiv({ cls: "tag-curator-workbench__filters" });
    const search = filters.createEl("input", { attr: { type: "search", "aria-label": l.historySearch, placeholder: l.historySearch, "data-focus": "history-search" } });
    search.value = this.historySearch;
    search.addEventListener("input", () => { this.historySearch = search.value; this.clearHistoryDetail(); this.render(); });
    for (const [kind, title, value, options] of [["origin", l.historyOrigin, this.historyOrigin, l.historyOrigins], ["status", l.historyStatus, this.historyStatus, l.historyStatuses]] as const) {
      const label = filters.createEl("label", { text: title });
      const select = label.createEl("select", { attr: { "aria-label": title, "data-focus": `history-${kind}-filter` } });
      select.createEl("option", { text: l.all, attr: { value: "all" } });
      for (const [key, name] of Object.entries(options)) select.createEl("option", { text: name, attr: { value: key } });
      select.value = value;
      select.addEventListener("change", () => { if (kind === "origin") this.historyOrigin = select.value; else this.historyStatus = select.value; this.clearHistoryDetail(); this.render(); });
    }
    const filtered = !!this.historySearch || this.historyOrigin !== "all" || this.historyStatus !== "all";
    if (filtered) this.button(filters, l.clearFilters, "x", () => { this.historySearch = ""; this.historyOrigin = "all"; this.historyStatus = "all"; this.clearHistoryDetail(); this.render(); this.contentEl.querySelector<HTMLElement>('[data-focus="history-search"]')?.focus(); }, "history-clear-filters");
    // Keep eligibility and detail bound to full adapter state, never to filtered history.
    const query = this.historySearch.trim().toLowerCase();
    const knownValue = (options: Record<string, string>, value: string) => Object.prototype.hasOwnProperty.call(options, value) ? value : "unknown";
    const matching = state.history.filter(entry => (this.historyOrigin === "all" || knownValue(l.historyOrigins, entry.origin) === this.historyOrigin) && (this.historyStatus === "all" || knownValue(l.historyStatuses, entry.status) === this.historyStatus) &&
      (!query || [text("origin", entry.origin), text("action", entry.action), text("status", entry.status), ...entry.files.flatMap(file => [file.path, ...(file.beforeTags ?? []), ...(file.afterTags ?? []), ...(file.inlineChanges ?? []).flatMap(change => [change.before, change.after])])].some(value => value.toLowerCase().includes(query))));
    panel.createDiv({ cls: "tag-curator-workbench__result-count", text: l.historyCount(matching.length, state.history.length), attr: { role: "status" } });
    const layout = panel.createDiv({ cls: `tag-curator-workbench__split${this.historyDetail ? " tag-curator-workbench__split--detail" : ""}` });
    const list = layout.createDiv({ cls: "tag-curator-workbench__list" });
    // Adapter order is authoritative. Only unresolved records move ahead of that order.
    const entries = [...matching.filter(entry => entry.unresolved), ...matching.filter(entry => !entry.unresolved)];
    this.historyPage = Math.min(this.historyPage, Math.max(0, Math.ceil(entries.length / 50) - 1));
    if (!entries.length && !state.historyError) list.createEl("p", { text: filtered && state.history.length ? l.noHistoryResults : l.noHistory });
    for (const entry of entries.slice(this.historyPage * 50, (this.historyPage + 1) * 50)) {
      const line = list.createDiv({ cls: "tag-curator-workbench__history-row" });
      line.classList.toggle("tag-curator-workbench__row--active", entry.id === this.historyDetail);
      this.button(line, `${text("action", entry.action)} · ${text("origin", entry.origin)}`, undefined, () => { this.historyDetail = entry.id; this.historyFilePage = 0; this.render(); this.contentEl.querySelector<HTMLElement>('[data-focus="history-back"]')?.focus(); }, `history-${entry.id}`).addClass("tag-curator-workbench__link");
      line.createSpan({ text: `${entry.createdAt ?? l.unknown} · ${l.fileCount(new Set(entry.files.map(file => file.path)).size)} · ${text("status", entry.status)}` });
      const reason = entry.unavailableReason ?? entry.readOnlyReason;
      if (reason) line.createSpan({ cls: "tag-curator-workbench__muted", text: text("reason", reason) });
    }
    this.pager(list, this.historyPage, entries.length, 50, page => { this.historyPage = page; this.render(); }, "history");
    const detail = layout.createDiv({ cls: "tag-curator-workbench__detail" });
    const entry = state.history.find(entry => entry.id === this.historyDetail);
    if (this.historyDetail) this.button(detail, l.back, "arrow-left", () => { const id = this.historyDetail; this.historyDetail = undefined; this.render(); (Array.from(this.contentEl.querySelectorAll<HTMLElement>("[data-focus]")).find(el => el.dataset.focus === `history-${id}`) ?? this.contentEl.querySelector<HTMLElement>('[data-focus="history-search"]'))?.focus(); }, "history-back");
    if (!entry) { detail.createEl("p", { text: l.chooseHistory }); return; }
    detail.createEl("h3", { text: text("action", entry.action) }); detail.createEl("p", { text: `${text("origin", entry.origin)} · ${text("status", entry.status)}` });
    if (entry.model?.trim() || entry.origin === "recommendation" || entry.origin === "batch") detail.createEl("p", { text: `${l.recordedModel}: ${entry.model?.trim() || l.unknown}` });
    detail.createEl("p", { text: entry.legacy ? l.legacy : l.rawHistory });
    const reason = entry.unavailableReason ?? entry.readOnlyReason;
    if (reason) detail.createEl("p", { text: text("reason", reason) });
    this.historyFilePage = Math.min(this.historyFilePage, Math.max(0, Math.ceil(entry.files.length / 50) - 1));
    for (const file of entry.files.slice(this.historyFilePage * 50, (this.historyFilePage + 1) * 50)) {
      const line = detail.createDiv({ cls: "tag-curator-workbench__file-row" });
      this.button(line, file.path, undefined, () => void this.run(() => this.adapter.commands.openFile(file.path)), `history-file-${file.path}`, state.missingPaths?.includes(file.path)).addClass("tag-curator-workbench__link");
      if (file.beforeTags) line.createEl("p", { text: `${l.before}: ${file.beforeTags.join(", ")}` });
      if (file.afterTags) line.createEl("p", { text: `${l.after}: ${file.afterTags.join(", ")}` });
      for (const change of file.inlineChanges ?? []) line.createEl("p", { text: `${change.line ?? ""}: ${change.before} → ${change.after}` });
    }
    if (entry.files.length > 50) this.pager(detail, this.historyFilePage, entry.files.length, 50, page => { this.historyFilePage = page; this.render(); }, "history-files");
    const disabled = !!state.busy || this.pending || !!state.historyError;
    if (entry.canUndo) this.button(detail, l.undo, "undo-2", () => this.openModal(new TagManagementHistoryModal(this.app, this.adapter, l, entry.id, "undo")), "undo", disabled || !!state.recoveryRequired || state.history.some(entry => entry.unresolved));
    if (entry.canRecover) this.button(detail, l.recover, "rotate-ccw", () => this.openModal(new TagManagementHistoryModal(this.app, this.adapter, l, entry.id, "recover")), "recover", disabled);
  }
}
