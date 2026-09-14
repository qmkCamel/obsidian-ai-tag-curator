import { describe, expect, it, vi } from "vitest";
import { PluginDataStore } from "../src/operations/PluginDataStore";
import { OPERATION_HISTORY_BYTE_LIMIT } from "../src/operations/OperationLog";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("PluginDataStore", () => {
  it("takes a fresh detached snapshot at queue head and never overlaps writes", async () => {
    let state = { operations: [] as { status: string; files: string[] }[], receipts: [] as string[], index: 0, policy: { revision: 0 } };
    const first = deferred();
    const snapshots: typeof state[] = [];
    let writing = 0;
    let maximum = 0;
    const store = new PluginDataStore({ snapshot: () => state, write: async (snapshot) => {
      maximum = Math.max(maximum, ++writing);
      snapshots.push(snapshot);
      if (snapshots.length === 1) await first.promise;
      writing--;
    } });
    const indexSave = store.save();
    await Promise.resolve();
    state.operations.push({ status: "applying", files: ["note.md"] });
    const intentSave = store.save();
    const backgroundSave = store.save();
    state = { ...state, index: 1, policy: { revision: 1 } };
    expect(snapshots[0].operations).toEqual([]);
    first.resolve();
    await Promise.all([indexSave, intentSave, backgroundSave]);
    expect(maximum).toBe(1);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[1]).toEqual(state);
    expect(snapshots[2]).toEqual(state);
    state.operations[0].files.push("later.md");
    expect(snapshots[1].operations[0].files).toEqual(["note.md"]);
  });

  it("does not capture even the first state until its microtask reaches queue head", async () => {
    const write = vi.fn(async (_snapshot: { revision: number }) => undefined);
    let revision = 0;
    const store = new PluginDataStore({ snapshot: () => ({ revision }), write });
    const saved = store.save();
    revision = 1;
    await saved;
    expect(write).toHaveBeenCalledWith({ revision: 1 });
  });

  it("rejects the failed caller, invokes onError, and lets queued/future saves continue", async () => {
    const first = deferred();
    const error = new Error("partial disk write");
    const onError = vi.fn();
    let revision = 1;
    const writes: number[] = [];
    const store = new PluginDataStore({ snapshot: () => ({ revision }), onError, write: async (snapshot) => {
      writes.push(snapshot.revision);
      if (writes.length === 1) await first.promise;
    } });
    const failure = store.save();
    const assertion = expect(failure).rejects.toBe(error);
    await Promise.resolve();
    const queued = store.save();
    revision = 2;
    first.reject(error);
    await assertion;
    await queued;
    revision = 3;
    await store.save();
    expect(writes).toEqual([1, 2, 3]);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(store.requiresReload).toBe(true);
  });

  it("isolates snapshot and synchronous writer failures without masking them with onError", async () => {
    const snapshotError = new Error("snapshot failed");
    const writeError = new Error("sync write failed");
    let attempt = 0;
    const store = new PluginDataStore({
      snapshot: () => { if (++attempt === 1) throw snapshotError; return { attempt }; },
      write: (value) => { if (value.attempt === 2) throw writeError; return Promise.resolve(); },
      onError: () => { throw new Error("observer failed"); }
    });
    await expect(store.save()).rejects.toBe(snapshotError);
    await expect(store.save()).rejects.toBe(writeError);
    await expect(store.save()).resolves.toBeUndefined();
  });

  it("does not acknowledge an intent until the durable write resolves", async () => {
    const disk = deferred();
    const markdownWrite = vi.fn();
    const store = new PluginDataStore({ snapshot: () => ({ operations: ["applying"], receipts: [] }), write: () => disk.promise });
    const apply = store.save().then(markdownWrite);
    await Promise.resolve();
    expect(markdownWrite).not.toHaveBeenCalled();
    disk.resolve();
    await apply;
    expect(markdownWrite).toHaveBeenCalledOnce();
  });

  it("rejects oversized histories before calling the persistence writer", async () => {
    const write = vi.fn(async (_snapshot: { operations: string[]; receipts: unknown[] }) => undefined);
    const onError = vi.fn();
    const store = new PluginDataStore({ snapshot: () => ({ operations: ["x".repeat(OPERATION_HISTORY_BYTE_LIMIT)], receipts: [] }), write, onError });
    await expect(store.save()).rejects.toThrow("UTF-8 budget");
    expect(write).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("skips an invalidated queued refresh before mutation, snapshot or write", async () => {
    const gate = deferred();
    let current = true;
    let index = "old";
    const snapshot = vi.fn(() => ({ index }));
    const writes: string[] = [];
    const onError = vi.fn();
    const store = new PluginDataStore({ snapshot, onError, write: async (state) => {
      writes.push(state.index);
      if (writes.length === 1) await gate.promise;
    } });
    const first = store.save();
    await Promise.resolve();
    const beforeSnapshot = vi.fn(() => { if (!current) return false; index = "stale-refresh"; });
    const transform = vi.fn((data: { index: string }) => ({ ...data, index: "transformed" }));
    const stale = store.save(beforeSnapshot, transform);
    expect(beforeSnapshot).not.toHaveBeenCalled();
    current = false;
    gate.resolve();
    await Promise.all([first, stale]);
    expect(index).toBe("old");
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(transform).not.toHaveBeenCalled();
    expect(writes).toEqual(["old"]);
    await store.save(() => { index = "fresh"; });
    expect(writes).toEqual(["old", "fresh"]);
    expect(onError).not.toHaveBeenCalled();
    expect(store.requiresReload).toBe(false);
  });

  it("propagates beforeSnapshot failure without poisoning later saves", async () => {
    const error = new Error("validation failed");
    const snapshot = vi.fn(() => ({}));
    const onError = vi.fn();
    const store = new PluginDataStore({ snapshot, onError, write: async () => {} });
    await expect(store.save(() => { throw error; })).rejects.toBe(error);
    expect(snapshot).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    await expect(store.save()).resolves.toBeUndefined();
    expect(snapshot).toHaveBeenCalledOnce();
  });

  it("transforms a fresh detached snapshot at queue head without publishing index state", async () => {
    const gate = deferred();
    const state = { operations: [] as string[], tagIndex: { revision: 1 }, healthAiAnalysisCache: "old" as string | undefined };
    const writes: typeof state[] = [];
    const store = new PluginDataStore({ snapshot: () => state, write: async (data) => {
      writes.push(data);
      if (writes.length === 1) await gate.promise;
    } });
    const first = store.save();
    await Promise.resolve();
    const transform = vi.fn((data: typeof state) => {
      data.tagIndex.revision = 2;
      return { ...data, healthAiAnalysisCache: undefined };
    });
    const queued = store.save(() => true, transform);
    state.operations.push("applying");
    expect(transform).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([first, queued]);
    expect(transform).toHaveBeenCalledOnce();
    expect(writes[1]).toEqual({ operations: ["applying"], tagIndex: { revision: 2 }, healthAiAnalysisCache: undefined });
    expect(state).toEqual({ operations: ["applying"], tagIndex: { revision: 1 }, healthAiAnalysisCache: "old" });
    state.operations.push("later");
    expect(writes[1].operations).toEqual(["applying"]);
    await store.save();
    expect(writes[2]).toEqual(state);
  });

  it("does not transform an invalidated save", async () => {
    const snapshot = vi.fn(() => ({ revision: 1 }));
    const transform = vi.fn((data: { revision: number }) => ({ revision: data.revision + 1 }));
    const write = vi.fn(async (_data: { revision: number }) => {});
    const store = new PluginDataStore({ snapshot, write });
    await store.save(() => false, transform);
    expect(snapshot).not.toHaveBeenCalled();
    expect(transform).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(store.requiresReload).toBe(false);
  });

  it("checks the transformed history budget before writing", async () => {
    const state = { operations: [] as string[], receipts: [] as string[] };
    const write = vi.fn(async (_data: typeof state) => {});
    const store = new PluginDataStore({ snapshot: () => state, write });
    await expect(store.save(undefined, data => ({ ...data, operations: ["x".repeat(OPERATION_HISTORY_BYTE_LIMIT)] }))).rejects.toThrow("UTF-8 budget");
    expect(write).not.toHaveBeenCalled();
    expect(state.operations).toEqual([]);
    await store.save();
    expect(write).toHaveBeenCalledExactlyOnceWith(state);
    expect(store.requiresReload).toBe(true);
  });

  it("propagates transform failures and allows queued saves to continue", async () => {
    const state = { tagIndex: { revision: 1 } };
    const error = new Error("transform failed");
    const onError = vi.fn();
    const write = vi.fn(async (_data: typeof state) => {});
    const store = new PluginDataStore({ snapshot: () => state, write, onError });
    const failed = store.save(undefined, data => { data.tagIndex.revision = 99; throw error; });
    const assertion = expect(failed).rejects.toBe(error);
    const queued = store.save(undefined, data => ({ tagIndex: { revision: data.tagIndex.revision + 1 } }));
    await assertion;
    await queued;
    expect(state.tagIndex.revision).toBe(1);
    expect(write).toHaveBeenCalledExactlyOnceWith({ tagIndex: { revision: 2 } });
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(store.requiresReload).toBe(true);
  });
});
