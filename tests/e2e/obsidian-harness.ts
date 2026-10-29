import { vi } from "vitest";
import { parse, stringify } from "yaml";

type CommandLike = {
  id: string;
  name: string;
  callback?: () => unknown;
};

type FrontmatterTags = string | string[] | null | undefined;

interface FakeNoteSpec {
  path: string;
  content: string;
  frontmatterTags?: string[];
  frontmatter?: Record<string, unknown>;
  inlineTagCache?: "missing" | FakeCache["tags"];
}

interface FakeAppOptions {
  activeFilePath?: string | null;
  pluginData?: unknown;
}

interface FakeCache {
  frontmatter?: Record<string, unknown>;
  tags?: Array<{
    tag: string;
    position: {
      start: { line: number; col: number; offset: number };
      end: { line: number; col: number; offset: number };
    };
  }>;
}

interface QueuedAiResponse {
  content?: string;
  error?: Error;
  gate?: Deferred<void>;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export const notices: string[] = [];
export const openModals: Modal[] = [];
export const requestUrlMock = vi.fn(async (request: unknown) => {
  aiRequests.push(request);
  const next = aiResponses.shift();
  if (!next) {
    throw new Error("No queued AI response.");
  }

  if (next.gate) {
    await next.gate.promise;
  }

  if (next.error) {
    throw next.error;
  }

  return {
    json: {
      choices: [
        {
          message: {
            content: next.content
          }
        }
      ]
    }
  };
});

const aiResponses: QueuedAiResponse[] = [];
const aiRequests: unknown[] = [];
let mockLanguage = "en";
const domHelperPrototypes = new WeakSet<object>();

export function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

export function installDomHelpers(doc: Document = document): void {
  const prototype = (doc.defaultView?.HTMLElement ?? HTMLElement).prototype as unknown as Record<string, unknown>;
  if (domHelperPrototypes.has(prototype)) {
    return;
  }

  prototype.empty = function empty(this: HTMLElement): void {
    this.replaceChildren();
  };

  prototype.addClass = function addClass(this: HTMLElement, ...classes: string[]): void {
    this.classList.add(...classes);
  };

  prototype.setAttr = function setAttr(this: HTMLElement, name: string, value: string): void {
    this.setAttribute(name, value);
  };

  prototype.onClickEvent = function onClickEvent(this: HTMLElement, callback: (event: MouseEvent) => unknown): void {
    this.addEventListener("click", (event) => {
      void callback(event as MouseEvent);
    });
  };

  prototype.createEl = function createEl(this: HTMLElement, tagName: string, options?: DomCreateOptions): HTMLElement {
    installDomHelpers(this.ownerDocument);
    const element = this.ownerDocument.createElement(tagName);
    applyDomOptions(element, options);
    this.appendChild(element);
    return element;
  };

  prototype.createDiv = function createDiv(this: HTMLElement, options?: DomCreateOptions): HTMLDivElement {
    return this.createEl("div", options) as HTMLDivElement;
  };

  prototype.createSpan = function createSpan(this: HTMLElement, options?: DomCreateOptions): HTMLSpanElement {
    return this.createEl("span", options) as HTMLSpanElement;
  };

  domHelperPrototypes.add(prototype);
}

export function resetObsidianMockState(): void {
  notices.length = 0;
  openModals.length = 0;
  aiResponses.length = 0;
  aiRequests.length = 0;
  requestUrlMock.mockClear();
  mockLanguage = "en";
  document.body.replaceChildren();
}

export function setMockLanguage(language: string): void {
  mockLanguage = language;
}

export function queueAiResponse(content: string, gate?: Deferred<void>): void {
  aiResponses.push({ content, gate });
}

export function queueAiError(error: Error, gate?: Deferred<void>): void {
  aiResponses.push({ error, gate });
}

export function createFakeApp(notes: FakeNoteSpec[], options: FakeAppOptions = {}): FakeObsidianApp {
  return new FakeObsidianApp(notes, options);
}

export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  stat = {
    ctime: 0,
    mtime: 0,
    size: 0
  };
  parent: TFolder | null = null;

  constructor(path: string) {
    this.path = path;
    this.name = path.split("/").pop() ?? path;
    const parts = this.name.split(".");
    this.extension = parts.length > 1 ? parts.pop() ?? "" : "";
    this.basename = parts.join(".");
  }
}

export class TFolder {
  path: string;
  name: string;
  parent: TFolder | null;
  children: Array<TFile | TFolder> = [];

