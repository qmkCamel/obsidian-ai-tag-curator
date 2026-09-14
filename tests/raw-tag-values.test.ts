import { describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

// Codec stand-in for unit tests only; real Obsidian codec acceptance remains a host gate.
vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<object>(),
  parseYaml: (text: string) => parse(text),
  stringifyYaml: (value: unknown) => stringify(value)
}));

import type { App, TFile } from "obsidian";
import { getFrontMatterInfo } from "obsidian";
import { FrontmatterWriter, type FrontmatterWriteGuard } from "../src/obsidian/FrontmatterWriter";
import {
  applyTagValuePatch, assertWritableTagValue, captureTagValueSnapshot, createAdditiveTagValuePatch,
  createCleanupTagValuePatch, exactTagValuePatch, normalizedSnapshotTags, sameTagValue, tagValueFields,
  type TagValueSnapshot
} from "../src/obsidian/TagValuePatch";
import { createChangePlan } from "../src/preview/ChangePlan";
import { UndoService } from "../src/operations/UndoService";
import { hashContent } from "../src/utils/hashContent";
import { buildInlineTagOccurrenceReadResult } from "../src/obsidian/InlineTagOccurrenceReader";
import { InlineTagWriter } from "../src/obsidian/InlineTagWriter";
import { CleanupReviewPlanBuilder } from "../src/cleanup/CleanupReviewPlanBuilder";
import { buildSelectedCleanupPlan, setCleanupFrontmatterSelected, type ReviewContext, type SelectedCleanupPlan } from "../src/cleanup/CleanupReviewPlan";
import { CleanupExecutor, classifyCleanupFileState, validateSelectedCleanupPlan } from "../src/cleanup/CleanupExecutor";
import { CleanupRecoveryService } from "../src/cleanup/CleanupRecoveryService";
import { OperationLog } from "../src/operations/OperationLog";
import { FolderBatchExecutor, validateFolderBatchChangePlans } from "../src/batch/FolderBatchExecutor";
import { FolderBatchRecoveryService } from "../src/batch/FolderBatchRecoveryService";
import { createFolderBatchPlan, deriveChangePlans } from "../src/batch/FolderBatchPlan";
import { FolderBatchRecommendationRunner } from "../src/batch/FolderBatchRecommendationRunner";
import { DEFAULT_SETTINGS } from "../src/settings/PluginSettings";

const list = (...values: string[]): TagValueSnapshot => ({ kind: "list", values });
const context: ReviewContext = {
  origin: "manual", indexRevision: 1, vaultRevision: 2, policyRevision: 3,
  scope: { include: [{ path: "", recursive: true }] }, candidatePaths: ["a.md"]
};

function markdown(tags: string[], body = "正文 🧪 #Old #KeepCase\r\n") {
  return `---\r\ntags: ${JSON.stringify(tags)}\r\ntitle: Keep me\r\n---\r\n${body}`;
}

function host(initial: Record<string, string>, guard?: FrontmatterWriteGuard) {
  const contents = new Map(Object.entries(initial));
  const writes: string[] = [];
  const files = new Map(Object.keys(initial).map((path) => [path, { path } as TFile]));
  let beforeProcess: ((path: string) => void) | undefined;
  const read = async (file: TFile) => {
    const value = contents.get(file.path);
    if (value === undefined) throw new Error("missing");
    return value;
  };
  const app = {
    vault: {
      read, cachedRead: read,
      process: async (file: TFile, transform: (data: string) => string) => {
        beforeProcess?.(file.path);
        const result = transform(await read(file));
        contents.set(file.path, result);
        writes.push(file.path);
        return result;
      }
    },
    metadataCache: {
      getFileCache: (file: TFile) => {
        const info = getFrontMatterInfo(contents.get(file.path)!);
        return { frontmatter: info.exists ? parse(info.frontmatter) : undefined };
      }
    }
  } as unknown as App;
  const writer = new FrontmatterWriter(app, guard);
  const inlineWriter = new InlineTagWriter(app);
  const operationLog = new OperationLog();
  const persist = vi.fn(async () => {});
  const refreshIndex = vi.fn(async () => {});
  const dependencies = { findFile: (path: string) => files.get(path) ?? null, writer, frontmatterWriter: writer, inlineWriter, operationLog, persist, refreshIndex };
  return {
    ...dependencies, app, contents, writes, file: files.get("a.md")!,
    intercept: (hook: typeof beforeProcess) => { beforeProcess = hook; },
    executor: new CleanupExecutor(dependencies), recovery: new CleanupRecoveryService(dependencies),
    batchExecutor: new FolderBatchExecutor(dependencies), batchRecovery: new FolderBatchRecoveryService(dependencies)
  };
}

