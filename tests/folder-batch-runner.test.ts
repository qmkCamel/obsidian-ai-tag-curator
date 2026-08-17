import { describe, expect, it } from "vitest";
import { createFolderBatchPlan } from "../src/batch/FolderBatchPlan";
import { FolderBatchRecommendationRunner } from "../src/batch/FolderBatchRecommendationRunner";
import type { IndexedNote, TagIndex } from "../src/index/TagIndex";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";

const index: TagIndex = { updatedAt: "2026-08-04T00:00:00.000Z", tags: {} };

describe("FolderBatchRecommendationRunner", () => {
  it("limits concurrent AI work to two and preserves stable plan order", async () => {
    let active = 0;
    let maxActive = 0;
    const runner = new FolderBatchRecommendationRunner({
      readNote: async (path) => note(path, ["inline"]),
      recommendForNote: async (value) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return result(value.path);
      },
      inlineSyncReason: "sync"
    });

    const completed = await runner.run(plan(["z.md", "a.md", "m.md"]), index);
    expect(maxActive).toBe(2);
    expect(completed.items.map((item) => item.notePath)).toEqual(["a.md", "m.md", "z.md"]);
    expect(completed.items.every((item) => item.planStatus === "ready")).toBe(true);
    expect(completed.status).toBe("ready");
  });

  it("keeps local candidates after AI failure and retries only failed AI items", async () => {
    let requests = 0;
    let shouldFail = true;
    const runner = new FolderBatchRecommendationRunner({
      readNote: async (path) => note(path, ["inline"]),
      recommendForNote: async (value) => {
        requests += 1;
        if (value.path === "a.md" && shouldFail) {
          throw new Error("provider failed");
        }
        return result(value.path);
      },
      inlineSyncReason: "sync"
    });

    const partial = await runner.run(plan(["a.md", "b.md"]), index);
    expect(partial.status).toBe("partial");
    expect(partial.items[0]).toMatchObject({ sourceStatus: "ready", aiStatus: "failed", planStatus: "ready" });
    expect(partial.items[0].candidates.map((candidate) => candidate.source)).toEqual(["inline"]);
    partial.items[0].candidates[0].selected = false;

    shouldFail = false;
    const retried = await runner.retryFailed(index, undefined, partial);
    expect(requests).toBe(3);
    expect(retried.status).toBe("ready");
    expect(retried.items.every((item) => item.aiStatus === "ready")).toBe(true);
    expect(retried.items[0].candidates.find((candidate) => candidate.source === "inline")?.selected).toBe(false);
  });

  it("cancels immediately, stops new requests, and discards late AI results", async () => {
    const gates: Array<() => void> = [];
    let requests = 0;
    const runner = new FolderBatchRecommendationRunner({
      readNote: async (path) => note(path, ["inline"]),
      recommendForNote: async (value) => {
        requests += 1;
        await new Promise<void>((resolve) => gates.push(resolve));
        return result(value.path);
      },
      inlineSyncReason: "sync"
    });

    const running = runner.run(plan(["a.md", "b.md", "c.md", "d.md"]), index);
    await waitUntil(() => requests === 2);
    const cancelled = runner.cancel();
    expect(cancelled?.status).toBe("partial");
    expect(cancelled?.items.slice(0, 2).every((item) => item.aiStatus === "cancelled")).toBe(true);
    expect(cancelled?.items.slice(0, 2).every((item) => item.candidates[0]?.source === "inline")).toBe(true);
    gates.forEach((resolve) => resolve());
    const finished = await running;
    expect(requests).toBe(2);
    expect(finished.items.slice(0, 2).every((item) => item.aiStatus === "cancelled")).toBe(true);
    expect(finished.items.slice(2).every((item) => item.sourceStatus === "cancelled")).toBe(true);
  });

  it("does not start AI when reading fails and creates a new snapshot on read retry", async () => {
    let reads = 0;
    let requests = 0;
    const runner = new FolderBatchRecommendationRunner({
      readNote: async (path) => {
        reads += 1;
        if (reads === 1) {
          throw new Error("read failed");
        }
        return { ...note(path, []), sourceContentHash: "b".repeat(64) };
      },
      recommendForNote: async (value) => {
        requests += 1;
        return result(value.path, []);
      },
      inlineSyncReason: "sync"
    });

    const failed = await runner.run(plan(["a.md"]), index);
    expect(failed.items[0]).toMatchObject({ sourceStatus: "failed", aiStatus: "notStarted", planStatus: "unavailable" });
    expect(requests).toBe(0);
    const retried = await runner.retryFailed(index);
    expect(retried.items[0].sourceContentHash).toBe("b".repeat(64));
    expect(retried.items[0].planStatus).toBe("noChange");
    expect(requests).toBe(1);
  });
});

function plan(paths: string[]) {
  return createFolderBatchPlan({
    folderPath: "",
    includeSubfolders: true,
    filePaths: paths,
    index,
    settings: DEFAULT_SETTINGS,
    uiLanguage: "en",
    randomId: "batch"
  });
}

function note(path: string, inlineTags: string[]): IndexedNote {
  return {
    path,
    content: `body ${inlineTags.map((tag) => `#${tag}`).join(" ")}`,
    frontmatterTags: [],
    inlineTags,
    allTags: inlineTags,
    sourceContentHash: "a".repeat(64)
  };
}

function result(path: string, recommendations = [
  { tag: "existing", type: "existing" as const, confidence: "high" as const, reason: "reuse" }
]) {
  return {
    notePath: path,
    existingTags: [],
    frontmatterTags: [],
    inlineTags: [],
    allTags: [],
    sourceContentHash: "a".repeat(64),
    recommendations,
    warnings: []
  };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error("condition not reached");
}
