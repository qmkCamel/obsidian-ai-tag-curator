import { describe, expect, it, vi } from "vitest";
import { FolderBatchExecutor } from "../src/batch/FolderBatchExecutor";
import { createFolderBatchPlan } from "../src/batch/FolderBatchPlan";
import { FolderBatchRecoveryService } from "../src/batch/FolderBatchRecoveryService";
import { FrontmatterWriter } from "../src/obsidian/FrontmatterWriter";
import { captureTagValueSnapshot } from "../src/obsidian/TagValuePatch";
import { OperationLog } from "../src/operations/OperationLog";
import { projectOperationHistory } from "../src/operations/OperationHistory";
import { createChangePlan } from "../src/preview/ChangePlan";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";
import { hashContent } from "../src/utils/hashContent";
import { createFakeApp } from "./e2e/obsidian-harness";

const scopes = [["a.md"], ["a.md", "b.md"]];

describe("folder batch undo post-write rejection", () => {
  it.each(scopes.map(paths => [paths]))("compensates every attempted file in %j", async (paths) => {
    const h = await setup(paths);
    let rejected = false;
    const calls: string[] = [];
    vi.spyOn(h.writer, "replaceTagsIfSnapshotMatches").mockImplementation(async (file, snapshot, tags) => {
      calls.push(`${file.path}:${tags.includes("new") ? "after" : "before"}`);
      const change = await h.write(file, snapshot, tags);
      if (file.path === "a.md" && !rejected) {
        rejected = true;
        expect(change.afterContentHash).not.toBe(h.sourceHashes.get(file.path));
        throw new Error("write acknowledgement lost");
      }
      return change;
    });

    const result = await h.recovery.undoLatestAppliedBatch();
    expect(result).toMatchObject({ status: "applied", error: "write acknowledgement lost" });
    expect(calls).toEqual([
      ...[...paths].reverse().map(path => `${path}:before`),
      ...paths.map(path => `${path}:after`)
    ]);
    for (const path of paths) expect(h.app.vault.getNote(path).content).toBe(h.afterContents.get(path));
    expect(h.log.latestUnresolvedMutation()).toBeUndefined();
    expect(h.log.receiptsToJSON()).toEqual([]);
    expect(h.log.canUndo(h.recordId)).toBe(true);
    expect((await h.recovery.undoLatestAppliedBatch()).status).toBe("removed");
  });

  it.each(scopes.map(paths => [paths]))("keeps the recovery gate when compensation fails in %j", async (paths) => {
    const h = await setup(paths);
    vi.spyOn(h.writer, "replaceTagsIfSnapshotMatches").mockImplementation(async (file, snapshot, tags) => {
      if (file.path === "a.md" && tags.includes("new")) throw new Error("compensation failed");
      const change = await h.write(file, snapshot, tags);
      if (file.path === "a.md") throw new Error("write acknowledgement lost");
      return change;
    });

    const result = await h.recovery.undoLatestAppliedBatch();
    expect(result).toMatchObject({ status: "recoveryRequired", record: { recoveryTarget: "after" } });
    expect(result.record?.files.find(file => file.notePath === "a.md")?.recoveryState).toBe("before");
    for (const path of paths.filter(path => path !== "a.md")) {
      expect(h.app.vault.getNote(path).content).toBe(h.afterContents.get(path));
    }
    expect(h.log.canUndo(h.recordId)).toBe(false);
    expect(projectOperationHistory(h.log.toJSON(), h.log.receiptsToJSON())[0]).toMatchObject({ canUndo: false, canRecover: true });
    const content = h.app.vault.getNote("a.md").content;
    const freshPlan = createChangePlan({ notePath: "a.md", beforeTags: ["keepcase"],
      sourceContentHash: await hashContent(content), tagValueSnapshot: captureTagValueSnapshot(content), selectedAiTags: ["another"] });
    const writes = h.app.vault.getProcessCount();
    await expect(h.executor.execute(h.batch, [freshPlan], 20)).rejects.toThrow("Resolve the existing operation");
    expect(h.app.vault.getProcessCount()).toBe(writes);
    expect(h.persisted.at(-1)?.[0]).toMatchObject({ status: "recoveryRequired", recoveryTarget: "after" });

    const reloaded = new OperationLog(h.log.toJSON(), h.log.receiptsToJSON());
    const recovery = new FolderBatchRecoveryService({ ...h.dependencies, operationLog: reloaded, writer: new FrontmatterWriter(h.app as never) });
    expect((await recovery.retryRecovery()).status).toBe("applied");
    expect(reloaded.latestUnresolvedMutation()).toBeUndefined();
    for (const path of paths) expect(h.app.vault.getNote(path).content).toBe(h.afterContents.get(path));
  });

  it("does not rewrite an unchanged attempted file after a pre-write rejection", async () => {
    const h = await setup(["a.md", "b.md"]);
    const calls: string[] = [];
    vi.spyOn(h.writer, "replaceTagsIfSnapshotMatches").mockImplementation(async (file, snapshot, tags) => {
      calls.push(`${file.path}:${tags.includes("new") ? "after" : "before"}`);
      if (file.path === "a.md") throw new Error("pre-write failure");
      return h.write(file, snapshot, tags);
    });
    expect((await h.recovery.undoLatestAppliedBatch()).status).toBe("applied");
    expect(calls).toEqual(["b.md:before", "a.md:before", "b.md:after"]);
    for (const path of ["a.md", "b.md"]) expect(h.app.vault.getNote(path).content).toBe(h.afterContents.get(path));
  });

  it("preserves a third-state content change and keeps recovery blocked", async () => {
    const h = await setup(["a.md", "b.md"]);
    vi.spyOn(h.writer, "replaceTagsIfSnapshotMatches").mockImplementation(async (file, snapshot, tags) => {
      const change = await h.write(file, snapshot, tags);
      if (file.path === "a.md") {
        h.app.vault.getNote(file.path).content += "\nmanual edit";
        throw new Error("write acknowledgement lost");
      }
      return change;
    });
    const result = await h.recovery.undoLatestAppliedBatch();
    expect(result).toMatchObject({ status: "recoveryRequired", record: { recoveryTarget: "after" } });
    expect(result.record?.files.find(file => file.notePath === "a.md")?.recoveryState).toBe("conflict");
    expect(h.app.vault.getNote("a.md").content).toContain("manual edit");
    expect(captureTagValueSnapshot(h.app.vault.getNote("a.md").content)).toEqual({ kind: "list", values: ["KeepCase", "KeepCase"] });
    expect(h.app.vault.getNote("b.md").content).toBe(h.afterContents.get("b.md"));
    const writes = h.app.vault.getProcessCount();
    expect((await h.recovery.retryRecovery()).status).toBe("conflict");
    expect(h.app.vault.getProcessCount()).toBe(writes);
    expect(h.log.latestUnresolvedMutation()?.recoveryTarget).toBe("after");
  });
});