async function review(h: ReturnType<typeof host>, paths = ["a.md"], reviewContext: ReviewContext | undefined = context) {
  const builder = new CleanupReviewPlanBuilder({
    readOccurrences: async (path, relevant) => {
      const content = h.contents.get(path)!;
      const parts = getFrontMatterInfo(content);
      const start = content.indexOf("#Old", parts.contentStart);
      return buildInlineTagOccurrenceReadResult(path, content, {
        tags: start < 0 ? [] : [{ tag: "#Old", position: { start: { offset: start, line: 4, col: 6 }, end: { offset: start + 4, line: 4, col: 10 } } }]
      }, relevant);
    }
  });
  return builder.buildInput({ id: "manual-1", title: "Rename", action: "rename", sourceTags: ["Old"], targetTag: "NewCase", candidatePaths: paths, context: reviewContext });
}

async function additivePlan(content: string, path = "a.md") {
  const snapshot = captureTagValueSnapshot(content);
  return createChangePlan({ notePath: path, beforeTags: normalizedSnapshotTags(snapshot), sourceContentHash: await hashContent(content), tagValueSnapshot: snapshot, selectedAiTags: ["new"] });
}

const index = { updatedAt: "now", noteCount: 0, tags: {} };
function batch(paths = ["a.md"]) {
  return createFolderBatchPlan({ folderPath: "", includeSubfolders: true, filePaths: paths, index, settings: DEFAULT_SETTINGS, uiLanguage: "en", policyRevision: 3 });
}

