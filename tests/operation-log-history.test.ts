import { describe, expect, it, vi } from "vitest";
import {
  OperationLog, OperationLogCapacityError, OPERATION_HISTORY_BYTE_LIMIT, operationHistoryBytes,
  isRecommendationRecord, isCleanupV2Record, isBatchRecord, validateOperationRecords,
  type CleanupOperationRecordV2, type BatchOperationRecord, type LegacyCleanupOperationRecord
} from "../src/operations/OperationLog";
import { projectOperationHistory, type HistoryReceipt } from "../src/operations/OperationHistory";
import type { ChangePlan } from "../src/preview/ChangePlan";
import type { ReviewContext } from "../src/management/ManualTagIntent";
import { createFolderBatchSettingsSnapshot } from "../src/batch/FolderBatchPlan";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";

function plan(notePath = "note.md"): ChangePlan {
  return { notePath, beforeTags: ["old"], afterTags: ["new"], addedTags: ["new"],
    syncedInlineTags: [], aiAddedTags: ["new"], unchangedTags: [], skippedTags: [],
    sourceContentHash: "hash", createdAt: "2026-01-01T00:00:00Z" };
}

function cleanup(id = "cleanup", status: CleanupOperationRecordV2["status"] = "applied"): CleanupOperationRecordV2 {
  return { id, type: "cleanup", schemaVersion: 2, status, itemId: "item", title: "Rename", action: "rename",
    sourceTags: ["old"], targetTag: "new", partial: false, createdAt: "2026-01-02T00:00:00Z",
    files: [{ notePath: "cleanup.md", beforeTags: ["old"], afterTags: ["new"], sourceContentHash: "full",
      beforeBodyHash: "before", afterBodyHash: "after", inlineEdits: [{ occurrenceId: "occurrence", beforeText: "#old", afterText: "#new",
        beforeBodyStart: 0, beforeBodyEnd: 4, afterBodyStart: 0, afterBodyEnd: 4 }] }] };
}

function batch(id = "batch", status: BatchOperationRecord["status"] = "applied"): BatchOperationRecord {
  return { id, type: "batch", status, folderPath: "", includeSubfolders: true, indexUpdatedAt: "index-time",
    settings: createFolderBatchSettingsSnapshot(DEFAULT_SETTINGS, "en"), createdAt: "2026-01-03T00:00:00Z",
    files: [{ ...plan("batch.md") }] };
}

function legacy(): LegacyCleanupOperationRecord {
  return { id: "legacy", type: "cleanup", itemId: "old", title: "Old", action: "deprecate", createdAt: "", files: [] };
}

function receipt(sequence = 1): HistoryReceipt {
  return { id: `receipt:${sequence}`, operationId: `done:${sequence}`, sequence, completedAt: "2026-02-01T00:00:00Z",
    origin: "health", action: "rename", status: "undone", files: [] };
}

describe("operation log validation and preservation", () => {
  it.each([
    null, false, 0, "corrupt", {}, { operations: [], future: { evidence: ["keep"] } }, [{ id: "future", type: "future", plan: plan() }],
    [{ ...cleanup(), schemaVersion: 3 }], [{ ...cleanup(), files: [null] }],
    [{ ...cleanup(), status: "surprise" }], [{ ...batch(), schemaVersion: 2 }],
    [{ id: "bad", plan: { ...plan(), beforeTags: null } }], [{ ...cleanup(), tagValueVersion: 2 }],
    [{ ...cleanup(), files: [{ ...cleanup().files[0], inlineEdits: [{}] }] }]
  ])("preserves invalid loaded data before explicit validation (%#)", (raw) => {
    const before = JSON.stringify(raw);
    const log = new OperationLog(raw);
    expect(log.validate().length).toBeGreaterThan(0);
    expect(validateOperationRecords(raw).length).toBeGreaterThan(0);
    expect(JSON.stringify(log.toJSON())).toBe(before);
    expect(() => projectOperationHistory(log.toJSON(), [])).not.toThrow();
    const rows = projectOperationHistory(log.toJSON(), []);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => !row.canUndo && !row.canRecover && row.unavailableReason === "invalidHistory")).toBe(true);
    expect(() => log.add(plan(), 10)).toThrow();
    expect(JSON.stringify(log.toJSON())).toBe(before);
  });

  it("explicit guards do not reinterpret an unknown type or schema as recommendation", () => {
    expect(isRecommendationRecord({ id: "future", type: "future", plan: plan() })).toBe(false);
    expect(isRecommendationRecord({ id: "future", schemaVersion: 99, plan: plan() })).toBe(false);
    expect(isCleanupV2Record({ ...cleanup(), schemaVersion: 99 })).toBe(false);
    expect(isBatchRecord({ ...batch(), status: "unknown" })).toBe(false);
  });

  it("retains and blocks multiple unresolved records without selecting one for mutation", async () => {
    const records = [cleanup("a", "applying"), batch("b", "undoing")];
    const log = new OperationLog(records);
    const action = vi.fn();
    await expect(log.runMutation(action)).rejects.toThrow("Multiple unresolved");
    expect(action).not.toHaveBeenCalled();
    log.enforceRetention(0);
    expect(log.toJSON()).toHaveLength(2);
    expect(projectOperationHistory(log.toJSON()).every((row) => !row.canUndo && !row.canRecover)).toBe(true);
  });

  it("preserves invalid receipt containers and unknown entries", () => {
    for (const receipts of [null, { newer: true }, [{ newer: true }]]) {
      const log = new OperationLog([], receipts);
      expect(log.validate().length).toBeGreaterThan(0);
      expect(log.receiptsToJSON()).toEqual(receipts);
      expect(projectOperationHistory([cleanup()], receipts).every(row => !row.canUndo && !row.canRecover)).toBe(true);
    }
  });

  it("rejects duplicate operation ids", () => {
    expect(new OperationLog([cleanup(), cleanup()]).validate().join()).toContain("Duplicate");
  });
});

