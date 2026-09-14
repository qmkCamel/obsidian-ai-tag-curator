import type { IndexedNote, TagIndex, TagSource } from "./TagIndex";
import { parseInlineTags } from "../obsidian/TagParser";
import { normalizeTag } from "../utils/normalizeTag";

export type IndexState = "missing" | "ready" | "stale" | "refreshing" | "error";

export interface IndexSnapshotState {
  state: IndexState;
  revision: number;
  vaultRevision: number;
  policyRevision: number;
  generation: number;
  failedPaths: string[];
}

export interface TagIndexSnapshot extends IndexSnapshotState {
  /** Borrowed immutable index. Consumers must not mutate this object. */
  index: TagIndex | undefined;
  progress: { completed: number; total: number };
  error: string | null;
}

export interface TagIndexPolicy {
  revision: number;
  /** Host-normalized, vault-relative folders. Empty string excludes the root. */
  excludedFolders: readonly string[];
}

export interface TagIndexPersistContext {
  generation: number;
  vaultRevision: number;
  policyRevision: number;
  /** Check again at the host data-store queue head, before changing plugin data. */
  isCurrent(): boolean;
}

export interface TagIndexServiceDependencies {
  listPaths(): readonly string[] | Promise<readonly string[]>;
  readNote(path: string): Promise<IndexedNote>;
  /** Optional adapter to the host's shared global policy predicate. */
  includePath?(path: string): boolean;
  includeInlineTags?(): boolean;
  /** Save only this field through the shared data store; undefined purges cached snippets. */
  persist(index: TagIndex | undefined, context: TagIndexPersistContext): Promise<void>;
}

export interface TagIndexServiceOptions {
  revision?: number;
  vaultRevision?: number;
  policy?: TagIndexPolicy;
  includeInlineTags?: boolean;
  now?: () => Date;
}

export type TagIndexRefreshResult = {
  status: "ready" | "stale" | "error" | "cancelled";
  snapshot: TagIndexSnapshot;
};

interface RefreshRun {
  generation: number;
  controller: AbortController;
  promise: Promise<TagIndexRefreshResult>;
  indexPromise: Promise<TagIndex | undefined>;
}

/** One instance per plugin; host events only call markVaultChanged, never refresh. */
export class TagIndexService {
  private snapshot: TagIndexSnapshot;
  private policy: TagIndexPolicy;
  private active: RefreshRun | null = null;
  private listeners = new Set<(snapshot: TagIndexSnapshot) => void>();
  private notificationPending = false;
  private persistTail: Promise<void> = Promise.resolve();
  private policyPending = false;
  private activeReads = 0;
  private readWaiters: Array<() => void> = [];

  constructor(
    private readonly dependencies: TagIndexServiceDependencies,
    cachedIndex: TagIndex | null = null,
    private readonly options: TagIndexServiceOptions = {}
  ) {
    this.policy = copyPolicy(options.policy ?? { revision: 0, excludedFolders: [] });
    // A configured exclusion must not expose snippets from an unverified legacy cache.
    const index = cachedIndex ? filterCachedIndex(cachedIndex, (path) =>
      !this.policy.excludedFolders.some((folder) => inFolder(path, folder)) && (dependencies.includePath?.(path) ?? true)) : undefined;
    this.snapshot = {
      index, state: index ? "stale" : "missing", revision: options.revision ?? 0,
      vaultRevision: options.vaultRevision ?? 0, policyRevision: this.policy.revision,
      generation: 0, failedPaths: [], progress: { completed: 0, total: 0 }, error: null
    };
  }

  getSnapshot(): TagIndexSnapshot {
    return { ...this.snapshot, failedPaths: [...this.snapshot.failedPaths], progress: { ...this.snapshot.progress } };
  }