describe("raw tag values", () => {
  it("distinguishes absent, empty lists, scalar and exact list values", () => {
    expect(captureTagValueSnapshot("body")).toEqual({ kind: "absent" });
    expect(captureTagValueSnapshot(markdown([]))).toEqual(list());
    expect(captureTagValueSnapshot("---\ntags: Old, Keep\n---\nbody")).toEqual({ kind: "scalar", value: "Old, Keep" });
    expect(captureTagValueSnapshot(markdown(["#Old", " KeepCase ", "KeepCase"]))).toEqual(list("#Old", " KeepCase ", "KeepCase"));
    expect(sameTagValue(list("Keep"), list("keep"))).toBe(false);
    expect(sameTagValue(list("Keep", "Keep"), list("Keep"))).toBe(false);
  });

  it.each([
    [["Old", "KeepCase", "KeepCase"], ["NewCase", "KeepCase", "KeepCase"]],
    [["Old", "KeepCase", "NewCase", "NEWCASE", "Old"], ["KeepCase", "NewCase", "NEWCASE"]],
    [["NEWCASE", "Old", "KeepCase"], ["NEWCASE", "KeepCase"]],
    [["Old/child", "#Old", " KeepCase "], ["Old/child", "NewCase", " KeepCase "]]
  ])("rewrites only selected source values: %j", (before, after) => {
    expect(createCleanupTagValuePatch(list(...before), ["old", "newcase"], "NewCase").after).toEqual(list(...after));
  });

  it("appends selected new literals and preserves all pre-existing values", () => {
    const before = list("KeepCase", "KeepCase", " #Spaced ");
    expect(createAdditiveTagValuePatch(before, ["keepcase", "NewCase", "NEWCASE"]).after).toEqual(list("KeepCase", "KeepCase", " #Spaced ", "NewCase"));
    expect(createAdditiveTagValuePatch({ kind: "absent" }, []).after).toEqual({ kind: "absent" });
  });

  it("does not match malformed existing values by repairing spaces, hashes or hierarchy", () => {
    const before = list("a b", "a//b", "##Old", "Old");
    expect(createCleanupTagValuePatch(before, ["a-b", "a/b", "old"], "New").after).toEqual(list("a b", "a//b", "##Old", "New"));
  });

  it.each(["", "123", "123/456", "a//b", "a b", "/a", "a/", "a!", "##a"])("rejects invalid targets without repairing %j", (target) => {
    expect(() => createCleanupTagValuePatch(list("Old"), ["Old"], target)).toThrow();
  });

  it.each(["tags: [Old, 42]", "tags: null", "tags: 42", "tags: {x: y}", "tags: [Old", "title: .nan\ntags: [Old]", "x: &x [*x]\ntags: [Old]", "__proto__: unsafe\ntags: [Old]"])("rejects unsafe YAML %j", (yaml) => {
    expect(() => captureTagValueSnapshot(`---\n${yaml}\n---\nbody`)).toThrow();
  });

  it("does not repair scalar frontmatter in new additive or cleanup plans", () => {
    const value = captureTagValueSnapshot("---\ntags: Old\n---\nbody");
    expect(() => assertWritableTagValue(value)).toThrow("Scalar");
    expect(() => createAdditiveTagValuePatch(value, ["New"])).toThrow("Scalar");
    expect(() => createCleanupTagValuePatch(value, ["Old"], "New")).toThrow("Scalar");
  });

  it("round-trips complex properties, anchors and multiline values without changing the body", () => {
    const content = "---\ntags: [Old, KeepCase, KeepCase]\nsummary: |\n  first line\n  second line\nbase: &base\n  active: true\n  count: 4.5\ncopy: *base\narray: [false, null, 23, 'true']\n---\n正文 🧪 #Old\r\n\ntrailing\n";
    const patch = createCleanupTagValuePatch(captureTagValueSnapshot(content), ["Old"], "NewCase");
    const after = applyTagValuePatch(content, patch);
    const beforeInfo = getFrontMatterInfo(content);
    const afterInfo = getFrontMatterInfo(after);
    const { tags: _old, ...beforeProps } = parse(beforeInfo.frontmatter);
    const { tags: _new, ...afterProps } = parse(afterInfo.frontmatter);
    expect(afterProps).toEqual(beforeProps);
    expect(after.slice(afterInfo.contentStart)).toBe(content.slice(beforeInfo.contentStart));
    expect(captureTagValueSnapshot(after)).toEqual(list("NewCase", "KeepCase", "KeepCase"));
  });

  it("does not manufacture exact evidence from legacy metadata", () => {
    expect(exactTagValuePatch({ beforeTags: ["Old"] })).toBeUndefined();
    expect(() => exactTagValuePatch({ tagValueVersion: 1 })).toThrow();
    expect(() => exactTagValuePatch({ tagValuePatch: { before: list(), after: list("New") } })).toThrow();
  });

  it.each(["date: !!timestamp 2026-09-10", "large: 9007199254740993", "value: .inf", "value: -0"])("rejects values whose ordinary-data equivalence cannot be proved: %s", (property) => {
    expect(() => captureTagValueSnapshot(`---\ntags: [Old]\n${property}\n---\nbody`)).toThrow();
  });

  it("keeps selected recommendation literals distinct from identity fields", async () => {
    const plan = createChangePlan({ notePath: "a.md", beforeTags: ["keep"], tagValueSnapshot: list("Keep"), sourceContentHash: "hash", selectedAiTags: ["NewCase"] });
    expect(plan.afterTags).toEqual(["keep", "newcase"]);
    expect(plan.aiAddedTags).toEqual(["NewCase"]);
    expect(plan.tagValuePatch?.after).toEqual(list("Keep", "NewCase"));
    expect(() => validateFolderBatchChangePlans([plan])).not.toThrow();
  });
});

