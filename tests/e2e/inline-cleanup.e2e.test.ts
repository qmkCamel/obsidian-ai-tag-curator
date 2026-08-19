import { describe, expect, it } from "vitest";
import type { CleanupPlanItem } from "../../src/cleanup/CleanupPlan";
import { CleanupExecutor } from "../../src/cleanup/CleanupExecutor";
import { CleanupRecoveryService } from "../../src/cleanup/CleanupRecoveryService";
import { buildSelectedCleanupPlan, setCleanupOccurrenceSelected } from "../../src/cleanup/CleanupReviewPlan";
import { CleanupReviewPlanBuilder } from "../../src/cleanup/CleanupReviewPlanBuilder";
import { FrontmatterWriter } from "../../src/obsidian/FrontmatterWriter";
import { InlineTagWriter } from "../../src/obsidian/InlineTagWriter";
import { VaultReader } from "../../src/obsidian/VaultReader";
import { OperationLog } from "../../src/operations/OperationLog";
import { createFakeApp } from "./obsidian-harness";

describe("reviewed inline cleanup e2e", () => {
  it("keeps missing/stale cache occurrences view-only while applying only selected exact tokens", async () => {
    const app = createFakeApp([
      { path: "trusted.md", content: "#old first and #old second", frontmatterTags: ["old"] },
      { path: "missing-cache.md", content: "fallback #old", frontmatterTags: [], inlineTagCache: "missing" },
      {
        path: "stale-cache.md",
        content: "stale #old",
        frontmatterTags: [],
        inlineTagCache: [
          {
            tag: "#old",
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 4, offset: 4 }
            }
          }
        ]
      }
    ]);
    const reader = new VaultReader(app as never);
    const builder = new CleanupReviewPlanBuilder({
      readOccurrences: async (path, tags) => reader.readInlineTagOccurrences(reader.getMarkdownFileByPath(path)!, tags)
    });
    let review = await builder.build(item(["trusted.md", "missing-cache.md", "stale-cache.md"]));

    expect(app.vault.getProcessCount()).toBe(0);
    expect(app.fileManager.getWriteCount()).toBe(0);
    expect(review.files.find((file) => file.notePath === "missing-cache.md")?.occurrences[0].availability).toBe(
      "cacheUnavailable"
    );
    expect(review.files.find((file) => file.notePath === "stale-cache.md")?.occurrences[0].availability).toBe(
      "positionMismatch"
    );
    const trusted = review.files.find((file) => file.notePath === "trusted.md")!.occurrences;
    review = setCleanupOccurrenceSelected(review, trusted[0].id, false);
    const selected = buildSelectedCleanupPlan(review);
    expect(selected.partial).toBe(true);
    expect(selected.remainingSourceCount).toBe(3);

    const log = new OperationLog();
    const inlineWriter = new InlineTagWriter(app as never);
    const frontmatterWriter = new FrontmatterWriter(app as never);
    const executor = new CleanupExecutor({
      findFile: (path) => reader.getMarkdownFileByPath(path),
      inlineWriter,
      frontmatterWriter,
      operationLog: log,
      persist: async () => undefined,
      refreshIndex: async () => undefined
    });
    const result = await executor.execute(selected, 20);

    expect(result.status).toBe("applied");
    expect(app.vault.getNote("trusted.md").content).toBe("#old first and #new second");
    expect(app.getNoteTags("trusted.md")).toEqual(["new"]);
    expect(app.vault.getNote("missing-cache.md").content).toBe("fallback #old");
    expect(app.vault.getNote("stale-cache.md").content).toBe("stale #old");
  });

  it("reloads an applied V2 record and reverses mixed frontmatter/body changes exactly", async () => {
    const app = createFakeApp([
      { path: "a.md", content: "#old and #old", frontmatterTags: ["old", "keep"] },
      { path: "b.md", content: "prefix #old", frontmatterTags: ["old"] }
    ]);
    const reader = new VaultReader(app as never);
    const builder = new CleanupReviewPlanBuilder({
      readOccurrences: async (path, tags) => reader.readInlineTagOccurrences(reader.getMarkdownFileByPath(path)!, tags)
    });
    const selected = buildSelectedCleanupPlan(await builder.build(item(["b.md", "a.md"])));
    const inlineWriter = new InlineTagWriter(app as never);
    const frontmatterWriter = new FrontmatterWriter(app as never);
    const firstLog = new OperationLog();
    const executor = new CleanupExecutor({
      findFile: (path) => reader.getMarkdownFileByPath(path),
      inlineWriter,
      frontmatterWriter,
      operationLog: firstLog,
      persist: async () => undefined,
      refreshIndex: async () => undefined
    });
    expect((await executor.execute(selected, 20)).status).toBe("applied");
    expect(app.vault.getNote("a.md").content).toBe("#new and #new");
    expect(app.vault.getNote("b.md").content).toBe("prefix #new");

    const reloadedLog = new OperationLog(firstLog.toJSON());
    const recovery = new CleanupRecoveryService({
      findFile: (path) => reader.getMarkdownFileByPath(path),
      inlineWriter,
      frontmatterWriter,
      operationLog: reloadedLog,
      persist: async () => undefined,
      refreshIndex: async () => undefined
    });
    app.vault.getNote("b.md").content = "prefix #manual";
    expect((await recovery.undoLatestAppliedCleanup()).status).toBe("conflict");
    expect(reloadedLog.latestCleanupV2()?.status).toBe("applied");
    expect(app.vault.getNote("a.md").content).toBe("#new and #new");

    app.vault.getNote("b.md").content = "prefix #new";
    expect((await recovery.undoLatestAppliedCleanup()).status).toBe("removed");
    expect(app.vault.getNote("a.md").content).toBe("#old and #old");
    expect(app.vault.getNote("b.md").content).toBe("prefix #old");
    expect(app.getNoteTags("a.md")).toEqual(["old", "keep"]);
    expect(app.getNoteTags("b.md")).toEqual(["old"]);
  });
});

function item(paths: string[]): CleanupPlanItem {
  return {
    id: "rename-old",
    issueType: "namingDrift",
    title: "Rename old",
    action: "rename",
    capability: {
      kind: "renameTag",
      availability: "executable",
      riskLevel: "medium",
      requiresTargetTag: true,
      requiresFilePreview: true,
      supportsBatch: false,
      defaultSelected: true
    },
    tags: ["old", "new"],
    targetTag: "new",
    rationale: "e2e",
    affectedFileCount: paths.length,
    files: paths.map((path) => ({ path, beforeTags: ["old"], afterTags: ["new"] }))
  };
}