  constructor(path: string, parent: TFolder | null = null) {
    this.path = path;
    this.name = path.split("/").filter(Boolean).pop() ?? "/";
    this.parent = parent;
  }
}

export class Plugin {
  app: FakeObsidianApp;
  manifest: unknown;
  commands: Record<string, CommandLike> = {};
  settingTabs: PluginSettingTab[] = [];
  ribbonIcons: HTMLElement[] = [];
  private cleanups: Array<() => void> = [];

  constructor(app: FakeObsidianApp, manifest: unknown) {
    this.app = app;
    this.manifest = manifest;
  }

  addCommand(command: CommandLike): CommandLike {
    this.commands[command.id] = command;
    return command;
  }

  addSettingTab(settingTab: PluginSettingTab): void {
    this.settingTabs.push(settingTab);
  }

  register(cleanup: () => void): void { this.cleanups.push(cleanup); }

  registerEvent(ref: FakeEventRef): void { this.register(() => ref.emitter.offref(ref)); }

  registerView(type: string, factory: (leaf: WorkspaceLeaf) => ItemView): void {
    this.app.workspace.viewFactories.set(type, factory);
    this.register(() => {
      this.app.workspace.detachLeavesOfType(type);
      this.app.workspace.viewFactories.delete(type);
    });
  }

  addRibbonIcon(icon: string, title: string, callback: (event: MouseEvent) => unknown): HTMLElement {
    const button = document.createElement("button");
    button.title = title;
    button.setAttribute("aria-label", title);
    setIcon(button, icon);
    button.addEventListener("click", (event) => { void callback(event); });
    this.ribbonIcons.push(button);
    document.body.appendChild(button);
    this.register(() => button.remove());
    return button;
  }

  unload(): void {
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
  }

  async loadData(): Promise<unknown> {
    return structuredClone(this.app.pluginData);
  }

  async saveData(data: unknown): Promise<void> {
    this.app.pluginData = structuredClone(data);
    this.app.savedData = structuredClone(data);
    this.app.saves.push(structuredClone(data));
  }
}

export class ItemView {
  app: FakeObsidianApp;
  containerEl: HTMLElement;
  contentEl: HTMLElement;

  constructor(readonly leaf: WorkspaceLeaf) {
    this.app = leaf.app;
    const doc = leaf.document ?? document;
    this.containerEl = doc.createElement("div");
    this.contentEl = doc.createElement("div");
    this.containerEl.appendChild(this.contentEl);
    doc.body.appendChild(this.containerEl);
  }

  getViewType(): string { return "test-view"; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

interface FakeEventRef {
  emitter: FakeEvents;
  event: string;
  callback: (...args: any[]) => void;
}

export class FakeEvents {
  private listeners = new Map<string, Set<FakeEventRef>>();

  on(event: string, callback: (...args: any[]) => void): FakeEventRef {
    const ref = { emitter: this, event, callback };
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(ref);
    return ref;
  }

  offref(ref: FakeEventRef): void { this.listeners.get(ref.event)?.delete(ref); }
  trigger(event: string, ...args: unknown[]): void {
    for (const ref of [...(this.listeners.get(event) ?? [])]) ref.callback(...args);
  }
  listenerCount(event?: string): number {
    return event ? this.listeners.get(event)?.size ?? 0 : [...this.listeners.values()].reduce((count, entries) => count + entries.size, 0);
  }
}

export class PluginSettingTab {
  app: FakeObsidianApp;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: FakeObsidianApp, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }

  display(): void {
    this.containerEl.replaceChildren();
  }
}

export class Modal {
  app: FakeObsidianApp;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  scope = {
    register: () => ({})
  };

  constructor(app: FakeObsidianApp) {
    this.app = app;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "modal-container";
    this.modalEl = this.containerEl.createDiv({ cls: "modal" });
    this.titleEl = this.modalEl.createDiv({ cls: "modal-title" });
    this.contentEl = this.modalEl.createDiv({ cls: "modal-content" });
  }

  open(): void {
    openModals.push(this);
    document.body.appendChild(this.containerEl);
    void this.onOpen();
  }

  close(): void {
    this.onClose();
    this.containerEl.remove();
    const index = openModals.indexOf(this);
    if (index >= 0) {
      openModals.splice(index, 1);
    }
  }

  onOpen(): Promise<void> | void {}

  onClose(): void {}

  setTitle(title: string): this {
    this.titleEl.textContent = title;
    return this;
  }