describe("operation history projection and eligibility", () => {
  it("uses array position across types, never id or timestamp order", () => {
    const records = [{ id: "1", plan: plan() }, cleanup("9999999"), batch(), legacy()];
    const log = new OperationLog(records);
    const rows = projectOperationHistory(records);
    expect(rows.map((row) => row.operationId)).toEqual(records.map((record) => record.id));
    expect(rows.map((row) => row.origin)).toEqual(["recommendation", "health", "batch", "health"]);
    expect(rows[0]).toMatchObject({ canUndo: true, createdAt: plan().createdAt });
    expect(rows.filter((row) => row.origin === "health").every((row) => !row.canUndo)).toBe(true);
    expect(log.latest()?.id).toBe("1");
    expect(log.canUndo("9999999")).toBe(false);
    log.remove("1");
    expect(log.canUndo("9999999")).toBe(true);
  });

  it("stops at legacy cleanup and does not infer missing time or model", () => {
    const log = new OperationLog([legacy(), { id: "old", plan: { ...plan(), createdAt: undefined } }]);
    const rows = projectOperationHistory(log.toJSON());
    expect(rows[0]).toMatchObject({ canUndo: false, legacy: true, unavailableReason: "legacyReadOnly" });
    expect(rows.every((row) => row.createdAt === undefined && row.model === undefined)).toBe(true);
    expect(log.canUndo("old")).toBe(false);
  });

  it("only projects recorded models and manual origin; default V2 is health", () => {
    const rows = projectOperationHistory([{ ...cleanup(), origin: "manual" }, batch()]);
    expect(rows[0].origin).toBe("manual");
    expect(rows[0].model).toBeUndefined();
    expect(rows[1].model).toBe(DEFAULT_SETTINGS.model);
  });

  it("keeps recommendation provenance on a single-file batch transaction and receipt", () => {
    const log = new OperationLog();
    const intent = log.addBatchIntent({ ...batch(), origin: "recommendation", policyRevision: 4 }, 10);
    expect(log.latestBatch()).toMatchObject({ type: "batch", origin: "recommendation", policyRevision: 4 });
    expect(projectOperationHistory(log.toJSON())[0].origin).toBe("recommendation");
    log.finalize(intent.id, { status: "rolledBack" });
    expect(log.receiptsToJSON()[0].origin).toBe("recommendation");
  });

  it("pins the unresolved row and blocks normal undo everywhere", () => {
    const rows = projectOperationHistory([{ id: "newer", plan: plan() }, cleanup("pending", "undoing")]);
    expect(rows[0]).toMatchObject({ operationId: "pending", canRecover: true, canUndo: false });
    expect(rows.every((row) => !row.canUndo)).toBe(true);
  });

  it("does not mutate input and detaches output raw values", () => {
    const record = cleanup();
    record.files[0].tagValuePatch = { before: { kind: "list", values: ["KeepCase", "old"] }, after: { kind: "list", values: ["KeepCase", "new"] } };
    const original = JSON.stringify(record);
    const rows = projectOperationHistory([record]);
    rows[0].files[0].beforeTags.push("changed");
    const patch = rows[0].files[0].tagValuePatch!;
    if (patch.before.kind === "list") patch.before.values.push("changed");
    expect(JSON.stringify(record)).toBe(original);
    expect(JSON.stringify(rows)).not.toContain("inlineEdits");
  });
});

