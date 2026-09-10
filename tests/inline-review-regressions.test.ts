import { expect, it, vi } from "vitest";
import { buildInlineTagOccurrenceReadResult } from "../src/obsidian/InlineTagOccurrenceReader";
import { InlineTagWriter } from "../src/obsidian/InlineTagWriter";
import { FrontmatterWriter } from "../src/obsidian/FrontmatterWriter";
import { OperationLog, MutationInProgressError } from "../src/operations/OperationLog";
import { CleanupRecoveryService } from "../src/cleanup/CleanupRecoveryService";
import { CleanupExecutor } from "../src/cleanup/CleanupExecutor";
import { FolderBatchExecutor } from "../src/batch/FolderBatchExecutor";
import { FolderBatchRecoveryService } from "../src/batch/FolderBatchRecoveryService";
import type { SelectedCleanupPlan } from "../src/cleanup/CleanupReviewPlan";
import { hashContent } from "../src/utils/hashContent";
import { createFakeApp, createDeferred } from "./e2e/obsidian-harness";

it.each(["#old/nested", "#older", "#old_foo", "#old-foo", "#old中文", "#old𐐀", "word#old", "\\#old"])(
  "rejects stale cache ranges inside %s at both hydration and write time", async (content) => {
    const start = content.indexOf("#old"), end = start + 4;
    const cache = { tags: [{ tag: "#old", position: {
      start: { line: 0, col: start, offset: start }, end: { line: 0, col: end, offset: end }
    } }] };
    const read = await buildInlineTagOccurrenceReadResult("a.md", content, cache, ["old"]);
    expect(read.occurrences.length).toBeGreaterThan(0);
    expect(read.occurrences.every((o) => o.availability !== "trusted")).toBe(true);
    const app = createFakeApp([{ path: "a.md", content }]);
    await expect(new InlineTagWriter(app as never).apply(app.vault.getAbstractFileByPath("a.md") as never, {
      expectedContentHash: read.sourceContentHash, expectedBodyHash: read.bodyHash,
      edits: [{ occurrenceId: "one", beforeBodyStart: start, beforeBodyEnd: end,
        afterBodyStart: start, afterBodyEnd: end, beforeText: "#old", afterText: "#new" }]
    })).rejects.toMatchObject({ kind: "tokenChanged" });
    expect(app.vault.getNote("a.md").content).toBe(content);
    expect(app.vault.getProcessCount()).toBe(0);
  }
);

it("loads and round-trips a 0.1.2 recommendation without changing its undo tags", () => {
  const historical = { id: "legacy", plan: {
    notePath: "a.md", beforeTags: ["keep"], afterTags: ["keep", "old"], addedTags: ["old"],
    unchangedTags: ["keep"], skippedTags: [], createdAt: "2026-05-01"
  } };
  const log = new OperationLog([historical] as never);
  const loaded = new OperationLog(log.toJSON()).latestForPath("a.md")!;
  expect(loaded.plan).toMatchObject({ ...historical.plan, syncedInlineTags: [], aiAddedTags: ["old"] });
  loaded.plan.beforeTags.push("not-in-original");
  expect(historical.plan.beforeTags).toEqual(["keep"]);
});

it.each([false, true])("retains recovery evidence when undo deletion persistence fails (compensation fails: %s)", async (failCompensation) => {
  const f = await fixture();
  await f.executor.execute(f.plan, 20);
  let calls = 0;
  let persisted = f.log.toJSON();
  if (failCompensation) f.app.vault.setProcessInterceptor((_file, _content, count) => {
    if (count === 3) throw Error("compensation failed");
  });
  const service = new CleanupRecoveryService({ ...f.dependencies, persist: async () => {
    if (++calls === 2) throw Error("disk write failed");
    persisted = f.log.toJSON();
  } });
  const result = await service.undoLatestAppliedCleanup();
  expect(result.status).toBe(failCompensation ? "recoveryRequired" : "applied");
  expect(result.record?.id).toBe(f.log.latestCleanupV2()?.id);
  expect(persisted).toHaveLength(1);
  expect(new OperationLog(persisted).latestCleanupV2()?.status).toBe(result.status);
  expect(f.app.vault.getNote("a.md").content).toBe(failCompensation ? "#old" : "#new");
  expect(f.log.isMutationRunning).toBe(false);
  f.app.vault.setProcessInterceptor(null);
  if (failCompensation) {
    expect(result.record?.recoveryTarget).toBe("after");
    expect((await service.retryRecovery()).status).toBe("applied");
  }
  expect((await service.undoLatestAppliedCleanup()).status).toBe("removed");
  expect(f.app.vault.getNote("a.md").content).toBe("#old");
});