  setContent(content: string | DocumentFragment): this {
    this.contentEl.replaceChildren();
    if (typeof content === "string") {
      this.contentEl.textContent = content;
    } else {
      this.contentEl.appendChild(content);
    }
    return this;
  }

  setCloseCallback(_callback: () => unknown): this {
    return this;
  }
}

export abstract class FuzzySuggestModal<T> extends Modal {
  abstract getItems(): T[];
  abstract getItemText(item: T): string;
  abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;

  onOpen(): void {
    this.contentEl.empty();
    const input = this.contentEl.createEl("input") as HTMLInputElement;
    input.type = "search";
    const list = this.contentEl.createDiv({ cls: "suggestion-container" });
    const render = (): void => {
      list.empty();
      const query = input.value.toLowerCase();
      for (const item of this.getItems().filter((candidate) => this.getItemText(candidate).toLowerCase().includes(query))) {
        const button = list.createEl("button") as HTMLButtonElement;
        button.type = "button";
        button.textContent = this.getItemText(item);
        button.addEventListener("click", (event) => {
          this.onChooseItem(item, event);
          this.close();
        });
      }
    };
    input.addEventListener("input", render);
    render();
  }
}

export class Notice {
  constructor(message: string) {
    notices.push(message);
  }
}

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  components: unknown[] = [];

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createDiv({ cls: "setting-item" });
    this.infoEl = this.settingEl.createDiv({ cls: "setting-item-info" });
    this.nameEl = this.infoEl.createDiv({ cls: "setting-item-name" });
    this.descEl = this.infoEl.createDiv({ cls: "setting-item-description" });
    this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
  }

  setName(name: string | DocumentFragment): this {
    setTextOrFragment(this.nameEl, name);
    return this;
  }

  setDesc(desc: string | DocumentFragment): this {
    setTextOrFragment(this.descEl, desc);
    return this;
  }

  setClass(cls: string): this {
    this.settingEl.addClass(cls);
    return this;
  }

  setTooltip(_tooltip: string): this {
    return this;
  }

  setHeading(): this {
    this.settingEl.addClass("setting-item-heading");
    return this;
  }

  setDisabled(disabled: boolean): this {
  for (const input of Array.from(
    this.controlEl.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input, button, select")
  )) {
      input.disabled = disabled;
    }
    return this;
  }

  addButton(callback: (component: ButtonComponent) => unknown): this {
    const component = new ButtonComponent(this.controlEl);
    this.components.push(component);
    callback(component);
    return this;
  }

  addToggle(callback: (component: ToggleComponent) => unknown): this {
    const component = new ToggleComponent(this.controlEl);
    this.components.push(component);
    callback(component);
    return this;
  }

  addText(callback: (component: TextComponent) => unknown): this {
    const component = new TextComponent(this.controlEl);
    this.components.push(component);
    callback(component);
    return this;
  }

  addDropdown(callback: (component: DropdownComponent) => unknown): this {
    const component = new DropdownComponent(this.controlEl);
    this.components.push(component);
    callback(component);
    return this;
  }

  addSlider(callback: (component: SliderComponent) => unknown): this {
    const component = new SliderComponent(this.controlEl);
    this.components.push(component);
    callback(component);
    return this;
  }

  then(callback: (setting: this) => unknown): this {
    callback(this);
    return this;
  }

  clear(): this {
    this.settingEl.replaceChildren();
    return this;
  }
}

export class ButtonComponent {
  buttonEl: HTMLButtonElement;

  constructor(containerEl: HTMLElement) {
    this.buttonEl = containerEl.createEl("button") as HTMLButtonElement;
    this.buttonEl.type = "button";
  }

  setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled;
    return this;
  }

  setCta(): this {
    this.buttonEl.addClass("mod-cta");
    return this;
  }

  removeCta(): this {
    this.buttonEl.classList.remove("mod-cta");
    return this;
  }

  setWarning(): this {
    this.buttonEl.addClass("mod-warning");
    return this;
  }

  setTooltip(tooltip: string): this {
    this.buttonEl.title = tooltip;
    return this;
  }

  setButtonText(name: string): this {
    this.buttonEl.textContent = name;
    return this;
  }

  setIcon(icon: string): this {
    this.buttonEl.dataset.icon = icon;
    return this;
  }

  setClass(cls: string): this {
    this.buttonEl.addClass(cls);
    return this;
  }

  onClick(callback: (event: MouseEvent) => unknown | Promise<unknown>): this {
    this.buttonEl.addEventListener("click", (event) => {
      void callback(event as MouseEvent);
    });
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement;
  private readonly callbacks: Array<(value: string) => unknown> = [];

  constructor(containerEl: HTMLElement) {
    this.inputEl = containerEl.createEl("input") as HTMLInputElement;
    this.inputEl.type = "text";
    this.inputEl.addEventListener("input", () => {
      this.onChanged();
    });
    this.inputEl.addEventListener("change", () => {
      this.onChanged();
    });
  }

  setDisabled(disabled: boolean): this {
    this.inputEl.disabled = disabled;
    return this;
  }

  getValue(): string {
    return this.inputEl.value;
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }

  onChanged(): void {
    for (const callback of this.callbacks) {
      void callback(this.inputEl.value);
    }
  }

  onChange(callback: (value: string) => unknown): this {
    this.callbacks.push(callback);
    return this;
  }
}

export class DropdownComponent {
  selectEl: HTMLSelectElement;
  private readonly callbacks: Array<(value: string) => unknown> = [];

  constructor(containerEl: HTMLElement) {
    this.selectEl = containerEl.createEl("select") as HTMLSelectElement;
    this.selectEl.addEventListener("change", () => {
      for (const callback of this.callbacks) {
        void callback(this.selectEl.value);
      }
    });
  }

  setDisabled(disabled: boolean): this {
    this.selectEl.disabled = disabled;
    return this;
  }

  addOption(value: string, display: string): this {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = display;
    this.selectEl.appendChild(option);
    return this;
  }

  addOptions(options: Record<string, string>): this {
    for (const [value, display] of Object.entries(options)) {
      this.addOption(value, display);
    }
    return this;
  }

  getValue(): string {
    return this.selectEl.value;
  }

  setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }

  onChange(callback: (value: string) => unknown): this {
    this.callbacks.push(callback);
    return this;
  }
}

export class SliderComponent {
  sliderEl: HTMLInputElement;
  private readonly callbacks: Array<(value: number) => unknown> = [];

  constructor(containerEl: HTMLElement) {
    this.sliderEl = containerEl.createEl("input") as HTMLInputElement;
    this.sliderEl.type = "range";
    this.sliderEl.addEventListener("input", () => {
      this.emit();
    });
    this.sliderEl.addEventListener("change", () => {
      this.emit();
    });
  }

  setDisabled(disabled: boolean): this {
    this.sliderEl.disabled = disabled;
    return this;
  }

  setInstant(_instant: boolean): this {
    return this;
  }

  setLimits(min: number | null, max: number | null, step: number | "any"): this {
    if (min !== null) {
      this.sliderEl.min = String(min);
    }
    if (max !== null) {
      this.sliderEl.max = String(max);
    }
    this.sliderEl.step = String(step);
    return this;
  }

  getValue(): number {
    return Number(this.sliderEl.value);
  }

  setValue(value: number): this {
    this.sliderEl.value = String(value);
    return this;
  }

  getValuePretty(): string {
    return this.sliderEl.value;
  }

  setDynamicTooltip(): this {
    return this;
  }

  showTooltip(): void {}

  onChange(callback: (value: number) => unknown): this {
    this.callbacks.push(callback);
    return this;
  }

  private emit(): void {
    for (const callback of this.callbacks) {
      void callback(Number(this.sliderEl.value));
    }
  }
}

export class ToggleComponent {
  toggleEl: HTMLInputElement;
  private readonly callbacks: Array<(value: boolean) => unknown> = [];

  constructor(containerEl: HTMLElement) {
    this.toggleEl = containerEl.createEl("input") as HTMLInputElement;
    this.toggleEl.type = "checkbox";
    this.toggleEl.addEventListener("change", () => {
      this.emit();
    });
  }

  setDisabled(disabled: boolean): this {
    this.toggleEl.disabled = disabled;
    return this;
  }

  getValue(): boolean {
    return this.toggleEl.checked;
  }

  setValue(on: boolean): this {
    this.toggleEl.checked = on;
    return this;
  }

  setTooltip(tooltip: string): this {
    this.toggleEl.title = tooltip;
    return this;
  }

  onClick(): void {
    this.toggleEl.click();
  }

  onChange(callback: (value: boolean) => unknown): this {
    this.callbacks.push(callback);
    return this;
  }

