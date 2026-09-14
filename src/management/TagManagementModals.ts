import { Modal, setIcon, type App } from "obsidian";
import { managementHistoryText, type ManagementLabels } from "../ui/managementLabels";
import {
  isManagementTagProtected, isManagementTagSupported, projectManagementTags,
  type ManagementPolicy, type ManagementScope, type TagManagementAdapter,
} from "./TagManagementView";

abstract class ManagementModal extends Modal {
  onDismiss?: () => void;
  protected live = false;
  protected pending = false;
  protected errorEl!: HTMLElement;
  protected buttons: HTMLButtonElement[] = [];
  private returnFocus: HTMLElement | null = null;
  private returnKey?: string;
  private unsubscribe?: () => void;
  constructor(app: App, protected adapter: TagManagementAdapter, protected l: ManagementLabels) {
    super(app);
    this.returnFocus = this.contentEl.ownerDocument.activeElement as HTMLElement | null;
    this.returnKey = this.returnFocus?.dataset.focus;
  }
  onOpen(): void {
    this.live = true;
    this.modalEl.addClass("tag-curator-workbench-modal");
    this.unsubscribe = this.adapter.subscribe(() => this.updateAvailability());
    this.render(); this.updateAvailability();
    this.contentEl.querySelector<HTMLElement>("input, button, select")?.focus();
  }
  protected abstract render(): void;
  protected updateAvailability(): void {
    for (const button of this.buttons) button.disabled = this.pending || !!this.adapter.getState().busy;
  }
  protected button(parent: HTMLElement, text: string, action: () => void, icon?: string, primary = false): HTMLButtonElement {
    const button = parent.createEl("button", { text: icon ? undefined : text, attr: { type: "button", "aria-label": text, title: text } });
    if (icon) { setIcon(button, icon); button.addClass("tag-curator-workbench__icon"); }
    if (primary) button.addClass("mod-cta"); button.addEventListener("click", action); return button;
  }
  protected error(message: string): void { this.errorEl.textContent = message; this.errorEl.focus(); }
  protected createError(): void { this.errorEl = this.contentEl.createDiv({ cls: "tag-curator-workbench__error", attr: { role: "alert", tabindex: "-1" } }); }
  protected async submit(action: () => Promise<void>): Promise<void> {
    if (this.pending || this.adapter.getState().busy) return;
    this.pending = true; this.updateAvailability(); this.errorEl.textContent = "";
    try { await action(); this.pending = false; if (this.live) this.close(); }
    catch (error) { if (this.live) this.error(error instanceof Error ? error.message : this.l.failure); }
    finally { this.pending = false; if (this.live) this.updateAvailability(); }
  }
  onClose(): void {
    this.live = false; this.unsubscribe?.(); this.unsubscribe = undefined;
    const doc = this.contentEl.ownerDocument;
    const nextModal = Array.from(doc.querySelectorAll<HTMLElement>(".modal-container")).reverse().find(el => el !== this.containerEl);
    if (nextModal) {
      if (!nextModal.contains(doc.activeElement)) nextModal.querySelector<HTMLElement>("input, button, select, [tabindex]")?.focus();
      this.onDismiss?.(); return;
    }
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
    else {
      const replacement = Array.from(this.contentEl.ownerDocument.querySelectorAll<HTMLElement>(".tag-curator-workbench [data-focus]")).find(el => el.dataset.focus === this.returnKey);
      (replacement ?? this.contentEl.ownerDocument.querySelector<HTMLElement>('.tag-curator-workbench [role="tab"][aria-selected="true"]'))?.focus();
    }
    this.onDismiss?.();
  }
}

function validFolder(path: string, folders?: string[]): boolean {
  return !path.startsWith("/") && !/^[A-Za-z]:/.test(path) && !/[\\\u0000-\u001f]/.test(path) &&
    (path === "" || path.split("/").every(part => part !== "" && part !== "." && part !== "..")) &&
    (!folders || path === "" || folders.includes(path));
}