it("blocks a second cleanup and all transaction services while the first is still preflighting", async () => {
  const f = await fixture();
  const gate = createDeferred();
  const reached = createDeferred();
  const check = vi.spyOn(f.dependencies.frontmatterWriter, "checkSnapshot").mockImplementationOnce(async () => {
    reached.resolve();
    await gate.promise;
  });
  const running = f.executor.execute(f.plan, 20);
  await reached.promise;
  expect(f.log.latestUnresolvedMutation()).toBeUndefined();
  expect(f.log.isMutationRunning).toBe(true);
  const batchDependencies = { ...f.dependencies, writer: f.dependencies.frontmatterWriter };
  const cleanupRecovery = new CleanupRecoveryService(f.dependencies);
  const batchRecovery = new FolderBatchRecoveryService(batchDependencies);
  const rejected = [
    () => new CleanupExecutor(f.dependencies).execute(f.plan, 20),
    () => new FolderBatchExecutor(batchDependencies).execute({} as never, [], 20),
    () => cleanupRecovery.undoLatestAppliedCleanup(),
    () => cleanupRecovery.retryRecovery(),
    () => cleanupRecovery.reconcileInterruptedCleanup(),
    () => batchRecovery.undoLatestAppliedBatch(),
    () => batchRecovery.retryRecovery(),
    () => batchRecovery.reconcileInterruptedBatch(),
    () => f.log.runMutation(async () => { throw Error("must not enter recommendation writer"); })
  ];
  for (const run of rejected) await expect(run()).rejects.toBeInstanceOf(MutationInProgressError);
  expect(check).toHaveBeenCalledTimes(1);
  expect(f.log.toJSON()).toEqual([]);
  gate.resolve();
  expect((await running).status).toBe("applied");
  expect(f.app.vault.getNote("a.md").content).toBe("#new");
  expect(f.log.toJSON()).toHaveLength(1);
  expect(f.log.isMutationRunning).toBe(false);
  expect((await cleanupRecovery.undoLatestAppliedCleanup()).status).toBe("removed");
  await expect(f.log.runMutation(async () => { throw Error("failed"); })).rejects.toThrow("failed");
  await expect(f.log.runMutation(async () => "retry")).resolves.toBe("retry");
});

async function fixture() {
  const app = createFakeApp([{ path: "a.md", content: "#old", frontmatterTags: [] }]);
  const log = new OperationLog();
  const before = await hashContent("#old");
  const plan: SelectedCleanupPlan = {
    itemId: "one", title: "rename", action: "rename", sourceTags: ["old"], targetTag: "new",
    createdAt: "2026-09-10", fileCount: 1, frontmatterChangeCount: 0,
    inlineEditCount: 1, remainingSourceCount: 0, partial: false,
    files: [{ notePath: "a.md", sourceContentHash: before, beforeBodyHash: before, beforeTags: [], afterTags: [],
      inlineEdits: [{ occurrenceId: "one", beforeBodyStart: 0, beforeBodyEnd: 4,
        afterBodyStart: 0, afterBodyEnd: 4, beforeText: "#old", afterText: "#new" }] }]
  };
  const dependencies = {
    findFile: (p: string) => app.vault.getAbstractFileByPath(p) as never,
    inlineWriter: new InlineTagWriter(app as never), frontmatterWriter: new FrontmatterWriter(app as never),
    operationLog: log, persist: async () => {}, refreshIndex: async () => {}
  };
  return { app, log, plan, dependencies, executor: new CleanupExecutor(dependencies) };
}