  private emit(): void {
    for (const callback of this.callbacks) {
      void callback(this.toggleEl.checked);
    }
  }
}

export class FakeObsidianApp {
  vault: FakeVault;
  metadataCache: FakeMetadataCache;
  fileManager: FakeFileManager;
  workspace: FakeWorkspace;
  pluginData: unknown;
  savedData: unknown;
  saves: unknown[] = [];

  constructor(notes: FakeNoteSpec[], options: FakeAppOptions) {
    this.vault = new FakeVault(notes);
    this.metadataCache = new FakeMetadataCache(this.vault);
    this.fileManager = new FakeFileManager(this.vault);
    this.workspace = new FakeWorkspace(this, options.activeFilePath ?? null);
    this.pluginData = options.pluginData ?? null;
    this.savedData = null;
  }

  getNoteTags(path: string): string[] {
    return this.vault.getNote(path).frontmatterTags;
  }
}

export class FakeVault extends FakeEvents {
  private readonly notes = new Map<string, FakeVaultNote>();
  private readonly folders = new Map<string, TFolder>();
  private readGate: Deferred<void> | null = null;
  private readCount = 0;
  private processCount = 0;
  private processInterceptor: ((file: TFile, content: string, processCount: number) => void) | null = null;

  constructor(notes: FakeNoteSpec[]) {
    super();
    this.folders.set("", new TFolder(""));
    for (const spec of notes) {
      const note = new FakeVaultNote(spec, (file) => this.trigger("modify", file));
      const parent = this.ensureFolder(parentPath(spec.path));
      note.file.parent = parent;
      parent.children.push(note.file);
      this.notes.set(spec.path, note);
    }
  }

  getRoot(): TFolder {
    return this.folders.get("")!;
  }

  getAllLoadedFiles(): Array<TFile | TFolder> {
    return [
      this.getRoot(),
      ...Array.from(this.folders.values()).filter((folder) => folder.path !== ""),
      ...Array.from(this.notes.values()).map((note) => note.file)
    ];
  }

  setReadGate(gate: Deferred<void> | null): void {
    this.readGate = gate;
  }

  getReadCount(): number {
    return this.readCount;
  }

  getProcessCount(): number {
    return this.processCount;
  }

  setProcessInterceptor(interceptor: ((file: TFile, content: string, processCount: number) => void) | null): void {
    this.processInterceptor = interceptor;
  }

  getMarkdownFiles(): TFile[] {
    return Array.from(this.notes.values())
      .map((note) => note.file)
      .filter((file) => file.extension === "md");
  }

  async cachedRead(file: TFile | TFolder): Promise<string> {
    this.readCount += 1;
    if (this.readGate) {
      await this.readGate.promise;
    }

    return this.getNote(file.path).content;
  }

  async read(file: TFile | TFolder): Promise<string> {
    return this.cachedRead(file);
  }

  async process(file: TFile, callback: (data: string) => string): Promise<string> {
    const note = this.getNote(file.path);
    this.processCount += 1;
    this.processInterceptor?.(file, note.content, this.processCount);
    const nextContent = callback(note.content);
    note.content = nextContent;
    return nextContent;
  }

  async modify(file: TFile, content: string): Promise<void> { this.getNote(file.path).content = content; }

  async create(path: string, content: string): Promise<TFile> {
    if (this.getAbstractFileByPath(path)) throw new Error(`File already exists: ${path}`);
    const note = new FakeVaultNote({ path, content }, (file) => this.trigger("modify", file));
    const parent = this.ensureFolder(parentPath(path));
    note.file.parent = parent;
    parent.children.push(note.file);
    this.notes.set(path, note);
    this.trigger("create", note.file);
    return note.file;
  }

  async delete(file: TFile | TFolder): Promise<void> {
    if (file instanceof TFolder) {
      for (const child of [...file.children]) await this.delete(child);
      this.folders.delete(file.path);
    } else this.notes.delete(file.path);
    if (file.parent) file.parent.children = file.parent.children.filter((entry) => entry !== file);
    this.trigger("delete", file);
  }