function scopeEditor(parent: HTMLElement, scope: ManagementScope, l: ManagementLabels, changed: () => void): void {
  const section = parent.createDiv({ cls: "tag-curator-workbench__scope" });
  section.createEl("h3", { text: l.scope });
  const rows = section.createDiv();
  const renderRows = (): void => {
    rows.empty();
    scope.include.forEach((rule, index) => {
      const row = rows.createDiv({ cls: "tag-curator-workbench__rule" });
      const path = row.createEl("input", { attr: { type: "text", "aria-label": l.scope, placeholder: l.root } }); path.value = rule.path;
      path.addEventListener("input", () => { rule.path = path.value.trim(); changed(); });
      const label = row.createEl("label"); const recursive = label.createEl("input", { attr: { type: "checkbox" } }); recursive.checked = rule.recursive;
      recursive.addEventListener("change", () => { rule.recursive = recursive.checked; changed(); }); label.createSpan({ text: l.recursive });
      const remove = row.createEl("button", { attr: { type: "button", "aria-label": l.remove, title: l.remove } }); setIcon(remove, "trash-2");
      remove.addEventListener("click", () => { scope.include.splice(index, 1); changed(); renderRows(); section.querySelector<HTMLButtonElement>("button")?.focus(); });
    });
  };
  renderRows();
  const add = section.createEl("button", { attr: { type: "button", "aria-label": l.addFolder, title: l.addFolder } }); setIcon(add, "folder-plus");
  add.addEventListener("click", () => { scope.include.push({ path: "", recursive: true }); changed(); renderRows(); Array.from(rows.querySelectorAll<HTMLInputElement>('input[type="text"]')).at(-1)?.focus(); });
}

