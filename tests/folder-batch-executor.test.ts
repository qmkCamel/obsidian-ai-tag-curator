import { describe, expect, it } from "vitest";
import { createFakeApp, TFile } from "./e2e/obsidian-harness";
import { createFolderBatchPlan } from "../src/batch/FolderBatchPlan";
import { FolderBatchExecutor, validateFolderBatchChangePlans } from "../src/batch/FolderBatchExecutor";
import { FrontmatterWriter } from "../src/obsidian/FrontmatterWriter";
import { OperationLog } from "../src/operations/OperationLog";
import { createChangePlan } from "../src/preview/ChangePlan";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";
import { hashContent } from "../src/utils/hashContent";

describe("FolderBatchExecutor", () => {
  it("rejects unsafe plans and performs zero writes on full-preflight conflicts", async () => {
    const fixture = await setup();
    expect(() => validateFolderBatchChangePlans([])).toThrow(/at least one/);
    const unsafe = { ...fixture.plans[0], afterTags: ["added"] };
    expect(() => validateFolderBatchChangePlans([unsafe])).toThrow(/remove or replace/);

    fixture.app.vault.getNote("b.md").content = "changed";
    const result = await fixture.executor.execute(fixture.batch, fixture.plans, 20);
    expect(result).toMatchObject({ status: "conflict", conflicts: [{ notePath: "b.md", kind: "contentChanged" }] });
    expect(fixture.app.getNoteTags("a.md")).toEqual(["base"]);
    expect(fixture.app.getNoteTags("b.md")).toEqual(["base"]);
    expect(fixture.log.toJSON()).toEqual([]);
    expect(fixture.persisted).toBe(0);
  });

  it("reports tag drift during preflight and keeps every target unchanged", async () => {
    const fixture = await setup();
    fixture.app.vault.getNote("b.md").frontmatterTags = ["manual"];
    const result = await fixture.executor.execute(fixture.batch, fixture.plans, 20);
    expect(result).toMatchObject({ status: "conflict", conflicts: [{ notePath: "b.md", kind: "tagsChanged" }] });
    expect(fixture.app.getNoteTags("a.md")).toEqual(["base"]);
    expect(fixture.log.toJSON()).toEqual([]);
  });

  it("persists one intent, writes in path order, marks applied, and refreshes once", async () => {
    const fixture = await setup();
    const result = await fixture.executor.execute(fixture.batch, fixture.plans, 20);
    expect(result.status).toBe("applied");
    expect(fixture.app.getNoteTags("a.md")).toEqual(["base", "a"]);
    expect(fixture.app.getNoteTags("b.md")).toEqual(["base", "b"]);
    expect(fixture.log.latestBatch()).toMatchObject({ status: "applied" });
    expect(fixture.log.toJSON()).toHaveLength(1);
    expect(fixture.persisted).toBe(2);
    expect(fixture.refreshed).toBe(1);
  });

  it("compensates successful writes in reverse and removes the intent after a middle failure", async () => {
    const fixture = await setup({ failApplyPath: "b.md" });
    const result = await fixture.executor.execute(fixture.batch, fixture.plans, 20);
    expect(result.status).toBe("rolledBack");
    expect(fixture.app.getNoteTags("a.md")).toEqual(["base"]);
    expect(fixture.app.getNoteTags("b.md")).toEqual(["base"]);
    expect(fixture.log.toJSON()).toEqual([]);
  });

  it("detects a race after full preflight and compensates earlier writes", async () => {
    const fixture = await setup({ raceAfterPath: "a.md" });
    const result = await fixture.executor.execute(fixture.batch, fixture.plans, 20);
    expect(result.status).toBe("rolledBack");
    expect(fixture.app.getNoteTags("a.md")).toEqual(["base"]);
    expect(fixture.app.getNoteTags("b.md")).toEqual(["base"]);
  });

  it("persists target=before when compensation is incomplete", async () => {
    const fixture = await setup({ failApplyPath: "b.md", failCompensationPath: "a.md" });
    const result = await fixture.executor.execute(fixture.batch, fixture.plans, 20);
    expect(result.status).toBe("recoveryRequired");
    expect(fixture.log.latestUnresolvedBatch()).toMatchObject({
      status: "recoveryRequired",
      recoveryTarget: "before"
    });
    expect(fixture.log.latestUnresolvedBatch()?.files[0].recoveryState).toBe("after");
    expect(fixture.refreshed).toBe(1);
  });

  it("keeps the applied record when index refresh fails and reports the cache failure separately", async () => {
    const fixture = await setup({ failRefresh: true });
    const result = await fixture.executor.execute(fixture.batch, fixture.plans, 20);
    expect(result).toMatchObject({ status: "applied", indexRefreshError: "index failed" });
    expect(fixture.log.latestBatch()?.status).toBe("applied");
  });
});

async function setup(
  options: { failApplyPath?: string; failCompensationPath?: string; failRefresh?: boolean; raceAfterPath?: string } = {}
) {
  const app = createFakeApp([
    { path: "b.md", content: "body b", frontmatterTags: ["base"] },
    { path: "a.md", content: "body a", frontmatterTags: ["base"] }
  ]);
  const actualWriter = new FrontmatterWriter(app as never);
  const writer = {
    checkSnapshot: actualWriter.checkSnapshot.bind(actualWriter),
    readCurrentTags: actualWriter.readCurrentTags.bind(actualWriter),
    replaceTagsIfSnapshotMatches: async (file: any, snapshot: { beforeTags: string[]; sourceContentHash: string }, tags: string[]) => {
      const isCompensation = tags.length === 1;
      if ((!isCompensation && file.path === options.failApplyPath) || (isCompensation && file.path === options.failCompensationPath)) {
        throw new Error(isCompensation ? "compensation failed" : "write failed");
      }
      const change = await actualWriter.replaceTagsIfSnapshotMatches(file as never, snapshot, tags);
      if (!isCompensation && file.path === options.raceAfterPath) {
        app.vault.getNote("b.md").content = "raced body";
      }
      return change;
    }
  };
  const plans = [
    createChangePlan({
      notePath: "b.md",
      beforeTags: ["base"],
      sourceContentHash: await hashContent("body b"),
      selectedAiTags: ["b"]
    }),
    createChangePlan({
      notePath: "a.md",
      beforeTags: ["base"],
      sourceContentHash: await hashContent("body a"),
      selectedInlineTags: ["a"]
    })
  ];
  const batch = createFolderBatchPlan({
    folderPath: "",
    includeSubfolders: true,
    filePaths: plans.map((plan) => plan.notePath),
    index: { updatedAt: "2026-08-04T00:00:00.000Z", tags: {} },
    settings: DEFAULT_SETTINGS,
    uiLanguage: "en",
    randomId: "batch"
  });
  const log = new OperationLog();
  const counters = { persisted: 0, refreshed: 0 };
  const executor = new FolderBatchExecutor({
    findFile: (path) => app.vault.getAbstractFileByPath(path) as never,
    writer,
    operationLog: log,
    persist: async () => {
      counters.persisted += 1;
    },
    refreshIndex: async () => {
      counters.refreshed += 1;
      if (options.failRefresh) {
        throw new Error("index failed");
      }
    }
  });
  return {
    app,
    plans,
    batch,
    log,
    executor,
    get persisted() {
      return counters.persisted;
    },
    get refreshed() {
      return counters.refreshed;
    }
  };
}