  async rename(file: TFile | TFolder, path: string): Promise<void> {
    const previousPath = file.path;
    if (file instanceof TFolder) {
      for (const child of [...file.children]) await this.rename(child, `${path}/${child.name}`);
      this.folders.delete(previousPath);
      this.folders.set(path, file);
    } else {
      const note = this.getNote(previousPath);
      this.notes.delete(previousPath);
      this.notes.set(path, note);
      const identity = new TFile(path);
      file.basename = identity.basename;
      file.extension = identity.extension;
    }
    if (file.parent) file.parent.children = file.parent.children.filter((entry) => entry !== file);
    file.path = path;
    file.name = path.split("/").pop()!;
    file.parent = this.ensureFolder(parentPath(path));
    file.parent.children.push(file);
    this.trigger("rename", file, previousPath);
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    const normalized = path.replace(/^\/+|\/+$/g, "");
    return this.notes.get(normalized)?.file ?? this.folders.get(normalized) ?? null;
  }

  getNote(path: string): FakeVaultNote {
    const note = this.notes.get(path);
    if (!note) {
      throw new Error(`Missing fake note: ${path}`);
    }
    return note;
  }

  private ensureFolder(path: string): TFolder {
    const existing = this.folders.get(path);
    if (existing) {
      return existing;
    }
    const parent = this.ensureFolder(parentPath(path));
    const folder = new TFolder(path, parent);
    parent.children.push(folder);
    this.folders.set(path, folder);
    return folder;
  }
}

export class FakeVaultNote {
  file: TFile;
  private markdown: string;
  inlineTagCache: FakeNoteSpec["inlineTagCache"];

  constructor(spec: FakeNoteSpec, private readonly changed: (file: TFile) => void = () => {}) {
    this.file = new TFile(spec.path);
    const info = getFrontMatterInfo(spec.content);
    this.markdown = info.exists || (spec.frontmatterTags === undefined && spec.frontmatter === undefined) ? spec.content :
      withFrontmatter(spec.content, { ...spec.frontmatter, ...(spec.frontmatterTags === undefined ? {} : { tags: spec.frontmatterTags }) });
    this.inlineTagCache = spec.inlineTagCache;
  }

  get content(): string { return this.markdown; }
  set content(value: string) {
    this.markdown = value;
    this.file.stat.size = new TextEncoder().encode(value).byteLength;
    this.file.stat.mtime++;
    this.changed(this.file);
  }
  get frontmatterTags(): string[] {
    const value = this.readFrontmatter().tags;
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") :
      typeof value === "string" ? normalizeFrontmatterTags(value) : [];
  }
  set frontmatterTags(value: string[]) { this.content = withFrontmatter(this.content, { ...this.readFrontmatter(), tags: value }); }
  get frontmatter(): Record<string, unknown> {
    const { tags: _tags, ...other } = this.readFrontmatter();
    return other;
  }
  set frontmatter(value: Record<string, unknown>) {
    const current = this.readFrontmatter();
    this.content = withFrontmatter(this.content, { ...value, ...("tags" in current ? { tags: current.tags } : {}) });
  }
  readFrontmatter(): Record<string, unknown> {
    const info = getFrontMatterInfo(this.content);
    if (!info.exists) return {};
    const value = parseYaml(info.frontmatter);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }
}

class FakeMetadataCache extends FakeEvents {
  constructor(private readonly vault: FakeVault) {
    super();
    for (const event of ["create", "modify", "rename"]) vault.on(event, (file: TFile | TFolder) => {
      if (file instanceof TFile) this.trigger("changed", file, vault.getNote(file.path).content, this.getFileCache(file));
    });
    vault.on("delete", (file) => this.trigger("deleted", file));
  }

  getFileCache(file: TFile): FakeCache {
    const note = this.vault.getNote(file.path);
    const cache: FakeCache = {};
    try { if (getFrontMatterInfo(note.content).exists) cache.frontmatter = note.readFrontmatter(); } catch { /* Invalid YAML has no trusted property cache. */ }
    if (note.inlineTagCache !== "missing") {
      cache.tags = note.inlineTagCache ?? extractInlineTagCaches(note.content);
    }
    return cache;
  }
}

class FakeFileManager {
  private writeCount = 0;
  private interceptor: ((file: TFile, currentTags: string[], writeCount: number) => void) | null = null;

  constructor(private readonly vault: FakeVault) {}

  setWriteInterceptor(interceptor: ((file: TFile, currentTags: string[], writeCount: number) => void) | null): void {
    this.interceptor = interceptor;
  }

  getWriteCount(): number {
    return this.writeCount;
  }

  async processFrontMatter(
    file: TFile,
    callback: (frontmatter: Record<string, unknown> & { tags?: FrontmatterTags }) => void
  ): Promise<void> {
    const note = this.vault.getNote(file.path);
    this.writeCount += 1;
    this.interceptor?.(file, [...note.frontmatterTags], this.writeCount);
    const frontmatter = note.readFrontmatter();
    callback(frontmatter);
    note.content = withFrontmatter(note.content, frontmatter);
  }
}

