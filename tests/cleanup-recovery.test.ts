import { describe, expect, it } from "vitest";
import { createInlineTextEdits, type CleanupReviewOccurrence } from "../src/cleanup/CleanupReviewPlan";
import { CleanupRecoveryService } from "../src/cleanup/CleanupRecoveryService";
import { FrontmatterWriter } from "../src/obsidian/FrontmatterWriter";
import { InlineTagWriter } from "../src/obsidian/InlineTagWriter";
import {
  OperationLog,
  type CleanupFileChangeV2,
  type CleanupOperationRecordV2,
  type CleanupOperationStatus
} from "../src/operations/OperationLog";
import { hashContent } from "../src/utils/hashContent";
import { createFakeApp } from "./e2e/obsidian-harness";

describe("CleanupRecoveryService", () => {
  it.each([
    ["applying", "before", "removed", undefined],
    ["applying", "after", "applied", undefined],
    ["applying", "bodyChanged", "recoveryRequired", "before"],
    ["applying", "mixed", "recoveryRequired", "before"],
    ["applying", "conflict", "recoveryRequired", "before"],
    ["applying", "missing", "recoveryRequired", "before"],
    ["undoing", "before", "removed", undefined],
    ["undoing", "after", "applied", undefined],
    ["undoing", "bodyChanged", "recoveryRequired", "after"],
    ["undoing", "mixed", "recoveryRequired", "after"],
    ["undoing", "conflict", "recoveryRequired", "after"],
    ["undoing", "missing", "recoveryRequired", "after"]
  ] as const)("reconciles %s with %s state", async (status, state, expected, target) => {
    const fixture = await setup(status, state);
    const result = await fixture.service.reconcileInterruptedCleanup();
    expect(result.status).toBe(expected);
    expect(result.record?.recoveryTarget).toBe(target);
  });

  it("retries a fixed before target through frontmatter then inline and removes the record", async () => {
    const fixture = await setup("applying", "mixed");
    await fixture.service.reconcileInterruptedCleanup();
    const result = await fixture.service.retryRecovery();

    expect(result.status).toBe("removed");
    expect(fixture.app.getNoteTags("a.md")).toEqual(["old"]);
    expect(fixture.app.getNoteTags("b.md")).toEqual(["old"]);
    expect(fixture.app.vault.getNote("a.md").content).toBe("#old");
    expect(fixture.app.vault.getNote("b.md").content).toBe("#old");
    expect(fixture.log.latestCleanupV2()).toBeUndefined();
  });

  it("retries a fixed after target and returns the same record to applied", async () => {
    const fixture = await setup("undoing", "mixed");
    await fixture.service.reconcileInterruptedCleanup();
    const recordId = fixture.log.latestUnresolvedCleanup()!.id;
    const result = await fixture.service.retryRecovery();

    expect(result.status).toBe("applied");
    expect(result.record?.id).toBe(recordId);
    expect(fixture.app.getNoteTags("a.md")).toEqual(["new"]);
    expect(fixture.app.getNoteTags("b.md")).toEqual(["new"]);
    expect(fixture.app.vault.getNote("a.md").content).toBe("#new");
  });

  it("performs zero writes on missing or conflict and never switches the persisted target", async () => {
    for (const state of ["conflict", "missing"] as const) {
      const fixture = await setup("applying", state);
      await fixture.service.reconcileInterruptedCleanup();
      const target = fixture.log.latestUnresolvedCleanup()!.recoveryTarget;
      const processBefore = fixture.app.vault.getProcessCount();
      const frontmatterBefore = fixture.app.fileManager.getWriteCount();
      const result = await fixture.service.retryRecovery();
      expect(result.status).toBe("conflict");
      expect(result.record?.recoveryTarget).toBe(target);
      expect(fixture.app.vault.getProcessCount()).toBe(processBefore);
      expect(fixture.app.fileManager.getWriteCount()).toBe(frontmatterBefore);
    }
  });

  it("undoes applied mixed cleanup while preserving unrelated frontmatter properties", async () => {
    const fixture = await setup("applied", "after");
    fixture.app.vault.getNote("a.md").frontmatter.owner = "keep";
    const result = await fixture.service.undoLatestAppliedCleanup();

    expect(result.status).toBe("removed");
    expect(fixture.app.getNoteTags("a.md")).toEqual(["old"]);
    expect(fixture.app.vault.getNote("a.md").content).toBe("#old");
    expect(fixture.app.vault.getNote("a.md").frontmatter).toEqual({ owner: "keep" });
  });

  it("rejects undo on body, tag, or missing drift before persisting undoing", async () => {
    for (const state of ["conflict", "missing", "bodyChanged"] as const) {
      const fixture = await setup("applied", state);
      const persistedBefore = fixture.persisted;
      const result = await fixture.service.undoLatestAppliedCleanup();
      expect(result.status).toBe("conflict");
      expect(fixture.log.latestCleanupV2()?.status).toBe("applied");
      expect(fixture.persisted).toBe(persistedBefore);
    }
  });

  it("compensates a failed undo back to applied and fixes target=after if compensation fails", async () => {
    const compensated = await setup("applied", "after", { failReversePath: "a.md" });
    const applied = await compensated.service.undoLatestAppliedCleanup();
    expect(applied.status).toBe("applied");
    expect(compensated.log.latestCleanupV2()?.status).toBe("applied");
    expect(compensated.app.vault.getNote("b.md").content).toBe("#new");

    const incomplete = await setup("applied", "after", {
      failReversePath: "a.md",
      failForwardPath: "b.md"
    });
    const recovery = await incomplete.service.undoLatestAppliedCleanup();
    expect(recovery.status).toBe("recoveryRequired");
    expect(recovery.record).toMatchObject({ status: "recoveryRequired", recoveryTarget: "after" });
  });

  it("keeps a pre-existing recoveryRequired target unchanged during reconciliation", async () => {
    const fixture = await setup("recoveryRequired", "bodyChanged", { recoveryTarget: "after" });
    const result = await fixture.service.reconcileInterruptedCleanup();
    expect(result).toMatchObject({ status: "recoveryRequired", record: { recoveryTarget: "after" } });
    expect(fixture.persisted).toBe(0);
  });
});