describe("raw writer and recommendation undo", () => {
  it("calls guard inside the callback with untouched raw values", async () => {
    const guard = vi.fn();
    const h = host({ "a.md": markdown(["KeepCase", "KeepCase"]) }, guard);
    const plan = await additivePlan(h.contents.get("a.md")!);
    expect(plan.tagValueVersion).toBe(1);
    expect(plan.tagValuePatch?.after).toEqual(list("KeepCase", "KeepCase", "new"));
    await h.writer.applyChangePlan(h.file, plan);
    expect(guard).toHaveBeenCalledExactlyOnceWith("a.md", ["KeepCase", "KeepCase"], ["KeepCase", "KeepCase", "new"]);
    expect(h.contents.get("a.md")).toContain("\r\n正文 🧪 #Old #KeepCase\r\n");
  });

  it("guards callback-time policy changes, with zero writes", async () => {
    let blocked = false;
    const h = host({ "a.md": markdown(["Old"]) }, () => { if (blocked) throw new Error("protected"); });
    const plan = await additivePlan(h.contents.get("a.md")!);
    h.intercept(() => { blocked = true; });
    await expect(h.writer.applyChangePlan(h.file, plan)).rejects.toThrow("protected");
    expect(h.writes).toEqual([]);
  });

  it("rejects body drift after preflight even when raw tags still match", async () => {
    const h = host({ "a.md": markdown(["Old"]) });
    const plan = await additivePlan(h.contents.get("a.md")!);
    h.intercept(() => { h.contents.set("a.md", h.contents.get("a.md")! + "concurrent edit"); });
    await expect(h.writer.applyChangePlan(h.file, plan)).rejects.toMatchObject({ kind: "contentChanged" });
    expect(h.writes).toEqual([]);
    expect(h.contents.get("a.md")).toContain("concurrent edit");
  });

  it("rejects same-key different raw evidence even with a current content hash", async () => {
    const h = host({ "a.md": markdown(["KEEP"]) });
    await expect(h.writer.replaceTagsIfSnapshotMatches(h.file, {
      beforeTags: ["keep"], sourceContentHash: await hashContent(h.contents.get("a.md")!),
      ...tagValueFields({ before: list("Keep"), after: list("Keep", "New") })
    }, ["keep", "new"])).rejects.toMatchObject({ kind: "tagsChanged" });
    expect(h.writes).toEqual([]);
  });

  it.each(["body #Old\r\n", markdown([]), markdown(["KeepCase", "KeepCase"])])("undo restores exact raw shape for %j", async (content) => {
    const h = host({ "a.md": content });
    const plan = await additivePlan(content);
    await h.writer.applyChangePlan(h.file, plan);
    await new UndoService(h.writer).undo(h.file, plan);
    expect(captureTagValueSnapshot(h.contents.get("a.md")!)).toEqual(captureTagValueSnapshot(content));
    const result = h.contents.get("a.md")!;
    expect(result.slice(getFrontMatterInfo(result).contentStart)).toBe(content.slice(getFrontMatterInfo(content).contentStart));
  });

  it("undo refuses raw drift hidden by normalized tags", async () => {
    const h = host({ "a.md": markdown(["KeepCase"]) });
    const plan = await additivePlan(h.contents.get("a.md")!);
    await h.writer.applyChangePlan(h.file, plan);
    h.contents.set("a.md", h.contents.get("a.md")!.replace("KeepCase", "KEEPCASE"));
    await expect(new UndoService(h.writer).undo(h.file, plan)).rejects.toMatchObject({ kind: "tagsChanged" });
    expect(h.writes).toHaveLength(1);
  });
});