export class TagManagementPolicyModal extends ManagementModal {
  private invalidFoldersEl?: HTMLElement;
  protected updateAvailability(): void {
    super.updateAvailability();
    if (this.invalidFoldersEl) {
      const invalid = this.adapter.getState().invalidFolders ?? [];
      this.invalidFoldersEl.textContent = invalid.length ? `${this.l.invalidFolders}: ${invalid.map(path => path || this.l.root).join(", ")}` : "";
    }
  }
  protected render(): void {
    const initial = this.adapter.getState();
    const scope: ManagementScope = structuredClone(initial.scope);
    const policy: ManagementPolicy = structuredClone(initial.policy);
    this.contentEl.createEl("h2", { text: this.l.settings });
    this.invalidFoldersEl = this.contentEl.createDiv({ cls: "tag-curator-workbench__error", attr: { role: "status", "aria-live": "polite", "data-invalid-folders": "true" } });
    scopeEditor(this.contentEl, scope, this.l, () => undefined);
    const label = this.contentEl.createEl("label", { text: this.l.exclusions });
    const exclusions = label.createEl("textarea", { attr: { "aria-label": this.l.exclusions, rows: "4" } }); exclusions.value = policy.excludedFolders.filter(Boolean).join("\n");
    const rootLabel = this.contentEl.createEl("label", { cls: "tag-curator-workbench__consent" });
    const excludeRoot = rootLabel.createEl("input", { attr: { type: "checkbox", "aria-label": this.l.excludeRoot } }); excludeRoot.checked = policy.excludedFolders.includes("");
    rootLabel.createSpan({ text: this.l.excludeRoot });
    this.contentEl.createEl("h3", { text: this.l.protections });
    const protections = this.contentEl.createDiv();
    const renderRules = (): void => {
      protections.empty();
      policy.protectedTags.forEach((rule, index) => {
        const row = protections.createDiv({ cls: "tag-curator-workbench__rule" });
        const tag = row.createEl("input", { attr: { type: "text", "aria-label": this.l.tag } }); tag.value = rule.tag; tag.addEventListener("input", () => { rule.tag = tag.value.trim().replace(/^#/, ""); });
        const mode = row.createEl("select", { attr: { "aria-label": this.l.protections } });
        for (const value of ["exact", "subtree"] as const) mode.createEl("option", { text: this.l[value], attr: { value } });
        mode.value = rule.mode; mode.addEventListener("change", () => { rule.mode = mode.value as "exact" | "subtree"; });
        this.button(row, this.l.remove, () => {
          policy.protectedTags.splice(index, 1); renderRules();
          (protections.querySelectorAll<HTMLInputElement>("input")[Math.max(0, index - 1)] ?? addProtection).focus();
        }, "trash-2");
      });
    }; renderRules();
    const addProtection = this.button(this.contentEl, this.l.addProtection, () => { policy.protectedTags.push({ tag: "", mode: "exact" }); renderRules(); Array.from(protections.querySelectorAll<HTMLInputElement>("input")).at(-1)?.focus(); }, "shield-plus");
    this.contentEl.createEl("p", { cls: "tag-curator-workbench__muted", text: this.l.policyNotice });
    this.createError();
    const actions = this.contentEl.createDiv({ cls: "tag-curator-workbench__actions" });
    this.button(actions, this.l.cancel, () => this.close());
    this.buttons.push(this.button(actions, this.l.save, () => {
      const state = this.adapter.getState();
      if (state.policy.revision !== initial.policy.revision || JSON.stringify(state.scope) !== JSON.stringify(initial.scope)) { this.error(this.l.changed); return; }
      policy.excludedFolders = exclusions.value.split("\n").map(path => path.trim()).filter(Boolean);
      if (excludeRoot.checked) policy.excludedFolders.unshift("");
      if (!scope.include.length || [...scope.include.map(rule => rule.path), ...policy.excludedFolders].some(path => !validFolder(path, state.folders))) { this.error(this.l.invalidPath); return; }
      // Protection may cover tags outside the writer's supported subset, but never arbitrary globs.
      if (policy.protectedTags.some(rule => !rule.tag || /[\s*#]/u.test(rule.tag) || rule.tag.split("/").some(part => !part))) { this.error(this.l.invalidTag); return; }
      void this.submit(() => this.adapter.commands.saveScopeAndPolicy(structuredClone(scope), structuredClone(policy)));
    }, undefined, true));
  }
}

export class TagManagementManualModal extends ManagementModal {
  private controller?: AbortController;
  private confirm?: HTMLInputElement;
  constructor(app: App, adapter: TagManagementAdapter, l: ManagementLabels, private sources: string[], private kind: "rename" | "merge") { super(app, adapter, l); }
  protected updateAvailability(): void {
    super.updateAvailability(); const state = this.adapter.getState();
    for (const button of this.buttons) button.disabled ||= !this.confirm?.checked || state.freshness !== "ready" || !state.index || !!state.historyError || !!state.recoveryRequired || state.history.some(entry => entry.unresolved);
  }
  protected render(): void {
    const initial = this.adapter.getState(); const initialScope = JSON.stringify(initial.scope); const initialIndex = initial.index;
    const scope: ManagementScope = structuredClone(initial.scope);
    this.contentEl.createEl("h2", { text: this.kind === "rename" ? this.l.rename : this.l.merge });
    this.contentEl.createEl("p", { text: this.sources.join(", ") });
    this.contentEl.createEl("p", { text: this.l.exactNotice });
    const all = projectManagementTags({ ...initial, scope: { include: [{ path: "", recursive: true }] } });
    this.contentEl.createEl("p", { text: this.l.children(all.filter(row => this.sources.some(source => row.key.startsWith(`${source}/`))).length) });
    const label = this.contentEl.createEl("label", { text: this.l.target });
    const target = label.createEl("input", { attr: { type: "text", "aria-label": this.l.target } });
    const targetStatus = this.contentEl.createDiv({ attr: { role: "status" } });
    target.addEventListener("input", () => { targetStatus.textContent = all.some(row => row.key === target.value.trim().replace(/^#/, "").toLowerCase()) ? this.l.targetExists : ""; });
    scopeEditor(this.contentEl, scope, this.l, () => { if (this.confirm) this.confirm.checked = false; this.updateAvailability(); });
    this.contentEl.createEl("p", { text: `${this.l.exclusions}: ${initial.policy.excludedFolders.join(", ") || "∅"}` });
    const consent = this.contentEl.createEl("label", { cls: "tag-curator-workbench__consent" });
    this.confirm = consent.createEl("input", { attr: { type: "checkbox", "aria-label": this.l.scopeConsent } }); consent.createSpan({ text: this.l.scopeConsent });
    this.confirm.addEventListener("change", () => this.updateAvailability());
    this.createError();
    const actions = this.contentEl.createDiv({ cls: "tag-curator-workbench__actions" });
    this.button(actions, this.l.cancel, () => this.close());
    this.buttons.push(this.button(actions, this.l.preview, () => {
      const state = this.adapter.getState();
      if (!this.confirm?.checked || state.freshness !== "ready" || !state.index || state.historyError || state.recoveryRequired || state.history.some(entry => entry.unresolved)) return;
      if (state.index !== initialIndex || state.indexRevision !== initial.indexRevision || state.policy.revision !== initial.policy.revision || JSON.stringify(state.scope) !== initialScope) { this.error(this.l.changed); return; }
      if (!scope.include.length || scope.include.some(rule => !validFolder(rule.path, state.folders))) { this.error(this.l.invalidPath); return; }
      const text = target.value.trim().replace(/^#/, ""); const key = text.toLowerCase();
      if (!isManagementTagSupported(text) || this.sources.some(source => !isManagementTagSupported(source))) { this.error(this.l.invalidTag); return; }
      const sources = [...new Set(this.sources)].filter(source => source.toLowerCase() !== key);
      if (!sources.length) { this.error(this.kind === "rename" ? this.l.sameTag : this.l.noSources); return; }
      if ([text, ...sources].some(tag => isManagementTagProtected(tag, state.policy))) { this.error(this.l.protected); return; }
      const rows = projectManagementTags({ ...state, scope }).filter(row => sources.includes(row.key));
      const count = new Set(rows.flatMap(row => row.files.map(file => file.path))).size;
      if (count === 0 || count > 200) { this.error(count > 200 ? this.l.overLimit : this.l.noCandidates); return; }
      this.controller = new AbortController();
      const frozenScope = structuredClone(scope);
      const intent = this.kind === "rename" ? { kind: "rename" as const, source: sources[0], target: text, scope: frozenScope } : { kind: "merge" as const, sources, target: text, scope: frozenScope };
      void this.submit(() => this.adapter.commands.startManual(intent, this.controller!.signal));
    }, undefined, true));
  }
  onClose(): void { if (this.pending) this.controller?.abort(); super.onClose(); }
}

export class TagManagementHistoryModal extends ManagementModal {
  private policyRevision: number;
  constructor(app: App, adapter: TagManagementAdapter, l: ManagementLabels, private id: string, private action: "undo" | "recover") { super(app, adapter, l); this.policyRevision = adapter.getState().policy.revision; }
  protected updateAvailability(): void {
    super.updateAvailability(); const state = this.adapter.getState(); const entry = state.history.find(entry => entry.id === this.id);
    const changed = state.policy.revision !== this.policyRevision;
    if (changed && this.errorEl) this.errorEl.textContent = this.l.changed;
    for (const button of this.buttons) button.disabled ||= changed || !!state.historyError || !entry || (this.action === "undo" ? !entry.canUndo || !!state.recoveryRequired || state.history.some(entry => entry.unresolved) : !entry.canRecover);
  }
  protected render(): void {
    const entry = this.adapter.getState().history.find(entry => entry.id === this.id);
    this.contentEl.createEl("h2", { text: this.action === "undo" ? this.l.confirmUndo : this.l.confirmRecovery });
    this.contentEl.createEl("p", { text: this.l.recoveryNotice });
    if (entry) {
      this.contentEl.createEl("p", { text: `${managementHistoryText(this.l, "action", entry.action)} · ${managementHistoryText(this.l, "origin", entry.origin)} · ${managementHistoryText(this.l, "status", entry.status)}` });
      const reason = entry.unavailableReason ?? entry.readOnlyReason;
      if (reason) this.contentEl.createEl("p", { text: managementHistoryText(this.l, "reason", reason) });
      for (const file of entry.files) this.contentEl.createEl("p", { text: file.path });
      if (entry.model?.trim() || entry.origin === "recommendation" || entry.origin === "batch") this.contentEl.createEl("p", { text: `${this.l.recordedModel}: ${entry.model?.trim() || this.l.unknown}` });
      this.contentEl.createEl("p", { text: entry.legacy ? this.l.legacy : this.l.rawHistory });
      if (entry.policyExceptions?.length) { this.contentEl.createEl("h3", { text: this.l.exceptions }); for (const exception of entry.policyExceptions) this.contentEl.createEl("p", { text: exception }); }
    }
    this.createError();
    const actions = this.contentEl.createDiv({ cls: "tag-curator-workbench__actions" });
    this.button(actions, this.l.cancel, () => this.close());
    this.buttons.push(this.button(actions, this.action === "undo" ? this.l.confirmUndo : this.l.confirmRecovery, () => {
      this.updateAvailability(); if (this.buttons.some(button => button.disabled)) return;
      void this.submit(() => this.adapter.commands[this.action](this.id));
    }, undefined, true));
  }
}