class FakeWorkspace extends FakeEvents {
  private activeFile: TFile | null;
  private readonly searchLeaf = new FakeSearchLeaf();
  searchQueries: string[] = [];
  readonly viewFactories = new Map<string, (leaf: WorkspaceLeaf) => ItemView>();
  readonly leaves: WorkspaceLeaf[] = [];

  constructor(readonly app: FakeObsidianApp, activeFilePath: string | null) {
    super();
    const file = activeFilePath ? app.vault.getAbstractFileByPath(activeFilePath) : null;
    this.activeFile = file instanceof TFile ? file : null;
  }

  getActiveFile(): TFile | null {
    return this.activeFile;
  }

  setActiveFile(file: TFile | TFolder | null): void {
    this.activeFile = file instanceof TFile ? file : null;
  }

  getLeavesOfType(type: "search"): FakeSearchLeaf[];
  getLeavesOfType(type: string): WorkspaceLeaf[];
  getLeavesOfType(type: string): Array<FakeSearchLeaf | WorkspaceLeaf> {
    return type === "search" ? [this.searchLeaf] : this.leaves.filter((leaf) => leaf.type === type);
  }

  getLeaf(_newLeaf?: boolean | string): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf(this.app);
    this.leaves.push(leaf);
    return leaf;
  }

  detachLeavesOfType(type: string): void { for (const leaf of [...this.leaves]) if (leaf.type === type) leaf.detach(); }

  getLeftLeaf(_split: boolean): FakeSearchLeaf {
    return this.searchLeaf;
  }

  async openLinkText(linktext: string, _sourcePath: string, _newLeaf?: boolean): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(linktext);
    if (!(file instanceof TFile)) {
      throw new Error(`Missing fake note: ${linktext}`);
    }

    this.activeFile = file;
  }

  async revealLeaf(_leaf: FakeSearchLeaf | WorkspaceLeaf): Promise<void> {}
}

export class WorkspaceLeaf {
  type = "empty";
  view?: ItemView;
  document?: Document;
  constructor(readonly app: FakeObsidianApp) {}

  async setViewState(state: { type: string; active?: boolean }): Promise<void> {
    if (this.type === state.type && this.view) return;
    const factory = this.app.workspace.viewFactories.get(state.type);
    if (!factory) throw new Error(`Unregistered view: ${state.type}`);
    if (this.view) {
      await this.view.onClose();
      this.view.containerEl.remove();
    }
    this.type = state.type;
    this.view = factory(this);
    await this.view.onOpen();
  }

  async openFile(file: TFile): Promise<void> { this.app.workspace.setActiveFile(file); }

  detach(): void {
    void this.view?.onClose();
    this.view?.containerEl.remove();
    const index = this.app.workspace.leaves.indexOf(this);
    if (index >= 0) this.app.workspace.leaves.splice(index, 1);
  }
}

class FakeSearchLeaf {
  view = {
    setQuery: (query: string): void => {
      this.queries.push(query);
    }
  };
  queries: string[] = [];

  async setViewState(state: { state?: { query?: string } }): Promise<void> {
    if (state.state?.query) {
      this.queries.push(state.state.query);
    }
  }
}

type DomCreateOptions =
  | string
  | {
      cls?: string | string[];
      text?: string;
      attr?: Record<string, string>;
    };

function applyDomOptions(element: HTMLElement, options?: DomCreateOptions): void {
  if (!options) {
    return;
  }

  if (typeof options === "string") {
    element.textContent = options;
    return;
  }

  if (options.cls) {
    const classes = Array.isArray(options.cls) ? options.cls : options.cls.split(/\s+/);
    element.classList.add(...classes.filter(Boolean));
  }

  if (options.text !== undefined) {
    element.textContent = options.text;
  }

  if (options.attr) {
    for (const [key, value] of Object.entries(options.attr)) {
      element.setAttribute(key, value);
    }
  }
}

function setTextOrFragment(element: HTMLElement, value: string | DocumentFragment): void {
  element.replaceChildren();
  if (typeof value === "string") {
    element.textContent = value;
    return;
  }

  element.appendChild(value);
}

