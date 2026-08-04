import { describe, expect, it } from "vitest";
import { createFakeApp, TFile } from "./e2e/obsidian-harness";
import { FolderBatchRecoveryService } from "../src/batch/FolderBatchRecoveryService";
import { FrontmatterWriter } from "../src/obsidian/FrontmatterWriter";
import { OperationLog, type BatchOperationRecord, type BatchOperationStatus } from "../src/operations/OperationLog";
import { createFolderBatchSettingsSnapshot } from "../src/batch/FolderBatchPlan";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";
import { hashContent } from "../src/utils/hashContent";

describe("FolderBatchRecoveryService", () => {
  it.each([
    ["applying", "before", "removed", undefined],
    ["applying", "after", "applied", undefined],
    ["applying", "mixed", "recoveryRequired", "before"],
    ["applying", "conflict", "recoveryRequired", "before"],
    ["undoing", "before", "removed", undefined],
    ["undoing", "after", "applied", undefined],
    ["undoing", "mixed", "recoveryRequired", "after"],
    ["undoing", "conflict", "recoveryRequired", "after"]
  ] as const)("reconciles %s with %s file states", async (status, state, expected, target) => {
    const fixture = await setup(status, state);
    const result = await fixture.service.reconcileInterruptedBatch();
    expect(result.status).toBe(expected);
    expect(result.record?.recoveryTarget).toBe(target);
  });

  it("retries only the persisted before target and performs zero writes on conflict", async () => {
    const fixture = await setup("applying", "mixed");
    await fixture.service.reconcileInterruptedBatch();
    const recovered = await fixture.service.retryRecovery();
    expect(recovered.status).toBe("removed");
    expect(fixture.app.getNoteTags("a.md")).toEqual(["before"]);
    expect(fixture.app.getNoteTags("b.md")).toEqual(["before"]);

    const conflictFixture = await setup("applying", "conflict");
    await conflictFixture.service.reconcileInterruptedBatch();
    const before = conflictFixture.app.getNoteTags("a.md");
    const conflict = await conflictFixture.service.retryRecovery();
    expect(conflict.status).toBe("conflict");
    expect(conflictFixture.app.getNoteTags("a.md")).toEqual(before);
  });

  it("retries the persisted after target and returns the record to applied", async () => {
    const fixture = await setup("undoing", "mixed");
    await fixture.service.reconcileInterruptedBatch();
    const result = await fixture.service.retryRecovery();
    expect(result.status).toBe("applied");
    expect(fixture.app.getNoteTags("a.md")).toEqual(["before", "after"]);
    expect(fixture.app.getNoteTags("b.md")).toEqual(["before", "after"]);
  });

  it("undoes an applied batch after full preflight and keeps zero writes on drift", async () => {
    const fixture = await setup("applied", "after");
    const result = await fixture.service.undoLatestAppliedBatch();
    expect(result.status).toBe("removed");
    expect(fixture.app.getNoteTags("a.md")).toEqual(["before"]);
    expect(fixture.app.getNoteTags("b.md")).toEqual(["before"]);

    const drift = await setup("applied", "after");
    drift.app.vault.getNote("b.md").frontmatterTags = ["manual"];
    const conflict = await drift.service.undoLatestAppliedBatch();
    expect(conflict.status).toBe("conflict");
    expect(drift.app.getNoteTags("a.md")).toEqual(["before", "after"]);
    expect(drift.log.latestBatch()?.status).toBe("applied");
  });

  it("restores applied status after undo compensation and fixes target=after when compensation fails", async () => {
    const compensated = await setup("applied", "after", { failUndoPath: "a.md" });
    const rolledBack = await compensated.service.undoLatestAppliedBatch();
    expect(rolledBack.status).toBe("applied");
    expect(compensated.app.getNoteTags("b.md")).toEqual(["before", "after"]);

    const incomplete = await setup("applied", "after", { failUndoPath: "a.md", failCompensationPath: "b.md" });
    const recovery = await incomplete.service.undoLatestAppliedBatch();
    expect(recovery.status).toBe("recoveryRequired");
    expect(recovery.record).toMatchObject({ recoveryTarget: "after", status: "recoveryRequired" });
  });
});

async function setup(
  status: BatchOperationStatus,
  state: "before" | "after" | "mixed" | "conflict",
  options: { failUndoPath?: string; failCompensationPath?: string } = {}
) {
  const tagsFor = (path: string) => {
    if (state === "before") return ["before"];
    if (state === "after") return ["before", "after"];
    if (state === "mixed") return path === "a.md" ? ["before"] : ["before", "after"];
    return path === "a.md" ? ["manual"] : ["before", "after"];
  };
  const app = createFakeApp([
    { path: "a.md", content: "body a", frontmatterTags: tagsFor("a.md") },
    { path: "b.md", content: "body b", frontmatterTags: tagsFor("b.md") }
  ]);
  const actualWriter = new FrontmatterWriter(app as never);
  const writer = {
    readCurrentTags: actualWriter.readCurrentTags.bind(actualWriter),
    readSnapshot: actualWriter.readSnapshot.bind(actualWriter),
    replaceTagsIfSnapshotMatches: async (file: any, snapshot: { beforeTags: string[]; sourceContentHash: string }, tags: string[]) => {
      const isUndo = tags.length === 1;
      if ((isUndo && file.path === options.failUndoPath) || (!isUndo && file.path === options.failCompensationPath)) {
        throw new Error(isUndo ? "undo failed" : "compensation failed");
      }
      return actualWriter.replaceTagsIfSnapshotMatches(file as never, snapshot, tags);
    }
  };
  const hashes = { a: await hashContent("body a"), b: await hashContent("body b") };
  const record: BatchOperationRecord = {
    id: "batch",
    type: "batch",
    status,
    folderPath: "",
    includeSubfolders: true,
    indexUpdatedAt: "2026-08-04T00:00:00.000Z",
    settings: createFolderBatchSettingsSnapshot(DEFAULT_SETTINGS, "en"),
    createdAt: "2026-08-04T00:00:00.000Z",
    files: ["a.md", "b.md"].map((path) => ({
      notePath: path,
      beforeTags: ["before"],
      afterTags: ["before", "after"],
      syncedInlineTags: ["after"],
      aiAddedTags: [],
      sourceContentHash: path === "a.md" ? hashes.a : hashes.b,
      afterContentHash: path === "a.md" ? hashes.a : hashes.b
    }))
  };
  const log = new OperationLog([record]);
  let refreshed = 0;
  const service = new FolderBatchRecoveryService({
    findFile: (path) => app.vault.getAbstractFileByPath(path) as never,
    writer,
    operationLog: log,
    persist: async () => undefined,
    refreshIndex: async () => {
      refreshed += 1;
    }
  });
  return { app, log, service, get refreshed() { return refreshed; } };
}