  /** Subscribe to coalesced changes; obtain the initial state with getSnapshot(). */
  subscribe(listener: (snapshot: TagIndexSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  markVaultChanged(): void {
    this.snapshot.vaultRevision += 1;
    if (this.snapshot.state !== "refreshing" && !this.policyPending) this.snapshot.state = this.snapshot.index ? "stale" : "missing";
    this.notify();
  }

  markStale(): void { this.markVaultChanged(); }

  /** The host filters Markdown/cache events and also forwards directory rename/delete. */
  notifyFileChanged(_path?: string): void { this.markVaultChanged(); }

  invalidatePolicy(newRevision: number, excludedFolders: readonly string[] = this.policy.excludedFolders): Promise<void> {
    return this.setPolicy({ revision: newRevision, excludedFolders });
  }

  /** Invalidate immediately; await the purge before allowing reads under the new policy.
   * The host must separately clear AI caches and persist policy through its shared store.
   * Failed purges stay blocked until setPolicy is retried, including with the same revision.
   */
  async setPolicy(policy: TagIndexPolicy): Promise<void> {
    const next = copyPolicy(policy);
    if (next.revision < this.policy.revision) throw new Error("Policy revision cannot decrease");
    if (next.revision === this.policy.revision && !sameFolders(next.excludedFolders, this.policy.excludedFolders)) {
      throw new Error("Changed exclusions require a new policy revision");
    }
    this.cancelRefresh();
    const generation = ++this.snapshot.generation;
    this.policy = next;
    this.policyPending = true;
    this.snapshot = { ...this.snapshot, index: undefined, state: "stale", policyRevision: next.revision,
      revision: this.snapshot.revision + 1, failedPaths: [], error: null, progress: { completed: 0, total: 0 } };
    this.notify();
    try {
      await this.persist(undefined, generation, () => generation === this.snapshot.generation);
      if (generation !== this.snapshot.generation) return;
      this.policyPending = false;
      this.snapshot.state = "missing";
    } catch (error) {
      if (generation !== this.snapshot.generation) throw error;
      this.snapshot.state = "error";
      this.snapshot.error = errorMessage(error);
      throw error;
    } finally {
      this.notify();
    }
  }

  /** Concurrent callers share a scan. A cancelled scan settles without waiting for I/O. */
  refresh(): Promise<TagIndex | undefined> {
    if (this.active) return this.active.indexPromise;
    this.refreshWithResult();
    return this.currentIndexPromise();
  }

  private currentIndexPromise(): Promise<TagIndex | undefined> { return this.active?.indexPromise ?? Promise.resolve(undefined); }

  /** Detailed result for callers that need cancellation versus stale/error outcomes. */
  refreshWithResult(): Promise<TagIndexRefreshResult> {
    if (this.active) return this.active.promise;
    if (this.policyPending) {
      return Promise.resolve({ status: "error", snapshot: this.getSnapshot() });
    }
    const generation = ++this.snapshot.generation;
    const controller = new AbortController();
    this.snapshot = { ...this.snapshot, state: "refreshing", failedPaths: [], error: null,
      progress: { completed: 0, total: 0 } };
    const cancelled = new Promise<TagIndexRefreshResult>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve({ status: "cancelled", snapshot: this.getSnapshot() }), { once: true });
    });
    const run: RefreshRun = { generation, controller, promise: Promise.resolve({ status: "cancelled", snapshot: this.getSnapshot() }), indexPromise: Promise.resolve(undefined) };
    this.active = run;
    run.promise = Promise.race([this.scan(run), cancelled]).finally(() => {
      if (this.active === run) this.active = null;
    });
    run.indexPromise = run.promise.then((value) => value.status === "ready" ? value.snapshot.index : undefined);
    this.notify();
    return run.promise;
  }

  cancelRefresh(): void {
    const run = this.active;
    if (!run) return;
    this.active = null;
    this.snapshot.generation += 1;
    this.snapshot.state = this.snapshot.index ? "stale" : "missing";
    run.controller.abort();
    this.notify();
  }

  cancel(): void { this.cancelRefresh(); }

  private async scan(run: RefreshRun): Promise<TagIndexRefreshResult> {
    const vaultRevision = this.snapshot.vaultRevision;
    const policyRevision = this.snapshot.policyRevision;
    const current = () => !run.controller.signal.aborted && run.generation === this.snapshot.generation;
    const fresh = () => current() && vaultRevision === this.snapshot.vaultRevision && policyRevision === this.snapshot.policyRevision;
    const result = (status: TagIndexRefreshResult["status"]): TagIndexRefreshResult => ({ status, snapshot: this.getSnapshot() });
    try {
      const includeInlineTags = this.dependencies.includeInlineTags?.() ?? this.options.includeInlineTags !== false;
      const listed = await this.dependencies.listPaths();
      if (!current()) return result("cancelled");
      const paths = [...new Set(listed)].filter((path) => {
        validateRelativePath(path, false);
        return path.toLowerCase().endsWith(".md") && !this.policy.excludedFolders.some((folder) => inFolder(path, folder))
          && (this.dependencies.includePath?.(path) ?? true);
      }).sort();
      const index: TagIndex = { updatedAt: (this.options.now?.() ?? new Date()).toISOString(), tags: Object.create(null) };
      const failures: string[] = [];
      let cursor = 0;
      this.snapshot.progress.total = paths.length;
      this.notify();
      const worker = async () => {
        while (current() && cursor < paths.length) {
          if (!await this.acquireRead(run.controller.signal)) return;
          if (!current() || cursor >= paths.length) { this.releaseRead(); return; }
          const path = paths[cursor++];
          try {
            const note = await this.dependencies.readNote(path);
            if (!current()) return;
            if (note.path !== path) throw new Error("Read returned a different note path");
            aggregateNote(index, note, includeInlineTags);
          } catch {
            if (current()) failures.push(path);
          } finally {
            this.releaseRead();
            if (current()) {
              this.snapshot.progress.completed += 1;
              this.snapshot.failedPaths = [...failures].sort();
              this.notify();
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, paths.length) }, worker));
      if (!current()) return result("cancelled");
      if (failures.length) throw new Error(`Failed to index ${failures.length} Markdown file(s)`);
      if (!fresh()) { this.snapshot.state = "stale"; return result("stale"); }
      // I/O completion order must not decide representative snippets or persisted file order.
      for (const usage of Object.values(index.tags)) usage.files.sort((a, b) => compareText(a.path, b.path));
      await this.persist(index, run.generation, fresh);
      if (!current()) return result("cancelled");
      if (!fresh()) { this.snapshot.state = "stale"; return result("stale"); }
      this.snapshot.index = index;
      this.snapshot.revision += 1;
      this.snapshot.state = "ready";
      return result("ready");
    } catch (error) {
      if (!current()) return result("cancelled");
      this.snapshot.state = "error";
      this.snapshot.error = errorMessage(error);
      return result("error");
    } finally {
      if (current()) this.notify();
    }
  }

  private persist(index: TagIndex | undefined, generation: number, isCurrent: () => boolean): Promise<void> {
    const context: TagIndexPersistContext = { generation, vaultRevision: this.snapshot.vaultRevision,
      policyRevision: this.snapshot.policyRevision, isCurrent };
    const task = this.persistTail.then(async () => {
      if (isCurrent()) await this.dependencies.persist(index, context);
    });
    this.persistTail = task.catch(() => undefined);
    return task;
  }

  // Slots belong to physical reads, including I/O from cancelled generations.
  private acquireRead(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    if (this.activeReads < 4) { this.activeReads += 1; return Promise.resolve(true); }
    return new Promise((resolve) => {
      const abort = () => {
        this.readWaiters = this.readWaiters.filter((waiter) => waiter !== start);
        resolve(false);
      };
      const start = () => {
        signal.removeEventListener("abort", abort);
        this.activeReads += 1;
        resolve(true);
      };
      this.readWaiters.push(start);
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  private releaseRead(): void {
    this.activeReads -= 1;
    this.readWaiters.shift()?.();
  }

  private notify(): void {
    if (this.notificationPending) return;
    this.notificationPending = true;
    queueMicrotask(() => {
      this.notificationPending = false;
      for (const listener of this.listeners) {
        // A disposed/broken view must not turn a successful scan into an index failure.
        try { listener(this.getSnapshot()); } catch { /* Observer isolation. */ }
      }
    });
  }
}

/** Mirrors Builder's legacy count/source semantics without retaining the notes array. */
function aggregateNote(index: TagIndex, note: IndexedNote, includeInlineTags: boolean): void {
  const sourceInventory = Array.isArray(note.inlineTags) && Array.isArray(note.allTags);
  const legacy = note.metadataTags !== undefined && !sourceInventory;
  const tags = new Map<string, TagSource[]>();
  const add = (values: string[], source: TagSource) => {
    for (const tag of values) {
      if (tag) tags.set(tag, [...(tags.get(tag) ?? []), source]);
    }
  };
  add(note.metadataTags?.map((tag) => tag.trim().replace(/^#+/, "")) ?? [], "metadata");
  if (!legacy) {
    add(note.frontmatterTags.map(normalizeTag), "frontmatter");
    if (includeInlineTags) add(sourceInventory ? note.inlineTags.map(normalizeTag) : parseInlineTags(note.content), "inline");
  }
  for (const [tag, sources] of tags) {
    const depth = tag.split("/").filter(Boolean).length;
    const usage = index.tags[tag] ??= { tag, normalized: normalizeTag(tag), count: 0, files: [], examples: [],
      namingSignals: { hasHierarchy: depth > 1, depth } };
    usage.count += sources.length;
    usage.files.push({ path: note.path, count: sources.length, sources: [...new Set(sources)] });
    if (usage.examples.length < 3 || compareText(note.path, usage.examples[2].path) < 0) {
      const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const snippet = (note.content.match(new RegExp(`.{0,80}#?${escaped}.{0,80}`, "i"))?.[0] ?? note.content.slice(0, 160))
        .replace(/\s+/g, " ").trim();
      usage.examples.push({ path: note.path, snippet });
      usage.examples.sort((a, b) => compareText(a.path, b.path));
      if (usage.examples.length > 3) usage.examples.pop();
    }
  }
}

function copyPolicy(policy: TagIndexPolicy): TagIndexPolicy {
  if (!Number.isSafeInteger(policy.revision) || policy.revision < 0) throw new Error("Invalid policy revision");
  for (const folder of policy.excludedFolders) validateRelativePath(folder, true);
  return { revision: policy.revision, excludedFolders: [...new Set(policy.excludedFolders)].sort() };
}

function validateRelativePath(path: string, rootAllowed: boolean): void {
  if (rootAllowed && path === "") return;
  if (!path || /[\\\u0000]/.test(path) || /^[A-Za-z]:/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Expected a normalized vault-relative path");
  }
}

function inFolder(path: string, folder: string): boolean { return folder === "" || path.startsWith(`${folder}/`); }
function sameFolders(a: readonly string[], b: readonly string[]): boolean { return a.length === b.length && a.every((value, i) => value === b[i]); }
function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function filterCachedIndex(index: TagIndex, includePath: (path: string) => boolean): TagIndex {
  const tags: TagIndex["tags"] = Object.create(null);
  let changed = false;
  for (const [key, usage] of Object.entries(index.tags)) {
    const files = usage.files.filter((file) => includePath(file.path));
    const examples = usage.examples.filter((example) => includePath(example.path));
    if (files.length !== usage.files.length || examples.length !== usage.examples.length) changed = true;
    if (files.length) tags[key] = { ...usage, files, examples,
      count: files.length === usage.files.length ? usage.count : files.reduce((sum, file) => sum + file.count, 0) };
    else changed = true;
  }
  return changed ? { ...index, tags } : index;
}
