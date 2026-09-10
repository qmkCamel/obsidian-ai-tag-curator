import { describe, expect, it } from "vitest";
import {
  CleanupExecutor,
  UnsafeCleanupPlanError,
  classifyCleanupFileState,
  validateSelectedCleanupPlan
} from "../src/cleanup/CleanupExecutor";
import { createInlineTextEdits, type CleanupReviewOccurrence, type SelectedCleanupPlan } from "../src/cleanup/CleanupReviewPlan";
import { FrontmatterWriter } from "../src/obsidian/FrontmatterWriter";
import { InlineTagWriter } from "../src/obsidian/InlineTagWriter";
import { OperationLog, type CleanupFileChangeV2 } from "../src/operations/OperationLog";
import { hashContent } from "../src/utils/hashContent";
import { createFakeApp } from "./e2e/obsidian-harness";

describe("CleanupExecutor", () => {
  it("applies frontmatter-only, inline-only, and mixed files in one ordered V2 record", async () => {
    const fixture = await setup([
      { path: "c-frontmatter.md", content: "plain", tags: ["old", "keep"], frontmatter: true, inline: false },
      { path: "a-inline.md", content: "keep #old here", tags: ["keep"], frontmatter: false, inline: true },
      { path: "b-mixed.md", content: "#old and #old", tags: ["old"], frontmatter: true, inline: true }
    ]);

    const result = await fixture.executor.execute(fixture.plan, 20);

    expect(result.status).toBe("applied");
    expect(fixture.app.getNoteTags("c-frontmatter.md")).toEqual(["new", "keep"]);
    expect(fixture.app.vault.getNote("a-inline.md").content).toBe("keep #new here");
    expect(fixture.app.getNoteTags("a-inline.md")).toEqual(["keep"]);
    expect(fixture.app.vault.getNote("b-mixed.md").content).toBe("#new and #new");
    expect(fixture.app.getNoteTags("b-mixed.md")).toEqual(["new"]);
    expect(result.record).toMatchObject({ schemaVersion: 2, status: "applied", partial: false });
    expect(result.record?.files.map((file) => file.notePath)).toEqual([
      "a-inline.md",
      "b-mixed.md",
      "c-frontmatter.md"
    ]);
    expect(result.record?.files.every((file) => Boolean(file.afterContentHash))).toBe(true);
    expect(fixture.log.toJSON()).toHaveLength(1);
    expect(fixture.persisted).toBe(2);
    expect(fixture.refreshed).toBe(1);
  });

  it("aggregates missing, tags, content, and token conflicts with zero writes and zero intent", async () => {
    const fixture = await setup(
      [
        { path: "tags.md", content: "#old", tags: ["old"], frontmatter: true, inline: false },
        { path: "content.md", content: "#old", tags: ["old"], frontmatter: true, inline: false },
        { path: "token.md", content: "x#old", tags: [], frontmatter: false, inline: true },
        { path: "missing.md", content: "#old", tags: [], frontmatter: false, inline: true }
      ],
      { missingPath: "missing.md" }
    );
    fixture.app.vault.getNote("tags.md").frontmatterTags = ["manual"];
    fixture.app.vault.getNote("content.md").content = "changed";
    fixture.plan.files.find((file) => file.notePath === "token.md")!.inlineEdits[0] = {
      ...fixture.plan.files.find((file) => file.notePath === "token.md")!.inlineEdits[0],
      beforeBodyStart: 0,
      beforeBodyEnd: 4,
      afterBodyStart: 0,
      afterBodyEnd: 4
    };

    const result = await fixture.executor.execute(fixture.plan, 20);

    expect(result.status).toBe("conflict");
    expect(result.conflicts).toEqual([
      { notePath: "content.md", kind: "contentChanged" },
      { notePath: "missing.md", kind: "missing" },
      { notePath: "tags.md", kind: "tagsChanged" },
      { notePath: "token.md", kind: "tokenChanged" }
    ]);
    expect(fixture.app.vault.getProcessCount()).toBe(0);
    expect(fixture.app.fileManager.getWriteCount()).toBe(0);
    expect(fixture.log.toJSON()).toEqual([]);
    expect(fixture.persisted).toBe(0);
  });

  it("reverses inline edits when the following frontmatter stage fails", async () => {
    const fixture = await setup(
      [{ path: "mixed.md", content: "#old", tags: ["old"], frontmatter: true, inline: true }],
      { failForwardFrontmatterPath: "mixed.md" }
    );

    const result = await fixture.executor.execute(fixture.plan, 20);

    expect(result.status).toBe("rolledBack");
    expect(fixture.app.vault.getNote("mixed.md").content).toBe("#old");
    expect(fixture.app.getNoteTags("mixed.md")).toEqual(["old"]);
    expect(fixture.log.toJSON()).toEqual([]);
  });

  it("compensates earlier files in reverse after a later file fails", async () => {
    const fixture = await setup(
      [
        { path: "a.md", content: "#old", tags: ["old"], frontmatter: true, inline: true },
        { path: "b.md", content: "#old", tags: ["old"], frontmatter: true, inline: true }
      ],
      { failForwardFrontmatterPath: "b.md" }
    );

    const result = await fixture.executor.execute(fixture.plan, 20);

    expect(result.status).toBe("rolledBack");
    expect(fixture.app.vault.getNote("a.md").content).toBe("#old");
    expect(fixture.app.getNoteTags("a.md")).toEqual(["old"]);
    expect(fixture.app.vault.getNote("b.md").content).toBe("#old");
  });

  it("fixes recovery target=before when compensation is incomplete", async () => {
    const fixture = await setup(
      [
        { path: "a.md", content: "#old", tags: ["old"], frontmatter: true, inline: true },
        { path: "b.md", content: "#old", tags: ["old"], frontmatter: true, inline: true }
      ],
      { failForwardFrontmatterPath: "b.md", failReverseInlinePath: "a.md" }
    );

    const result = await fixture.executor.execute(fixture.plan, 20);

    expect(result.status).toBe("recoveryRequired");
    expect(result.record).toMatchObject({ status: "recoveryRequired", recoveryTarget: "before" });
    expect(result.record?.files.find((file) => file.notePath === "a.md")?.recoveryState).toBe("bodyChanged");
    expect(fixture.refreshed).toBe(1);
  });

  it("detects a post-preflight body race, compensates earlier files, and preserves the user conflict", async () => {
    const fixture = await setup(
      [
        { path: "a.md", content: "#old", tags: ["old"], frontmatter: true, inline: true },
        { path: "b.md", content: "#old", tags: ["old"], frontmatter: true, inline: true }
      ],
      { raceBeforeInlinePath: "b.md" }
    );

    const result = await fixture.executor.execute(fixture.plan, 20);

    expect(result.status).toBe("recoveryRequired");
    expect(fixture.app.vault.getNote("a.md").content).toBe("#old");
    expect(fixture.app.getNoteTags("a.md")).toEqual(["old"]);
    expect(fixture.app.vault.getNote("b.md").content).toBe("#manual");
    expect(result.record).toMatchObject({ recoveryTarget: "before" });
    expect(result.record?.files.find((file) => file.notePath === "b.md")?.recoveryState).toBe("conflict");
  });

  it("keeps an applied record when index refresh fails", async () => {
    const fixture = await setup(
      [{ path: "inline.md", content: "#old", tags: [], frontmatter: false, inline: true }],
      { failRefresh: true }
    );
    const result = await fixture.executor.execute(fixture.plan, 20);
    expect(result).toMatchObject({ status: "applied", indexRefreshError: "index failed" });
    expect(fixture.log.latestCleanupV2()?.status).toBe("applied");
  });

  it("rejects arbitrary or empty mutations before dependency calls", async () => {
    const fixture = await setup([{ path: "a.md", content: "#old", tags: [], frontmatter: false, inline: true }]);
    expect(() => validateSelectedCleanupPlan({ ...fixture.plan, files: [] })).toThrow(UnsafeCleanupPlanError);
    expect(() =>
      validateSelectedCleanupPlan({
        ...fixture.plan,
        files: [{ ...fixture.plan.files[0], inlineEdits: [{ ...fixture.plan.files[0].inlineEdits[0], afterText: "#other" }] }]
      })
    ).toThrow("cleanup identity");
  });

  it("classifies before, body-only, after, and conflict states", () => {
    const change: CleanupFileChangeV2 = {
      notePath: "a.md",
      beforeTags: ["old"],
      afterTags: ["new"],
      sourceContentHash: "source",
      beforeBodyHash: "before-body",
      afterBodyHash: "after-body",
      inlineEdits: []
    };
    expect(classifyCleanupFileState(["old"], "before-body", change)).toBe("before");
    expect(classifyCleanupFileState(["old"], "after-body", change)).toBe("bodyChanged");
    expect(classifyCleanupFileState(["new"], "after-body", change)).toBe("after");
    expect(classifyCleanupFileState(["manual"], "after-body", change)).toBe("conflict");
  });
});