describe("raw deterministic cleanup and recovery", () => {
  it("rejects context drift during full preflight before creating or persisting intent", async () => {
    const h = host({ "a.md": markdown(["Old"]) });
    const plan = buildSelectedCleanupPlan(await review(h));
    const check = h.writer.checkSnapshot.bind(h.writer);
    let revision = 0;
    const preflight = vi.spyOn(h.writer, "checkSnapshot").mockImplementation(async (...args) => {
      const result = await check(...args);
      revision += 1;
      return result;
    });
    const validateContext = vi.fn((selected: SelectedCleanupPlan) => {
      expect(selected).toBe(plan);
      expect(preflight).toHaveBeenCalledTimes(1);
      expect(h.operationLog.isMutationRunning).toBe(true);
      if (revision !== 0) throw new Error("vaultRevision changed during preflight");
    });
    const executor = new CleanupExecutor({ ...h, validateContext });

    await expect(executor.execute(plan, 20)).rejects.toThrow("vaultRevision changed during preflight");
    expect(validateContext).toHaveBeenCalledTimes(1);
    expect(h.writes).toEqual([]);
    expect(h.persist).not.toHaveBeenCalled();
    expect(h.operationLog.toJSON()).toEqual([]);
    expect(h.operationLog.receiptsToJSON()).toEqual([]);
    expect(h.operationLog.latestUnresolvedMutation()).toBeUndefined();
    expect(h.operationLog.isMutationRunning).toBe(false);
  });

  it("rolls back a persisted intent with zero writes when context validation fails before the first write", async () => {
    const h = host({ "a.md": markdown(["Old"]) });
    const plan = buildSelectedCleanupPlan(await review(h));
    let revision = 0;
    h.persist.mockImplementation(async () => { revision += 1; });
    const validateContext = vi.fn((selected: SelectedCleanupPlan) => {
      expect(selected).toBe(plan);
      expect(h.writes).toEqual([]);
      expect(h.operationLog.isMutationRunning).toBe(true);
      if (revision !== 0) throw new Error("candidate paths changed while saving intent");
    });

    const result = await new CleanupExecutor({ ...h, validateContext }).execute(plan, 20);
    expect(result).toMatchObject({ status: "rolledBack", error: "candidate paths changed while saving intent" });
    expect(validateContext).toHaveBeenCalledTimes(2);
    expect(h.persist).toHaveBeenCalledTimes(2);
    expect(h.writes).toEqual([]);
    expect(h.operationLog.toJSON()).toEqual([]);
    expect(h.operationLog.latestUnresolvedMutation()).toBeUndefined();
    expect(h.operationLog.receiptsToJSON()).toHaveLength(1);
    expect(h.operationLog.receiptsToJSON()[0]).toMatchObject({ status: "rolledBack", origin: "manual" });
    expect(h.operationLog.isMutationRunning).toBe(false);
    expect(h.refreshIndex).not.toHaveBeenCalled();
  });

  it("validates context only before writing, not again after its own multi-file modifications", async () => {
    const paths = ["a.md", "b.md"];
    const h = host(Object.fromEntries(paths.map((path) => [path, markdown(["Old"])])));
    const plan = buildSelectedCleanupPlan(await review(h, paths, { ...context, candidatePaths: paths }));
    let revision = 0;
    h.intercept(() => { revision += 1; });
    const validateContext = vi.fn(() => {
      if (revision !== 0) throw new Error("own modification invalidated revision");
    });

    expect((await new CleanupExecutor({ ...h, validateContext }).execute(plan, 20)).status).toBe("applied");
    expect(validateContext).toHaveBeenCalledTimes(2);
    expect(h.writes).toEqual(["a.md", "a.md", "b.md", "b.md"]);
    expect(h.operationLog.latestUnresolvedMutation()).toBeUndefined();
  });

  it("runs inline guard inside CAS and aborts a callback-time policy rejection", async () => {
    const h = host({ "a.md": markdown(["Old"]) });
    const plan = buildSelectedCleanupPlan(await review(h));
    let blocked = false;
    const guard = vi.fn(() => { if (blocked) throw new Error("inline protected"); });
    const writer = new InlineTagWriter(h.app, guard);
    h.intercept(() => { blocked = true; });
    const patch = plan.files[0];
    await expect(writer.apply(h.file, { expectedContentHash: patch.sourceContentHash, expectedBodyHash: patch.beforeBodyHash, edits: patch.inlineEdits })).rejects.toThrow("inline protected");
    expect(h.writes).toEqual([]);
    expect(guard).toHaveBeenCalledWith("a.md", patch.inlineEdits);
  });

  it("does not invoke inline guard if the callback finds stale content", async () => {
    const h = host({ "a.md": markdown(["Old"]) });
    const patch = buildSelectedCleanupPlan(await review(h)).files[0];
    const guard = vi.fn();
    h.intercept(() => { h.contents.set("a.md", h.contents.get("a.md")! + "edited"); });
    await expect(new InlineTagWriter(h.app, guard).apply(h.file, { expectedContentHash: patch.sourceContentHash, expectedBodyHash: patch.beforeBodyHash, edits: patch.inlineEdits })).rejects.toMatchObject({ kind: "contentChanged" });
    expect(guard).not.toHaveBeenCalled();
    expect(h.writes).toEqual([]);
  });

  it("propagates the opaque context and target literal, preserving target duplicates", async () => {
    const h = host({ "a.md": markdown(["Old", "KeepCase", "NEWCASE", "NewCase", "KeepCase"]) });
    const plan = await review(h);
    expect(plan.context).toBe(context);
    expect(plan.targetTag).toBe("NewCase");
    expect(plan.files[0].tagValuePatch?.after).toEqual(list("KeepCase", "NEWCASE", "NewCase", "KeepCase"));
    const selected = buildSelectedCleanupPlan(plan);
    expect(selected.context).toBe(context);
    expect(selected.files[0].inlineEdits[0].afterText).toBe("#NewCase");
    expect(() => validateSelectedCleanupPlan(selected)).not.toThrow();
  });

  it("retains identity raw patch when frontmatter is deselected", async () => {
    const h = host({ "a.md": markdown(["Old", "KeepCase", "KeepCase"]) });
    const plan = buildSelectedCleanupPlan(setCleanupFrontmatterSelected(await review(h), "a.md", false));
    expect(plan.frontmatterChangeCount).toBe(0);
    expect(plan.files[0].tagValuePatch?.after).toEqual(plan.files[0].tagValuePatch?.before);
    expect(plan.partial).toBe(true);
  });

  it("blocks 201 candidates before hydration and rejects cancelled selection", async () => {
    const readOccurrences = vi.fn();
    const builder = new CleanupReviewPlanBuilder({ readOccurrences });
    await expect(builder.buildInput({ id: "x", title: "x", action: "rename", sourceTags: ["Old"], targetTag: "New", candidatePaths: Array.from({ length: 201 }, (_, i) => `${i}.md`) })).rejects.toThrow("200");
    expect(readOccurrences).not.toHaveBeenCalled();
    const plan = await review(host({ "a.md": markdown(["Old"]) }));
    expect(() => buildSelectedCleanupPlan({ ...plan, cancelled: true })).toThrow("Cancelled");
  });

  it.each(["tags: Old", "tags: [Old, 3]", "tags: [Old"])("keeps the whole new operation read-only for %j", async (yaml) => {
    const plan = await review(host({ "a.md": `---\n${yaml}\n---\n#Old` }));
    expect(plan.files[0].status).toBe("unavailable");
    expect(plan.files[0].error).toBeTruthy();
    expect(buildSelectedCleanupPlan(plan).files).toEqual([]);
  });

  it("writes mixed stages and restores exact tags and body through recovery", async () => {
    const content = markdown(["Old", "KeepCase", "KeepCase"]);
    const h = host({ "a.md": content });
    const plan = buildSelectedCleanupPlan(await review(h));
    expect((await h.executor.execute(plan, 20)).status).toBe("applied");
    expect(h.operationLog.latestCleanupV2()?.files[0]).toMatchObject(tagValueFields(plan.files[0].tagValuePatch));
    expect(h.contents.get("a.md")).toContain("#NewCase #KeepCase");
    expect((await h.recovery.undoLatestAppliedCleanup()).status).toBe("removed");
    expect(captureTagValueSnapshot(h.contents.get("a.md")!)).toEqual(list("Old", "KeepCase", "KeepCase"));
    expect(h.contents.get("a.md")).toContain("正文 🧪 #Old #KeepCase\r\n");
  });

  it("compensates inline stage when the raw frontmatter guard rejects", async () => {
    const content = markdown(["Old", "KeepCase"]);
    const h = host({ "a.md": content }, () => { throw new Error("protected"); });
    expect((await h.executor.execute(buildSelectedCleanupPlan(await review(h)), 20)).status).toBe("rolledBack");
    expect(h.contents.get("a.md")).toBe(content);
    expect(h.operationLog.latestCleanupV2()).toBeUndefined();
    expect(h.operationLog.receiptsToJSON()[0]?.status).toBe("rolledBack");
  });

  it("does not classify same-key raw drift as after or silently undo it", async () => {
    const h = host({ "a.md": markdown(["Old", "KeepCase"]) });
    await h.executor.execute(buildSelectedCleanupPlan(await review(h)), 20);
    const record = h.operationLog.latestCleanupV2()!;
    expect(classifyCleanupFileState(record.files[0].afterTags, record.files[0].afterBodyHash, record.files[0], list("NEWCASE", "KeepCase"))).toBe("conflict");
    h.contents.set("a.md", h.contents.get("a.md")!.replace("- NewCase", "- NEWCASE"));
    const before = h.writes.length;
    expect((await h.recovery.undoLatestAppliedCleanup()).status).toBe("conflict");
    expect(h.writes).toHaveLength(before);
  });

  it("rejects a tampered raw patch that normalizes an unselected value", async () => {
    const plan = buildSelectedCleanupPlan(await review(host({ "a.md": markdown(["Old", "KeepCase"]) })));
    plan.files[0].tagValuePatch!.after = list("NewCase", "keepcase");
    expect(() => validateSelectedCleanupPlan(plan)).toThrow("Raw changes");
  });

  it("reconciles interrupted raw cleanup after a partial mixed write and retries the fixed before target", async () => {
    let calls = 0;
    const h = host({ "a.md": markdown(["Old", "KeepCase", "KeepCase"]) }, () => { throw new Error("frontmatter rejected"); });
    const original = h.contents.get("a.md")!;
    h.intercept(() => { if (++calls === 3) throw new Error("reverse inline failed"); });
    const result = await h.executor.execute(buildSelectedCleanupPlan(await review(h)), 20);
    expect(result.status).toBe("recoveryRequired");
    expect(result.record?.recoveryTarget).toBe("before");
    expect(result.record?.files[0].recoveryState).toBe("bodyChanged");
    h.intercept(undefined);
    const recoveredLog = new OperationLog(JSON.parse(JSON.stringify(h.operationLog.toJSON())));
    const recovery = new CleanupRecoveryService({ ...h, operationLog: recoveredLog });
    expect((await recovery.retryRecovery()).status).toBe("removed");
    expect(h.contents.get("a.md")).toBe(original);
  });

  it("persists no Markdown writes when raw cleanup intent saving fails", async () => {
    const h = host({ "a.md": markdown(["Old"]) });
    h.persist.mockRejectedValueOnce(new Error("disk failure"));
    await expect(h.executor.execute(buildSelectedCleanupPlan(await review(h)), 20)).rejects.toThrow("disk failure");
    expect(h.writes).toEqual([]);
    expect(h.operationLog.latestUnresolvedCleanup()?.files[0]).toMatchObject({ tagValueVersion: 1 });
  });

  it("rechecks health capability instead of accepting an executable-looking manual review item", async () => {
    const readOccurrences = vi.fn();
    const builder = new CleanupReviewPlanBuilder({ readOccurrences });
    await expect(builder.build({
      id: "x", title: "x", issueType: "overBroad", action: "rename", tags: ["Old"], targetTag: "New", rationale: "x", affectedFileCount: 1,
      capability: { kind: "renameTag", availability: "executable", riskLevel: "medium", requiresTargetTag: true, requiresFilePreview: true, supportsBatch: false, defaultSelected: true },
      files: [{ path: "a.md", beforeTags: ["Old"], afterTags: ["New"] }]
    })).rejects.toThrow("does not authorize");
    expect(readOccurrences).not.toHaveBeenCalled();
  });
});

