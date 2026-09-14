import { describe, expect, it, vi } from "vitest";
import { performance } from "node:perf_hooks";
import { arch, cpus, platform } from "node:os";
import type { IndexedNote, TagIndex } from "../src/index/TagIndex";
import { buildTagIndex } from "../src/index/TagIndexBuilder";
import { TagIndexService, type TagIndexServiceDependencies } from "../src/index/TagIndexService";
import { PluginDataStore } from "../src/operations/PluginDataStore";

function note(path: string, tag = "topic"): IndexedNote {
  return { path, content: `Body #${tag}`, frontmatterTags: [tag], inlineTags: [tag], allTags: [tag], sourceContentHash: "hash" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function setup(overrides: Partial<TagIndexServiceDependencies> = {}, cache?: TagIndex) {
  const dependencies = {
    listPaths: vi.fn(() => ["a.md"]),
    readNote: vi.fn(async (path: string) => note(path)),
    persist: vi.fn(async () => undefined),
    ...overrides
  };
  return { dependencies, service: new TagIndexService(dependencies, cache) };
}

describe("TagIndexService", () => {
  it("starts missing without cache and stale with a legacy cache", () => {
    expect(setup().service.getSnapshot()).toMatchObject({ state: "missing", revision: 0, vaultRevision: 0, policyRevision: 0 });
    const cache = buildTagIndex([note("cached.md")]);
    expect(setup({}, cache).service.getSnapshot()).toMatchObject({ state: "stale", index: cache });
  });

  it("matches Builder's source/count semantics, persists once, and bounds examples", async () => {
    const notes = Array.from({ length: 10 }, (_, i) => note(`${i}.md`));
    notes[0].metadataTags = ["Topic"];
    notes[0].frontmatterTags.push("topic");
    const now = new Date("2026-09-10T00:00:00.000Z");
    const persist = vi.fn(async () => undefined);
    const service = new TagIndexService({
      listPaths: () => notes.map((entry) => entry.path),
      readNote: async (path) => notes.find((entry) => entry.path === path)!, persist
    }, undefined, { now: () => now });
    expect(await service.refresh()).toEqual(buildTagIndex(notes, now));
    expect(service.getSnapshot()).toMatchObject({ state: "ready", revision: 1, generation: 1, progress: { completed: 10, total: 10 } });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().index?.tags.topic.examples).toHaveLength(3);
    expect(JSON.stringify(service.getSnapshot().index)).not.toContain("sourceContentHash");
  });

  it("handles prototype-named tags without inheriting object properties", async () => {
    const { service } = setup({ readNote: async (path) => note(path, "__proto__") });
    expect((await service.refresh())?.tags.__proto__.files).toHaveLength(1);
  });

  it("retains compatibility with metadata-only persisted inventories", async () => {
    const legacy = { path: "a.md", content: "#Ignored", frontmatterTags: ["Ignored"], metadataTags: ["#Legacy"] } as IndexedNote;
    const { service } = setup({ readNote: async () => legacy });
    const index = await service.refresh();
    expect(Object.keys(index!.tags)).toEqual(["Legacy"]);
    expect(index!.tags.Legacy.files[0].sources).toEqual(["metadata"]);
  });

  it("limits real reads to four and aggregates completions before the full scan finishes", async () => {
    const paths = Array.from({ length: 12 }, (_, i) => `${String(i).padStart(2, "0")}.md`);
    const reads = new Map<string, ReturnType<typeof deferred<IndexedNote>>>();
    let active = 0;
    let peak = 0;
    const { service } = setup({ listPaths: () => paths, readNote: async (path) => {
      active += 1;
      peak = Math.max(peak, active);
      const gate = deferred<IndexedNote>();
      reads.set(path, gate);
      try { return await gate.promise; } finally { active -= 1; }
    } });
    const refresh = service.refresh();
    await flush();
    expect(reads.size).toBe(4);
    reads.get(paths[3])!.resolve(note(paths[3]));
    await flush();
    expect(reads.size).toBe(5);
    expect(service.getSnapshot().progress).toEqual({ completed: 1, total: 12 });
    for (const path of paths) {
      reads.get(path)!.resolve(note(path));
      await flush();
    }
    await refresh;
    expect(peak).toBe(4);
    expect(service.getSnapshot().index!.tags.topic.examples.map((example) => example.path)).toEqual(paths.slice(0, 3));
    console.info(JSON.stringify({ fixture: "12 notes, controlled reads", peakReads: peak }));
  });

  it("deduplicates paths and excludes global folders before reading without prefix leakage", async () => {
    const readNote = vi.fn(async (path: string) => note(path));
    const service = new TagIndexService({ listPaths: () => ["Private/a.md", "Private-old/b.md", "ok.md", "ok.md", "image.png"], readNote,
      includePath: (path) => !path.startsWith("Private/"), persist: async () => undefined });
    await service.refresh();
    expect(readNote.mock.calls.map(([path]) => path)).toEqual(["Private-old/b.md", "ok.md"]);
  });

  it("uses the explicit inline setting and keeps metadata semantics", async () => {
    const { service } = setup({ includeInlineTags: () => false });
    expect((await service.refresh())!.tags.topic.files[0].sources).toEqual(["frontmatter"]);
  });

  it("does not announce ready before persistence succeeds", async () => {
    const save = deferred<void>();
    const { service } = setup({ persist: () => save.promise });
    const refresh = service.refresh();
    await flush();
    expect(service.getSnapshot()).toMatchObject({ state: "refreshing", index: undefined, revision: 0 });
    save.resolve();
    expect(await refresh).toBeDefined();
    expect(service.getSnapshot().state).toBe("ready");
  });

  it("shares a scan across concurrent callers", async () => {
    const read = deferred<IndexedNote>();
    const listPaths = vi.fn(() => ["a.md"]);
    const { service } = setup({ listPaths, readNote: () => read.promise });
    const a = service.refresh();
    const b = service.refresh();
    read.resolve(note("a.md"));
    expect(await a).toBe(await b);
    expect(listPaths).toHaveBeenCalledTimes(1);
  });

  it("marks event bursts dirty without scanning and coalesces subscribers", async () => {
    const { service, dependencies } = setup();
    await service.refresh();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    service.markStale();
    service.notifyFileChanged("renamed-directory");
    service.notifyFileChanged("a.md");
    expect(service.getSnapshot()).toMatchObject({ state: "stale", vaultRevision: 3 });
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(dependencies.listPaths).toHaveBeenCalledTimes(1);
    unsubscribe();
    service.markStale();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("isolates observer failures and defensive snapshot arrays", async () => {
    const { service } = setup();
    service.subscribe(() => { throw new Error("closed view"); });
    const snapshot = service.getSnapshot();
    snapshot.failedPaths.push("fake.md");
    snapshot.progress.total = 900;
    expect(service.getSnapshot().failedPaths).toEqual([]);
    expect(await service.refresh()).toBeDefined();
  });

  it("keeps old cache on partial failure, reports failed paths, and can retry", async () => {
    const cache = buildTagIndex([note("old.md", "old")]);
    let failing = true;
    const { service, dependencies } = setup({ listPaths: () => ["a.md", "b.md", "c.md"], readNote: async (path) => {
      if (failing && path === "b.md") throw new Error("unreadable");
      return note(path, "new");
    } }, cache);
    expect(await service.refresh()).toBeUndefined();
    expect(service.getSnapshot()).toMatchObject({ state: "error", index: cache, revision: 0, failedPaths: ["b.md"], progress: { completed: 3, total: 3 } });
    expect(dependencies.persist).not.toHaveBeenCalled();
    failing = false;
    expect(await service.refresh()).toBeDefined();
    expect(service.getSnapshot()).toMatchObject({ state: "ready", revision: 1, failedPaths: [], error: null });
  });

  it("does not commit a read for the wrong path", async () => {
    const { service, dependencies } = setup({ readNote: async () => note("different.md") });
    expect(await service.refresh()).toBeUndefined();
    expect(service.getSnapshot().failedPaths).toEqual(["a.md"]);
    expect(dependencies.persist).not.toHaveBeenCalled();
  });

  it("preserves the cache for enumeration failure and invalid relative paths", async () => {
    const cache = buildTagIndex([note("old.md")]);
    const { service } = setup({ listPaths: () => { throw new Error("enumeration failed"); } }, cache);
    expect(await service.refresh()).toBeUndefined();
    expect(service.getSnapshot()).toMatchObject({ state: "error", index: cache, error: "enumeration failed" });
    const invalid = setup({ listPaths: () => ["../private.md"] });
    await invalid.service.refresh();
    expect(invalid.service.getSnapshot().state).toBe("error");
    expect(invalid.dependencies.readNote).not.toHaveBeenCalled();
  });

  it("keeps old cache after save failure and recovers the persistence queue", async () => {
    const cache = buildTagIndex([note("old.md")]);
    const persist = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const { service } = setup({ persist }, cache);
    await service.refresh();
    expect(service.getSnapshot()).toMatchObject({ state: "error", index: cache, revision: 0, error: "disk full" });
    expect(await service.refresh()).toBeDefined();
    expect(service.getSnapshot().revision).toBe(1);
  });

  it("rejects a scan dirtied during reads without automatically rescanning", async () => {
    const read = deferred<IndexedNote>();
    const { service, dependencies } = setup({ readNote: () => read.promise });
    const refresh = service.refresh();
    await flush();
    service.notifyFileChanged("new.md");
    read.resolve(note("a.md"));
    expect(await refresh).toBeUndefined();
    expect(service.getSnapshot()).toMatchObject({ state: "stale", revision: 0, vaultRevision: 1 });
    expect(dependencies.persist).not.toHaveBeenCalled();
    expect(dependencies.listPaths).toHaveBeenCalledTimes(1);
  });

  it("rejects a scan dirtied during persistence and exposes a false queue-head guard", async () => {
    const save = deferred<void>();
    let isCurrent!: () => boolean;
    const { service } = setup({ persist: (_index, context) => { isCurrent = context.isCurrent; return save.promise; } });
    const refresh = service.refresh();
    await flush();
    expect(isCurrent()).toBe(true);
    service.markStale();
    expect(isCurrent()).toBe(false);
    save.resolve();
    expect(await refresh).toBeUndefined();
    expect(service.getSnapshot()).toMatchObject({ state: "stale", revision: 0 });
  });

  it("cancels pending enumeration promptly and ignores its late rejection", async () => {
    const list = deferred<string[]>();
    const { service, dependencies } = setup({ listPaths: () => list.promise });
    const refresh = service.refresh();
    service.cancel();
    expect(await refresh).toBeUndefined();
    const snapshot = service.getSnapshot();
    list.reject(new Error("late failure"));
    await flush();
    expect(service.getSnapshot()).toEqual(snapshot);
    expect(dependencies.readNote).not.toHaveBeenCalled();
  });

  it("stops claiming immediately, enforces cross-generation concurrency, and ignores late results", async () => {
    const old = Array.from({ length: 4 }, () => deferred<IndexedNote>());
    let second = false;
    let readCount = 0;
    let active = 0;
    let peak = 0;
    const { service } = setup({ listPaths: () => second ? ["new.md"] : ["0.md", "1.md", "2.md", "3.md", "never.md"],
      readNote: async (path) => {
        active += 1;
        peak = Math.max(peak, active);
        readCount += 1;
        try { return path === "new.md" ? note(path, "new") : await old[Number(path[0])].promise; }
        finally { active -= 1; }
      }
    });
    const first = service.refresh();
    await flush();
    const start = performance.now();
    service.cancel();
    await first;
    const cancelMs = performance.now() - start;
    expect(cancelMs).toBeLessThan(250);
    second = true;
    const refresh = service.refresh();
    await flush();
    expect(readCount).toBe(4);
    old[0].resolve(note("0.md", "old"));
    await refresh;
    const snapshot = service.getSnapshot();
    old[1].reject(new Error("late"));
    old[2].resolve(note("2.md", "old"));
    old[3].resolve(note("3.md", "old"));
    await flush();
    expect(service.getSnapshot()).toEqual(snapshot);
    expect(Object.keys(snapshot.index!.tags)).toEqual(["new"]);
    expect(readCount).toBe(5);
    expect(peak).toBe(4);
    console.info(JSON.stringify({ fixture: "cancel with four pending reads", cancelMs, peakReads: peak }));
  });

  it("serializes persistence across cancellation so late old saves cannot overwrite a newer save", async () => {
    const save = deferred<void>();
    let count = 0;
    let disk: TagIndex | undefined;
    const { service } = setup({ readNote: async (path) => note(path, count === 0 ? "old" : "new"), persist: async (index) => {
      count += 1;
      if (count === 1) await save.promise;
      disk = index;
    } });
    const first = service.refresh();
    await flush();
    service.cancel();
    await first;
    const second = service.refresh();
    await flush();
    expect(count).toBe(1);
    save.resolve();
    await second;
    expect(Object.keys(disk!.tags)).toEqual(["new"]);
    expect(service.getSnapshot().index).toBe(disk);
  });

  it("purges policy-invalidated cache immediately and persists before allowing new reads", async () => {
    const cache = buildTagIndex([note("secret/a.md"), note("public/a.md")]);
    const gate = deferred<void>();
    const persist = vi.fn((_index: TagIndex | undefined) => gate.promise);
    const { service, dependencies } = setup({ persist }, cache);
    const purge = service.invalidatePolicy(1, ["secret"]);
    expect(service.getSnapshot()).toMatchObject({ index: undefined, policyRevision: 1 });
    expect(await service.refresh()).toBeUndefined();
    expect(dependencies.readNote).not.toHaveBeenCalled();
    await flush();
    expect(persist.mock.calls[0][0]).toBeUndefined();
    gate.resolve();
    await purge;
    expect(service.getSnapshot().state).toBe("missing");
    expect(await service.refresh()).toBeDefined();
  });

  it("keeps failed cache purges blocked until an explicit successful retry", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("purge failed")).mockResolvedValue(undefined);
    const { service, dependencies } = setup({ persist });
    await expect(service.invalidatePolicy(2)).rejects.toThrow("purge failed");
    expect(service.getSnapshot()).toMatchObject({ state: "error", index: undefined });
    service.notifyFileChanged("a.md");
    expect(service.getSnapshot().state).toBe("error");
    await service.refresh();
    expect(dependencies.listPaths).not.toHaveBeenCalled();
    await service.invalidatePolicy(2);
    expect(await service.refresh()).toBeDefined();
  });

  it("purges after an in-flight old save and ignores old generation completion", async () => {
    const save = deferred<void>();
    let disk: TagIndex | undefined;
    let count = 0;
    const { service } = setup({ persist: async (index) => {
      count += 1;
      if (count === 1) await save.promise;
      disk = index;
    } });
    const refresh = service.refresh();
    await flush();
    const purge = service.invalidatePolicy(1);
    expect(await refresh).toBeUndefined();
    save.resolve();
    await purge;
    expect(disk).toBeUndefined();
    expect(service.getSnapshot()).toMatchObject({ state: "missing", policyRevision: 1, index: undefined });
  });

  it("drops queued superseded policy purges while preserving the newest state", async () => {
    const { service, dependencies } = setup();
    const a = service.invalidatePolicy(1);
    const b = service.invalidatePolicy(2);
    await Promise.all([a, b]);
    expect(dependencies.persist).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot()).toMatchObject({ policyRevision: 2, state: "missing" });
  });

  it("rejects decreasing revisions and unnormalized exclusion folders", async () => {
    const { service } = setup();
    await service.invalidatePolicy(3);
    await expect(service.invalidatePolicy(2)).rejects.toThrow("cannot decrease");
    await expect(service.invalidatePolicy(4, ["../secret"])).rejects.toThrow("vault-relative");
    await expect(service.invalidatePolicy(3, ["secret"])).rejects.toThrow("new policy revision");
  });

  it("filters startup cache examples using the host policy without modifying the input", () => {
    const cache = buildTagIndex([note("secret/a.md", "secret"), note("public/a.md", "public")]);
    const saved = JSON.stringify(cache);
    const { service } = setup({ includePath: (path) => !path.startsWith("secret/") }, cache);
    expect(service.getSnapshot().state).toBe("stale");
    expect(Object.keys(service.getSnapshot().index!.tags)).toEqual(["public"]);
    expect(JSON.stringify(service.getSnapshot().index)).not.toContain("secret/a.md");
    expect(JSON.stringify(cache)).toBe(saved);
  });

  it("distinguishes a complete empty vault from no index", async () => {
    const { service } = setup({ listPaths: () => [] });
    expect(await service.refresh()).toEqual({ updatedAt: expect.any(String), tags: {} });
    expect(service.getSnapshot()).toMatchObject({ state: "ready", revision: 1, progress: { completed: 0, total: 0 } });
  });

  it("reports injected settings failures without leaving an unhandled refresh rejection", async () => {
    const { service } = setup({ includeInlineTags: () => { throw new Error("settings unavailable"); } });
    expect(await service.refresh()).toBeUndefined();
    expect(service.getSnapshot()).toMatchObject({ state: "error", error: "settings unavailable" });
  });

  it("cancels policy-obsolete reads and applies the injected updated policy before the next read", async () => {
    const read = deferred<IndexedNote>();
    let excluded = false;
    const readNote = vi.fn((path: string) => path.startsWith("private/") ? read.promise : Promise.resolve(note(path, "public")));
    const { service } = setup({ listPaths: () => ["private/a.md", "public/a.md"], readNote,
      includePath: (path) => !excluded || !path.startsWith("private/") });
    const first = service.refresh();
    await flush();
    excluded = true;
    await service.invalidatePolicy(1);
    expect(await first).toBeUndefined();
    expect(await service.refresh()).toBeDefined();
    const snapshot = service.getSnapshot();
    read.resolve(note("private/a.md", "secret"));
    await flush();
    expect(service.getSnapshot()).toEqual(snapshot);
    expect(Object.keys(snapshot.index!.tags)).toEqual(["public"]);
    expect(readNote.mock.calls.filter(([path]) => path === "private/a.md")).toHaveLength(1);
  });

  it("does not start reads for a cancelled generation waiting on older I/O slots", async () => {
    const reads = Array.from({ length: 4 }, () => deferred<IndexedNote>());
    let run = 0;
    const readNote = vi.fn((path: string) => path.startsWith("old-") ? reads[Number(path[4])].promise : Promise.resolve(note(path)));
    const { service } = setup({ listPaths: () => run === 0 ? ["old-0.md", "old-1.md", "old-2.md", "old-3.md"] : [`new-${run}.md`], readNote });
    const a = service.refresh();
    await flush();
    service.cancel();
    await a;
    run = 1;
    const b = service.refresh();
    await flush();
    service.cancel();
    await b;
    run = 2;
    const c = service.refresh();
    await flush();
    reads.forEach((read, i) => read.resolve(note(`old-${i}.md`)));
    await c;
    expect(readNote.mock.calls.map(([path]) => path)).not.toContain("new-1.md");
    expect(service.getSnapshot().index!.tags.topic.files.map((file) => file.path)).toEqual(["new-2.md"]);
  });

  it.each([1000, 10000])("measures a streaming refresh with a fixed %i-note fixture", async (size) => {
    let active = 0;
    let peak = 0;
    let reads = 0;
    let saves = 0;
    const service = new TagIndexService({
      listPaths: () => Array.from({ length: size }, (_, i) => `notes/${String(i).padStart(5, "0")}.md`),
      readNote: async (path) => {
        active += 1;
        peak = Math.max(peak, active);
        reads += 1;
        try {
          await Promise.resolve();
          const id = path.slice("notes/".length, -".md".length);
          const unique = `tag-${id}`;
          const group = `group-${Number(id) % 10}`;
          return { path, content: `#${unique} #shared #${group}\n`.padEnd(1024, "x"),
            frontmatterTags: [unique, "shared"], inlineTags: [unique, group],
            allTags: [unique, "shared", group], sourceContentHash: "synthetic-not-a-measured-hash" };
        } finally { active -= 1; }
      },
      persist: async () => { saves += 1; }
    });
    const start = performance.now();
    const index = await service.refresh();
    const refreshMs = performance.now() - start;
    expect(service.getSnapshot().state).toBe("ready");
    expect(Object.keys(index!.tags)).toHaveLength(size + 11);
    expect(reads).toBe(size);
    expect(saves).toBe(1);
    expect(peak).toBe(4);
    expect(index!.tags.shared.files).toHaveLength(size);
    expect(index!.tags.shared.examples).toHaveLength(3);
    expect(Object.values(index!.tags).every((usage) => usage.examples.length <= 3)).toBe(true);
    console.info(JSON.stringify({ fixtureNotes: size, contentBytesPerNote: 1024, distinctTags: size + 11,
      warmups: 0, samples: 1, refreshMs, reads, persistCalls: saves, peakReads: peak, maxExamplesPerTag: 3,
      cpu: cpus()[0]?.model, platform: platform(), arch: arch(), node: process.version,
      host: "Node/Vitest; generated in-memory notes, microtask I/O and no-op persistence" }));
  });
});