interface NoteSetup {
  path: string;
  content: string;
  tags: string[];
  frontmatter: boolean;
  inline: boolean;
}

async function setup(
  notes: NoteSetup[],
  options: {
    failForwardFrontmatterPath?: string;
    failReverseInlinePath?: string;
    failRefresh?: boolean;
    missingPath?: string;
    raceBeforeInlinePath?: string;
  } = {}
) {
  const app = createFakeApp(notes.map((note) => ({ path: note.path, content: note.content, frontmatterTags: note.tags })));
  const actualInlineWriter = new InlineTagWriter(app as never);
  const actualFrontmatterWriter = new FrontmatterWriter(app as never);
  const inlineWriter = {
    checkPatch: actualInlineWriter.checkPatch.bind(actualInlineWriter),
    readSnapshot: actualInlineWriter.readSnapshot.bind(actualInlineWriter),
    apply: async (file: any, patch: any) => {
      const reversing = patch.edits.some((edit: any) => edit.beforeText === "#new" && edit.afterText === "#old");
      if (reversing && file.path === options.failReverseInlinePath) throw new Error("reverse inline failed");
      if (!reversing && file.path === options.raceBeforeInlinePath) {
        app.vault.getNote(file.path).content = "#manual";
      }
      return actualInlineWriter.apply(file, patch);
    }
  };
  const frontmatterWriter = {
    checkSnapshot: actualFrontmatterWriter.checkSnapshot.bind(actualFrontmatterWriter),
    readCurrentTags: actualFrontmatterWriter.readCurrentTags.bind(actualFrontmatterWriter),
    replaceTagsIfSnapshotMatches: async (file: any, snapshot: any, nextTags: string[]) => {
      const forward = nextTags.includes("new");
      if (forward && file.path === options.failForwardFrontmatterPath) throw new Error("frontmatter failed");
      return actualFrontmatterWriter.replaceTagsIfSnapshotMatches(file, snapshot, nextTags);
    }
  };
  const files = await Promise.all(notes.map((note) => selectedFile(note)));
  const plan: SelectedCleanupPlan = {
    itemId: "rename-old",
    title: "Rename old",
    action: "rename",
    sourceTags: ["old"],
    targetTag: "new",
    createdAt: "2026-08-04T00:00:00.000Z",
    files,
    fileCount: files.length,
    frontmatterChangeCount: files.filter((file) => file.beforeTags.join() !== file.afterTags.join()).length,
    inlineEditCount: files.reduce((sum, file) => sum + file.inlineEdits.length, 0),
    remainingSourceCount: 0,
    partial: false
  };
  const log = new OperationLog();
  const counters = { persisted: 0, refreshed: 0 };
  const executor = new CleanupExecutor({
    findFile: (path) => (path === options.missingPath ? null : (app.vault.getAbstractFileByPath(path) as never)),
    inlineWriter,
    frontmatterWriter,
    operationLog: log,
    persist: async () => {
      counters.persisted += 1;
    },
    refreshIndex: async () => {
      counters.refreshed += 1;
      if (options.failRefresh) throw new Error("index failed");
    }
  });
  return {
    app,
    plan,
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

async function selectedFile(note: NoteSetup) {
  const beforeBodyHash = await hashContent(note.content);
  const beforeTags = [...note.tags];
  const afterTags = note.frontmatter ? note.tags.map((tag) => (tag === "old" ? "new" : tag)) : beforeTags;
  const inlineEdits = note.inline
    ? createInlineTextEdits(findOccurrences(note.content).map((entry, index) => occurrence(`${note.path}:${index}`, entry)))
    : [];
  return {
    notePath: note.path,
    sourceContentHash: await hashContent(note.content),
    beforeBodyHash,
    beforeTags,
    afterTags,
    inlineEdits
  };
}

function findOccurrences(content: string): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  let offset = content.indexOf("#old");
  while (offset >= 0) {
    result.push({ start: offset, end: offset + 4 });
    offset = content.indexOf("#old", offset + 4);
  }
  return result;
}

function occurrence(id: string, range: { start: number; end: number }): CleanupReviewOccurrence {
  return {
    id,
    tag: "old",
    normalizedTag: "old",
    sourceText: "#old",
    bodyStart: range.start,
    bodyEnd: range.end,
    line: 0,
    column: range.start,
    context: "#old",
    availability: "trusted",
    afterText: "#new",
    selected: true
  };
}