async function setup(paths: string[]) {
  const app = createFakeApp(paths.map(path => ({ path, content: '---\ntags: [KeepCase, KeepCase]\ntitle: Keep me\n---\nbody' })));
  const writer = new FrontmatterWriter(app as never);
  const log = new OperationLog();
  const persisted: ReturnType<OperationLog["toJSON"]>[] = [];
  const dependencies = {
    findFile: (path: string) => app.vault.getAbstractFileByPath(path) as never,
    writer, operationLog: log,
    persist: async () => { persisted.push(log.toJSON()); },
    refreshIndex: async () => {}
  };
  const plans = await Promise.all(paths.map(async notePath => {
    const content = app.vault.getNote(notePath).content;
    return createChangePlan({ notePath, beforeTags: ["keepcase"], sourceContentHash: await hashContent(content),
      tagValueSnapshot: captureTagValueSnapshot(content), selectedAiTags: ["new"] });
  }));
  const batch = createFolderBatchPlan({ folderPath: "", includeSubfolders: true, filePaths: paths,
    index: { updatedAt: "2026-09-14", tags: {} }, settings: DEFAULT_SETTINGS, uiLanguage: "en", policyRevision: 0 });
  const executor = new FolderBatchExecutor(dependencies);
  expect((await executor.execute(batch, plans, 20)).status).toBe("applied");
  return { app, writer, log, persisted, dependencies, batch, plans, executor,
    write: writer.replaceTagsIfSnapshotMatches.bind(writer),
    recovery: new FolderBatchRecoveryService(dependencies), recordId: log.latestBatch()!.id,
    sourceHashes: new Map(plans.map(plan => [plan.notePath, plan.sourceContentHash])),
    afterContents: new Map(paths.map(path => [path, app.vault.getNote(path).content])) };
}