describe("raw folder batch propagation", () => {
  it("persists raw intent before writes and undoes without normalizing untouched tags", async () => {
    const h = host({ "a.md": markdown(["KeepCase", "KeepCase"]) });
    h.persist.mockImplementation(async () => {
      if (h.operationLog.latestBatch()?.status === "applying") {
        expect(h.writes).toEqual([]);
        expect(h.operationLog.latestBatch()?.files[0]).toMatchObject({ tagValueVersion: 1 });
      }
    });
    const plan = await additivePlan(h.contents.get("a.md")!);
    expect((await h.batchExecutor.execute(batch(), [plan], 20)).status).toBe("applied");
    expect((await h.batchRecovery.undoLatestAppliedBatch()).status).toBe("removed");
    expect(captureTagValueSnapshot(h.contents.get("a.md")!)).toEqual(list("KeepCase", "KeepCase"));
    expect(h.operationLog.receiptsToJSON()[0]?.status).toBe("undone");
  });

  it("refuses malformed or normalization-only raw patches", async () => {
    const plan = await additivePlan(markdown(["KeepCase", "KeepCase"]));
    plan.tagValuePatch!.after = list("keepcase", "new");
    expect(() => validateFolderBatchChangePlans([plan])).toThrow("raw patch");
  });

  it("returns raw conflict after reload rather than treating same-key values as restored", async () => {
    const h = host({ "a.md": markdown(["KeepCase", "KeepCase"]) });
    await h.batchExecutor.execute(batch(), [await additivePlan(h.contents.get("a.md")!)], 20);
    h.contents.set("a.md", h.contents.get("a.md")!.replaceAll("KeepCase", "KEEPCASE"));
    const before = h.writes.length;
    expect((await h.batchRecovery.undoLatestAppliedBatch()).status).toBe("conflict");
    expect(h.writes).toHaveLength(before);
  });

  it("hydrates batch raw state from Markdown, not stale inventory", async () => {
    const content = markdown(["KeepCase", "KeepCase"]);
    const recommendForNote = vi.fn(async () => ({ recommendations: [] }) as never);
    const runner = new FolderBatchRecommendationRunner({
      readNote: async () => ({ path: "a.md", content, sourceContentHash: await hashContent(content), frontmatterTags: ["stale"], inlineTags: ["new"], allTags: ["stale", "new"] }),
      recommendForNote, inlineSyncReason: "sync"
    });
    const result = await runner.run(batch(), index);
    expect(result.policyRevision).toBe(3);
    expect(result.items[0].tagValueSnapshot).toEqual(list("KeepCase", "KeepCase"));
    expect(deriveChangePlans(result)[0].tagValuePatch?.after).toEqual(list("KeepCase", "KeepCase", "new"));
  });

  it("does not send scalar notes to the batch provider", async () => {
    const content = "---\ntags: Old\n---\n#new";
    const recommendForNote = vi.fn();
    const runner = new FolderBatchRecommendationRunner({
      readNote: async () => ({ path: "a.md", content, sourceContentHash: await hashContent(content), frontmatterTags: ["old"], inlineTags: ["new"], allTags: ["old", "new"] }),
      recommendForNote, inlineSyncReason: "sync"
    });
    const result = await runner.run(batch(), index);
    expect(result.items[0].planStatus).toBe("unavailable");
    expect(result.items[0].tagValueError).toContain("Scalar");
    expect(recommendForNote).not.toHaveBeenCalled();
    expect(deriveChangePlans(result)).toEqual([]);
  });

  it("compensates all raw writes, including an uncertain post-write rejection", async () => {
    const h = host({ "a.md": markdown(["KeepCase", "KeepCase"]) });
    const plan = await additivePlan(h.contents.get("a.md")!);
    let once = true;
    const apply = h.writer.replaceTagsIfSnapshotMatches.bind(h.writer);
    vi.spyOn(h.writer, "replaceTagsIfSnapshotMatches").mockImplementation(async (...args) => {
      const change = await apply(...args);
      if (once) { once = false; throw new Error("write acknowledgement lost"); }
      return change;
    });
    expect((await h.batchExecutor.execute(batch(), [plan], 20)).status).toBe("rolledBack");
    expect(captureTagValueSnapshot(h.contents.get("a.md")!)).toEqual(list("KeepCase", "KeepCase"));
    expect(h.operationLog.latestBatch()).toBeUndefined();
  });

  it("retains an uncertain raw write as recoveryRequired when compensation fails", async () => {
    const h = host({ "a.md": markdown(["KeepCase"]) });
    const plan = await additivePlan(h.contents.get("a.md")!);
    const apply = h.writer.replaceTagsIfSnapshotMatches.bind(h.writer);
    let once = true;
    const spy = vi.spyOn(h.writer, "replaceTagsIfSnapshotMatches").mockImplementation(async (...args) => {
      if (once) { once = false; await apply(...args); }
      throw new Error("write failed");
    });
    const result = await h.batchExecutor.execute(batch(), [plan], 20);
    expect(result.status).toBe("recoveryRequired");
    expect(result.record?.files[0].afterContentHash).toBe(await hashContent(h.contents.get("a.md")!));
    spy.mockRestore();
    const recoveredLog = new OperationLog(JSON.parse(JSON.stringify(h.operationLog.toJSON())));
    expect((await new FolderBatchRecoveryService({ ...h, operationLog: recoveredLog }).retryRecovery()).status).toBe("removed");
    expect(captureTagValueSnapshot(h.contents.get("a.md")!)).toEqual(list("KeepCase"));
  });

  it("accepts a canonical before image during retry but rejects changes to other content", async () => {
    const h = host({ "a.md": markdown(["KeepCase"]) });
    const plan = await additivePlan(h.contents.get("a.md")!);
    await h.batchExecutor.execute(batch(), [plan], 20);
    const record = h.operationLog.latestBatch()!;
    h.operationLog.setBatchRecoveryTarget(record.id, "before");
    h.contents.set("a.md", applyTagValuePatch(h.contents.get("a.md")!, { before: plan.tagValuePatch!.after, after: plan.tagValuePatch!.before }));
    expect(await hashContent(h.contents.get("a.md")!)).not.toBe(plan.sourceContentHash);
    const canonicalBefore = h.contents.get("a.md")!;
    h.contents.set("a.md", canonicalBefore.replace("Keep me", "Changed title"));
    expect((await h.batchRecovery.retryRecovery()).status).toBe("conflict");
    h.contents.set("a.md", canonicalBefore);
    expect((await h.batchRecovery.retryRecovery()).status).toBe("removed");
  });

  it("requires raw metadata on new batch plans and writes nothing if intent saving fails", async () => {
    const h = host({ "a.md": markdown(["KeepCase"]) });
    const plan = await additivePlan(h.contents.get("a.md")!);
    await expect(h.batchExecutor.execute(batch(), [{ ...plan, tagValuePatch: undefined, tagValueVersion: undefined }], 20)).rejects.toThrow("require raw");
    h.persist.mockRejectedValueOnce(new Error("intent failure"));
    await expect(h.batchExecutor.execute(batch(), [plan], 20)).rejects.toThrow("intent failure");
    expect(h.writes).toEqual([]);
    expect(h.operationLog.latestUnresolvedBatch()).toBeDefined();
  });

  it("labels compensation after applied-state persistence failure as rolledBack", async () => {
    const h = host({ "a.md": markdown(["KeepCase"]) });
    let saves = 0;
    h.persist.mockImplementation(async () => { if (++saves === 2) throw new Error("applied state not saved"); });
    expect((await h.batchExecutor.execute(batch(), [await additivePlan(h.contents.get("a.md")!)], 20)).status).toBe("rolledBack");
    expect(h.operationLog.receiptsToJSON()[0]?.status).toBe("rolledBack");
    expect(captureTagValueSnapshot(h.contents.get("a.md")!)).toEqual(list("KeepCase"));
  });
});