describe("history finalization", () => {
  it("retains only inline token differences across projection, finalization and reload", () => {
    const record = cleanup();
    record.files[0].beforeTags = [];
    record.files[0].afterTags = [];
    const expected = [{ before: "#old", after: "#new" }];
    const active = projectOperationHistory([record]);
    expect(active[0].files[0].inlineChanges).toEqual(expected);
    active[0].files[0].inlineChanges![0].before = "changed";
    const log = new OperationLog([record]);
    const finalized = log.finalize(record.id)!;
    expect(finalized.files[0].inlineChanges).toEqual(expected);
    finalized.files[0].inlineChanges![0].after = "changed";
    const reloaded = new OperationLog(log.toJSON(), log.receiptsToJSON());
    expect(reloaded.validate()).toEqual([]);
    const rows = projectOperationHistory(reloaded.toJSON(), reloaded.receiptsToJSON());
    expect(rows[0].files[0].inlineChanges).toEqual(expected);
    rows[0].files[0].inlineChanges!.push({ before: "extra", after: "extra" });
    expect(reloaded.receiptsToJSON()[0].files[0].inlineChanges).toEqual(expected);
    expect(JSON.stringify(reloaded.receiptsToJSON())).not.toMatch(/inlineEdits|occurrenceId|BodyStart|BodyEnd|beforeText|sourceContentHash|context/);
  });

  it("accepts legacy receipts without inline changes and allowlists projected token differences", () => {
    const oldReceipt = { ...receipt(), files: [{ notePath: "a.md", beforeTags: [], afterTags: [] }] };
    expect(new OperationLog([], [oldReceipt]).validate()).toEqual([]);
    expect(projectOperationHistory([], [oldReceipt])[0].files[0]).not.toHaveProperty("inlineChanges");
    const richReceipt = { ...oldReceipt, files: [{ ...oldReceipt.files[0], inlineChanges: [{ before: "#Old", after: "#New", context: "private body", beforeBodyStart: 100 }] }] };
    expect(projectOperationHistory([], [richReceipt])[0].files[0].inlineChanges).toEqual([{ before: "#Old", after: "#New" }]);
  });

  it.each([null, "invalid", [null], [{ before: "#old" }], [{ before: 1, after: "#new" }]])("preserves invalid inline receipt differences as read-only (%#)", inlineChanges => {
    const receipts = [{ ...receipt(), files: [{ notePath: "a.md", beforeTags: [], afterTags: [], inlineChanges }] }];
    const log = new OperationLog([cleanup()], receipts);
    expect(log.validate().join()).toContain("receipt");
    expect(log.receiptsToJSON()).toEqual(receipts);
    expect(projectOperationHistory(log.toJSON(), log.receiptsToJSON()).every(row => !row.canUndo && !row.canRecover)).toBe(true);
    expect(() => log.finalize("cleanup")).toThrow();
    expect(log.receiptsToJSON()).toEqual(receipts);
  });

  it.each([
    ["applying", undefined, "rolledBack"], ["undoing", undefined, "undone"],
    ["recoveryRequired", "before", "rolledBack"], ["applied", undefined, "undone"]
  ] as const)("finalizes %s/%s as %s on normal and reload paths", (status, recoveryTarget, expected) => {
    const record = { ...cleanup("id", status), recoveryTarget };
    const log = new OperationLog([record]);
    log.remove(record.id);
    expect(log.toJSON()).toEqual([]);
    expect(log.receiptsToJSON()[0]).toMatchObject({ operationId: "id", status: expected, sequence: 1 });
    const reloaded = new OperationLog(log.toJSON(), log.receiptsToJSON());
    expect(projectOperationHistory(reloaded.toJSON(), reloaded.receiptsToJSON())[0]).toMatchObject({ status: expected, canUndo: false });
  });

  it("allows explicit rollback after applied persistence fails and strips recovery-only data", async () => {
    const record = cleanup();
    const log = new OperationLog([record]);
    const writes: unknown[] = [];
    await log.removeAndPersist(record.id, async () => { writes.push({ operations: log.toJSON(), receipts: log.receiptsToJSON() }); }, { status: "rolledBack" });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ operations: [], receipts: [{ status: "rolledBack" }] });
    expect(JSON.stringify(writes)).not.toMatch(/inlineEdits|beforeText|beforeBodyHash|sourceContentHash|context/);
  });

  it("deduplicates finalization and active/receipt projection by operationId", () => {
    const log = new OperationLog([cleanup()]);
    const summary = log.finalize("cleanup")!;
    log.finalize("cleanup");
    expect(log.receiptsToJSON()).toHaveLength(1);
    expect(projectOperationHistory([cleanup()], [summary, summary])).toHaveLength(1);
    expect(projectOperationHistory([], [summary, summary])).toHaveLength(1);
  });

  it("preserves original order across undo, new operations, and reload", () => {
    const log = new OperationLog([{ id: "newer", plan: plan() }, cleanup("older")]);
    log.remove("newer");
    log.remove("older");
    const added = log.add(plan("new.md"), 10);
    const reloaded = new OperationLog(log.toJSON(), log.receiptsToJSON());
    expect(projectOperationHistory(reloaded.toJSON(), reloaded.receiptsToJSON()).map((row) => row.operationId)).toEqual([added.id, "newer", "older"]);
    expect(reloaded.canUndo(added.id)).toBe(true);
  });

  it("restores active position and receipts on failed persistence and keeps a sticky gate", async () => {
    const log = new OperationLog([cleanup("latest", "undoing"), { id: "older", plan: plan() }], [receipt()]);
    const before = log.toJSON();
    const summaries = log.receiptsToJSON();
    await expect(log.removeAndPersist("latest", async () => { throw new Error("uncertain save"); })).rejects.toThrow("uncertain save");
    expect(log.toJSON()).toEqual(before);
    expect(log.receiptsToJSON()).toEqual(summaries);
    expect(log.validate().join()).toContain("reload");
    expect(() => log.add(plan(), 10)).toThrow("reload");
    expect(new OperationLog(log.toJSON(), log.receiptsToJSON()).validate()).toEqual([]);
  });
});