type State = "before" | "bodyChanged" | "after" | "mixed" | "conflict" | "missing";

async function setup(
  status: CleanupOperationStatus,
  state: State,
  options: {
    failReversePath?: string;
    failForwardPath?: string;
    recoveryTarget?: "before" | "after";
  } = {}
) {
  const stateFor = (path: string): Exclude<State, "mixed"> => {
    if (state !== "mixed") return state;
    return path === "a.md" ? "bodyChanged" : "after";
  };
  const specs = ["a.md", "b.md"].map((path) => {
    const fileState = stateFor(path);
    return {
      path,
      content: fileState === "before" ? "#old" : fileState === "conflict" ? "#manual" : "#new",
      frontmatterTags:
        fileState === "before" || fileState === "bodyChanged"
          ? ["old"]
          : fileState === "conflict"
            ? ["manual"]
            : ["new"]
    };
  });
  const app = createFakeApp(specs);
  const changes = await Promise.all(["a.md", "b.md"].map(cleanupFile));
  const record: CleanupOperationRecordV2 = {
    id: "cleanup-v2",
    type: "cleanup",
    schemaVersion: 2,
    status,
    recoveryTarget: options.recoveryTarget,
    itemId: "rename-old",
    title: "Rename old",
    action: "rename",
    sourceTags: ["old"],
    targetTag: "new",
    partial: false,
    createdAt: "2026-08-04T00:00:00.000Z",
    files: changes
  };
  const log = new OperationLog([record]);
  const actualInlineWriter = new InlineTagWriter(app as never);
  const actualFrontmatterWriter = new FrontmatterWriter(app as never);
  const inlineWriter = {
    readSnapshot: actualInlineWriter.readSnapshot.bind(actualInlineWriter),
    apply: async (file: any, patch: any) => {
      const reverse = patch.edits.some((edit: any) => edit.beforeText === "#new");
      if (reverse && file.path === options.failReversePath) throw new Error("reverse failed");
      if (!reverse && file.path === options.failForwardPath) throw new Error("forward failed");
      return actualInlineWriter.apply(file, patch);
    }
  };
  const frontmatterWriter = {
    readCurrentTags: actualFrontmatterWriter.readCurrentTags.bind(actualFrontmatterWriter),
    replaceTagsIfSnapshotMatches: actualFrontmatterWriter.replaceTagsIfSnapshotMatches.bind(actualFrontmatterWriter)
  };
  const counters = { persisted: 0, refreshed: 0 };
  const service = new CleanupRecoveryService({
    findFile: (path) => (stateFor(path) === "missing" ? null : (app.vault.getAbstractFileByPath(path) as never)),
    inlineWriter,
    frontmatterWriter,
    operationLog: log,
    persist: async () => {
      counters.persisted += 1;
    },
    refreshIndex: async () => {
      counters.refreshed += 1;
    }
  });
  return {
    app,
    log,
    service,
    get persisted() {
      return counters.persisted;
    },
    get refreshed() {
      return counters.refreshed;
    }
  };
}

async function cleanupFile(notePath: string): Promise<CleanupFileChangeV2> {
  const inlineEdits = createInlineTextEdits([occurrence(notePath)]);
  return {
    notePath,
    beforeTags: ["old"],
    afterTags: ["new"],
    sourceContentHash: await hashContent("#old"),
    beforeBodyHash: await hashContent("#old"),
    afterBodyHash: await hashContent("#new"),
    afterContentHash: await hashContent("#new"),
    inlineEdits
  };
}

function occurrence(notePath: string): CleanupReviewOccurrence {
  return {
    id: `${notePath}:0:4:old`,
    tag: "old",
    normalizedTag: "old",
    sourceText: "#old",
    bodyStart: 0,
    bodyEnd: 4,
    line: 0,
    column: 0,
    context: "#old",
    availability: "trusted",
    afterText: "#new",
    selected: true
  };
}
