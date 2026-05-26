import { vi } from "vitest";

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
}

interface FakeAppOptions {
  activeFilePath?: string | null;
  pluginData?: unknown;
}

interface FakeCache {
  frontmatter: {
    tags?: string[];
  };
  tags: string[];
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
let domHelpersInstalled = false;

export function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

export function installDomHelpers(): void {
  if (domHelpersInstalled) {
    return;
  }

  const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;

  prototype.empty = function empty(this: HTMLElement): void {
    this.replaceChildren();
  };

  prototype.addClass = function addClass(this: HTMLElement, ...classes: string[]): void {
    this.classList.add(...classes.flatMap((value) => value.split(/\s+/).filter(Boolean)));
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
    const element = document.createElement(tagName);
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

  domHelpersInstalled = true;
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

  constructor(path: string) {
    this.path = path;
    this.name = path.split("/").pop() ?? path;
    const parts = this.name.split(".");
    this.extension = parts.length > 1 ? parts.pop() ?? "" : "";
    this.basename = parts.join(".");
  }
}

export class Plugin {
  app: FakeObsidianApp;
  manifest: unknown;
  commands: Record<string, CommandLike> = {};
  settingTabs: PluginSettingTab[] = [];

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

  async loadData(): Promise<unknown> {
    return this.app.pluginData;
  }

  async saveData(data: unknown): Promise<void> {
    this.app.pluginData = data;
    this.app.savedData = data;
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

  constructor(notes: FakeNoteSpec[], options: FakeAppOptions) {
    this.vault = new FakeVault(notes);
    this.metadataCache = new FakeMetadataCache(this.vault);
    this.fileManager = new FakeFileManager(this.vault);
    this.workspace = new FakeWorkspace(this.vault, options.activeFilePath ?? null);
    this.pluginData = options.pluginData ?? null;
    this.savedData = null;
  }

  getNoteTags(path: string): string[] {
    return this.vault.getNote(path).frontmatterTags;
  }
}

export class FakeVault {
  private readonly notes = new Map<string, FakeVaultNote>();
  private readGate: Deferred<void> | null = null;

  constructor(notes: FakeNoteSpec[]) {
    for (const spec of notes) {
      this.notes.set(spec.path, new FakeVaultNote(spec));
    }
  }

  setReadGate(gate: Deferred<void> | null): void {
    this.readGate = gate;
  }

  getMarkdownFiles(): TFile[] {
    return Array.from(this.notes.values())
      .map((note) => note.file)
      .filter((file) => file.extension === "md");
  }

  async cachedRead(file: TFile): Promise<string> {
    if (this.readGate) {
      await this.readGate.promise;
    }

    return this.getNote(file.path).content;
  }

  getAbstractFileByPath(path: string): TFile | null {
    return this.notes.get(path)?.file ?? null;
  }

  getNote(path: string): FakeVaultNote {
    const note = this.notes.get(path);
    if (!note) {
      throw new Error(`Missing fake note: ${path}`);
    }
    return note;
  }
}

class FakeVaultNote {
  file: TFile;
  content: string;
  frontmatterTags: string[];

  constructor(spec: FakeNoteSpec) {
    this.file = new TFile(spec.path);
    this.content = spec.content;
    this.frontmatterTags = normalizeTagList(spec.frontmatterTags ?? []);
  }
}

class FakeMetadataCache {
  constructor(private readonly vault: FakeVault) {}

  getFileCache(file: TFile): FakeCache {
    const note = this.vault.getNote(file.path);
    return {
      frontmatter: {
        tags: [...note.frontmatterTags]
      },
      tags: collectAllTags(note)
    };
  }
}

class FakeFileManager {
  constructor(private readonly vault: FakeVault) {}

  async processFrontMatter(file: TFile, callback: (frontmatter: { tags?: FrontmatterTags }) => void): Promise<void> {
    const note = this.vault.getNote(file.path);
    const frontmatter: { tags?: FrontmatterTags } = {
      tags: [...note.frontmatterTags]
    };
    callback(frontmatter);
    note.frontmatterTags = normalizeFrontmatterTags(frontmatter.tags);
  }
}

class FakeWorkspace {
  private activeFile: TFile | null;
  private readonly searchLeaf = new FakeSearchLeaf();
  searchQueries: string[] = [];

  constructor(vault: FakeVault, activeFilePath: string | null) {
    this.activeFile = activeFilePath ? vault.getAbstractFileByPath(activeFilePath) : null;
  }

  getActiveFile(): TFile | null {
    return this.activeFile;
  }

  setActiveFile(file: TFile | null): void {
    this.activeFile = file;
  }

  getLeavesOfType(type: string): FakeSearchLeaf[] {
    return type === "search" ? [this.searchLeaf] : [];
  }

  getLeftLeaf(_split: boolean): FakeSearchLeaf {
    return this.searchLeaf;
  }

  async revealLeaf(_leaf: FakeSearchLeaf): Promise<void> {}
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

function normalizeFrontmatterTags(value: FrontmatterTags): string[] {
  if (!value) {
    return [];
  }

  const rawValues = Array.isArray(value) ? value : [value];
  return normalizeTagList(rawValues.flatMap((rawValue) => rawValue.split(/[\s,]+/)));
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

function collectAllTags(note: FakeVaultNote): string[] {
  return [...note.frontmatterTags.map((tag) => `#${tag}`), ...extractInlineTags(note.content).map((tag) => `#${tag}`)];
}

function extractInlineTags(content: string): string[] {
  const tags: string[] = [];
  const pattern = /(^|[\s([>{])#([A-Za-z0-9_\-/]+)(?=$|[\s.,;:!?()[\]{}<>])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    tags.push(match[2]);
  }
  return normalizeTagList(tags);
}

export function getAllTags(cache: FakeCache): string[] {
  return cache.tags;
}

export function getLanguage(): string {
  return mockLanguage;
}

export async function requestUrl(request: unknown): Promise<unknown> {
  return requestUrlMock(request);
}

export const obsidianMock = {
  ButtonComponent,
  DropdownComponent,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  SliderComponent,
  TextComponent,
  ToggleComponent,
  TFile,
  getAllTags,
  getLanguage,
  requestUrl
};