describe("history retention and raw clones", () => {
  it("pins unknown and every unresolved record when limits shrink", () => {
    const unknown = { id: "future", type: "future", evidence: ["keep"] };
    const log = new OperationLog([cleanup("a", "applying"), batch("b", "recoveryRequired"), unknown, cleanup("done")]);
    log.enforceRetention(0);
    expect(log.toJSON().map((record) => record.id)).toEqual(["a", "b", "future"]);
    expect(log.toJSON()[2]).toEqual(unknown);
  });

  it("retains an applying intent in addition to the completed-record limit", () => {
    const log = new OperationLog([{ id: "done", plan: plan() }]);
    const input = cleanup();
    const intent = log.addCleanupIntent(input, 1);
    expect(log.toJSON().map((record) => record.id)).toEqual([intent.id, "done"]);
    log.enforceRetention(0);
    expect(log.toJSON()).toHaveLength(1);
    expect(log.toJSON()[0].id).toBe(intent.id);
  });

  it("blocks a second intent without evicting the unresolved one", () => {
    const log = new OperationLog([cleanup("pending", "applying")]);
    expect(() => log.addBatchIntent(batch(), 0)).toThrow("Resolve the existing operation");
    expect(log.toJSON().map((record) => record.id)).toEqual(["pending"]);
  });

  it("applies the completed limit when an intent becomes applied", () => {
    const log = new OperationLog([cleanup("old")]);
    const intent = log.addBatchIntent(batch(), 1);
    expect(log.toJSON()).toHaveLength(2);
    log.updateBatchStatus(intent.id, "applied");
    expect(log.toJSON().map((record) => record.id)).toEqual([intent.id]);
  });

  it("keeps only the latest 100 receipt sequences", () => {
    const log = new OperationLog([], Array.from({ length: 105 }, (_, index) => receipt(index + 1)));
    log.enforceRetention(0);
    expect(log.receiptsToJSON()).toHaveLength(100);
    expect(log.receiptsToJSON()[0].sequence).toBe(105);
    expect(log.receiptsToJSON().at(-1)?.sequence).toBe(6);
  });

  it("measures UTF-8 bytes and blocks an oversized new intent without changing old history", () => {
    const log = new OperationLog([{ id: "old", plan: plan() }], [receipt()]);
    const input = cleanup();
    input.files[0].beforeTags = ["\u4e2d".repeat(Math.ceil(OPERATION_HISTORY_BYTE_LIMIT / 3))];
    const before = log.toJSON();
    expect(() => log.addCleanupIntent(input, 10)).toThrow(OperationLogCapacityError);
    expect(log.toJSON()).toEqual(before);
    expect(log.receiptsToJSON()).toEqual([receipt()]);
    expect(operationHistoryBytes(["\u4e2d"], [])).toBe(Buffer.byteLength(JSON.stringify({ operations: ["\u4e2d"], receipts: [] }), "utf8"));
  });

  it("drops oldest receipts before completed records to meet the hard budget", () => {
    const large = receipt();
    large.files = [{ notePath: "old.md", beforeTags: ["x".repeat(OPERATION_HISTORY_BYTE_LIMIT)], afterTags: [] }];
    const log = new OperationLog([cleanup("done")], [large]);
    log.enforceRetention(10);
    expect(log.receiptsToJSON()).toEqual([]);
    expect(log.toJSON()[0].id).toBe("done");
    expect(log.serializedBytes()).toBeLessThanOrEqual(OPERATION_HISTORY_BYTE_LIMIT);
  });

  it("drops oldest completed records, but never unknown or unresolved oversized evidence", () => {
    const huge = cleanup("huge");
    huge.files[0].beforeTags = ["x".repeat(OPERATION_HISTORY_BYTE_LIMIT)];
    const log = new OperationLog([cleanup("new"), huge]);
    log.enforceRetention(10);
    expect(log.toJSON().map((record) => record.id)).toEqual(["new"]);
    const pending = new OperationLog([{ ...huge, status: "applying" }]);
    expect(() => pending.enforceRetention(0)).toThrow(OperationLogCapacityError);
    expect(pending.toJSON()).toHaveLength(1);
    const unknown = new OperationLog([{ id: "future", schemaVersion: 99, data: huge }]);
    expect(() => unknown.enforceRetention(0)).toThrow(OperationLogCapacityError);
    expect(unknown.toJSON()).toHaveLength(1);
  });

  it("deep clones context, record/file raw patches, settings and all public outputs", () => {
    const context: ReviewContext = { origin: "manual", indexRevision: 1, vaultRevision: 2, policyRevision: 3,
      scope: { include: [{ path: "notes", recursive: true }] }, candidatePaths: ["notes/a.md"] };
    const patch = { before: { kind: "list" as const, values: ["Old", "Keep"] }, after: { kind: "list" as const, values: ["New", "Keep"] } };
    const input = { ...cleanup(), origin: "manual" as const, context, tagValueVersion: 1 as const, tagValuePatch: patch,
      files: [{ ...cleanup().files[0], tagValueVersion: 1 as const, tagValuePatch: patch }] };
    const log = new OperationLog();
    const inserted = log.addCleanupIntent(input, 10);
    context.scope.include[0].path = "mutated";
    patch.before.values.push("mutated");
    inserted.context!.candidatePaths.push("mutated");
    const latest = log.latestCleanupV2()!;
    expect(latest.context!.scope.include[0].path).toBe("notes");
    expect(latest.context!.candidatePaths).toEqual(["notes/a.md"]);
    expect(latest.tagValuePatch!.before).toEqual({ kind: "list", values: ["Old", "Keep"] });
    expect(latest.files[0].tagValuePatch!.before).toEqual({ kind: "list", values: ["Old", "Keep"] });
    const update = latest.files;
    log.updateCleanupFiles(inserted.id, update);
    update[0].tagValuePatch!.after = { kind: "absent" };
    expect(log.latestCleanupV2()!.files[0].tagValuePatch!.after.kind).toBe("list");
    const log2 = new OperationLog([batch()]);
    log2.latestBatch()!.settings.model = "mutated";
    expect(log2.latestBatch()!.settings.model).toBe(DEFAULT_SETTINGS.model);
  });

  it("allowlists new record payloads without dropping loaded unknown evidence", () => {
    const log = new OperationLog();
    const input = { ...cleanup(), content: "full markdown", search: "secret query", providerResponse: "secret response",
      files: [{ ...cleanup().files[0], content: "full markdown" }] };
    log.addCleanupIntent(input, 10);
    expect(JSON.stringify(log.toJSON())).not.toMatch(/full markdown|secret query|secret response/);
    const batchInput = { ...batch(), settings: { ...batch().settings, apiKey: "secret-key" } };
    const other = new OperationLog();
    other.addBatchIntent(batchInput, 10);
    expect(JSON.stringify(other.toJSON())).not.toContain("secret-key");
  });
});