function normalizeFrontmatterTags(value: unknown): string[] {
  if (!value) {
    return [];
  }

  const rawValues = Array.isArray(value) ? value : [value];
  return normalizeTagList(rawValues.filter((entry): entry is string => typeof entry === "string").flatMap((rawValue) => rawValue.split(/[\s,]+/)));
}

function normalizeTagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawTag of tags) {
    const tag = rawTag.trim().replace(/^#+/, "");
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(tag);
  }

  return result;
}

function extractInlineTags(content: string): string[] {
  const tags: string[] = [];
  const pattern = /(^|[\s([>{])#([\p{L}\p{N}_\-/]+)(?=$|[\s.,;:!?()[\]{}<>])/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    tags.push(match[2]);
  }
  return normalizeTagList(tags);
}

function extractInlineTagCaches(content: string): FakeCache["tags"] {
  const tags: FakeCache["tags"] = [];
  const pattern = /(^|[\s([>{])#([\p{L}\p{N}_\-/]+)(?=$|[\s.,;:!?()[\]{}<>])/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const startOffset = match.index + match[1].length;
    const endOffset = startOffset + match[2].length + 1;
    const start = offsetLocation(content, startOffset);
    const end = offsetLocation(content, endOffset);
    tags.push({
      tag: content.slice(startOffset, endOffset),
      position: {
        start: { line: start.line, col: start.col, offset: startOffset },
        end: { line: end.line, col: end.col, offset: endOffset }
      }
    });
  }
  return tags;
}

function offsetLocation(content: string, offset: number): { line: number; col: number } {
  const lines = content.slice(0, offset).split("\n");
  return { line: lines.length - 1, col: lines[lines.length - 1].replace(/\r$/, "").length };
}

export function getFrontMatterInfo(content: string): {
  exists: boolean;
  frontmatter: string;
  from: number;
  to: number;
  contentStart: number;
} {
  const opening = content.match(/^\uFEFF?---[\t ]*(?:\r?\n|$)/);
  if (!opening) {
    return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
  }
  const from = opening[0].length;
  const closingPattern = /^---[\t ]*\r?$/gm;
  closingPattern.lastIndex = from;
  const closing = closingPattern.exec(content);
  if (!closing) {
    return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
  }
  const to = closing.index;
  const newlineLength = content.slice(closing.index + closing[0].length).match(/^(?:\r?\n)/)?.[0].length ?? 0;
  const contentStart = closing.index + closing[0].length + newlineLength;
  return { exists: true, frontmatter: content.slice(from, to), from, to, contentStart };
}

export function getAllTags(cache: FakeCache): string[] {
  return [
    ...normalizeFrontmatterTags(cache.frontmatter?.tags as FrontmatterTags).map((tag) => `#${tag}`),
    ...(cache.tags ?? []).map((entry) => entry.tag)
  ];
}

function parentPath(path: string): string {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  const separator = normalized.lastIndexOf("/");
  return separator === -1 ? "" : normalized.slice(0, separator);
}

export function getLanguage(): string {
  return mockLanguage;
}

export function requireApiVersion(): boolean {
  return false;
}

export async function requestUrl(request: unknown): Promise<unknown> {
  return requestUrlMock(request);
}

// Uses a real YAML codec, not a tags-only parser. Exact Obsidian codec parity remains a host gate.
export function parseYaml(text: string): unknown { return parse(text); }
export function stringifyYaml(value: unknown): string { return stringify(value); }
export function setIcon(element: HTMLElement, icon: string): void { element.dataset.icon = icon; }
export function normalizePath(path: string): string { return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, ""); }
export function markdownBody(content: string): string { return content.slice(getFrontMatterInfo(content).contentStart); }
export function withFrontmatter(content: string, frontmatter: Record<string, unknown>): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const yaml = stringifyYaml(frontmatter).replace(/\r?\n/g, newline);
  return `---${newline}${yaml}---${newline}${markdownBody(content)}`;
}

export const obsidianMock = {
  ButtonComponent,
  DropdownComponent,
  FuzzySuggestModal,
  Modal,
  Notice,
  Plugin,
  ItemView,
  WorkspaceLeaf,
  PluginSettingTab,
  Setting,
  SliderComponent,
  TextComponent,
  ToggleComponent,
  TFile,
  TFolder,
  getAllTags,
  getFrontMatterInfo,
  getLanguage,
  requireApiVersion,
  requestUrl,
  parseYaml,
  stringifyYaml,
  setIcon,
  normalizePath
};
export const Platform = { isMobile: false };