// These are diagnostic reproductions of integration hazards, not passing safety gates.
describe("TagIndexService persistence adapter diagnostics", () => {
  it("reproduces early publication diverging from the retained service cache on save failure", async () => {
    const cache = buildTagIndex([note("old.md", "old")]);
    let published: TagIndex | undefined = cache;
    const store = new PluginDataStore({ snapshot: () => ({ tagIndex: published }),
      write: async () => { throw new Error("disk full"); } });
    const { service } = setup({ persist: async (index, context) => {
      if (!context.isCurrent()) return;
      published = index;
      await store.save();
    } }, cache);
    expect(await service.refresh()).toBeUndefined();
    expect(service.getSnapshot()).toMatchObject({ state: "error", index: cache });
    expect(published).not.toBe(cache);
    expect(Object.keys(published!.tags)).toEqual(["topic"]);
    expect(store.requiresReload).toBe(true);
  });

  it("reproduces cancellation after adapter guard but before the shared queue head", async () => {
    const cache = buildTagIndex([note("old.md", "old")]);
    let published: TagIndex | undefined = cache;
    const writes: Array<{ tagIndex: TagIndex | undefined }> = [];
    const gate = deferred<void>();
    let writeCount = 0;
    const store = new PluginDataStore({ snapshot: () => ({ tagIndex: published }), write: async (data) => {
      writeCount += 1;
      if (writeCount === 1) await gate.promise;
      writes.push(data);
    } });
    const busy = store.save();
    await flush();
    const { service } = setup({ persist: async (index, context) => {
      if (!context.isCurrent()) return;
      published = index;
      await store.save();
    } }, cache);
    const refresh = service.refresh();
    await flush();
    expect(published).not.toBe(cache);
    service.cancel();
    await refresh;
    gate.resolve();
    await busy;
    await flush();
    expect(service.getSnapshot()).toMatchObject({ state: "stale", index: cache });
    expect(writes).toHaveLength(2);
    expect(Object.keys(writes[1].tagIndex!.tags)).toEqual(["topic"]);
  });

  it("documents that revision-only invalidation retains initial exclusion folders", async () => {
    let included = false;
    const readNote = vi.fn(async (path: string) => note(path));
    const service = new TagIndexService({ listPaths: () => ["private/a.md"], readNote,
      includePath: () => included, persist: async () => undefined
    }, undefined, { policy: { revision: 0, excludedFolders: ["private"] } });
    included = true;
    await service.invalidatePolicy(1);
    await service.refresh();
    expect(readNote).not.toHaveBeenCalled();
    await service.invalidatePolicy(2, []);
    await service.refresh();
    expect(readNote).toHaveBeenCalledTimes(1);
  });
});
