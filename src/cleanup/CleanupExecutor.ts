// Executes a reviewed cleanup as one compensating transaction across inline tokens and frontmatter tags.
import type { TFile } from "obsidian";
import type {
  FrontmatterSnapshot,
  FrontmatterTagChange
} from "../obsidian/FrontmatterWriter";
import { SnapshotConflictError } from "../obsidian/FrontmatterWriter";
import type {
  InlineTagSnapshot,
  InlineTagWritePatch,
  InlineTagWriteResult
} from "../obsidian/InlineTagWriter";
import { InlineTagWriteError, createReverseInlineTagWritePatch } from "../obsidian/InlineTagWriter";
import type {
  CleanupFileChangeV2,
  CleanupOperationRecordV2,
  OperationLog
} from "../operations/OperationLog";
import { normalizeTag } from "../utils/normalizeTag";
import type {
  CleanupReviewConflictKind,
  SelectedCleanupFilePatch,
  SelectedCleanupPlan
} from "./CleanupReviewPlan";
import { validateCleanupReviewIdentity } from "./CleanupReviewPlan";

export interface CleanupInlineWriter {
  checkPatch(file: TFile, patch: InlineTagWritePatch): Promise<InlineTagWriteResult>;
  apply(file: TFile, patch: InlineTagWritePatch): Promise<InlineTagWriteResult>;
  readSnapshot(file: TFile): Promise<InlineTagSnapshot>;
}

export interface CleanupFrontmatterWriter {
  checkSnapshot(file: TFile, snapshot: FrontmatterSnapshot): Promise<void>;
  readCurrentTags(file: TFile): string[];
  replaceTagsIfSnapshotMatches(
    file: TFile,
    snapshot: FrontmatterSnapshot,
    nextTags: string[]
  ): Promise<FrontmatterTagChange>;
}

export interface CleanupExecutorDependencies {
  findFile(notePath: string): TFile | null;
  inlineWriter: CleanupInlineWriter;
  frontmatterWriter: CleanupFrontmatterWriter;
  operationLog: OperationLog;
  persist(): Promise<void>;
  refreshIndex(): Promise<void>;
}

export interface CleanupExecutionConflict {
  notePath: string;
  kind: CleanupReviewConflictKind;
}

export interface CleanupExecutionResult {
  status: "applied" | "conflict" | "rolledBack" | "recoveryRequired";
  conflicts: CleanupExecutionConflict[];
  record?: CleanupOperationRecordV2;
  error?: string;
  indexRefreshError?: string;
}

export class UnsafeCleanupPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeCleanupPlanError";
  }
}

interface PreparedCleanupTarget {
  patch: SelectedCleanupFilePatch;
  file: TFile;
  afterBodyHash: string;
}

export class CleanupExecutor {
  constructor(private readonly dependencies: CleanupExecutorDependencies) {}

  async execute(plan: SelectedCleanupPlan, operationLogLimit: number): Promise<CleanupExecutionResult> {
    validateSelectedCleanupPlan(plan);
    const orderedPatches = [...plan.files].sort((left, right) => left.notePath.localeCompare(right.notePath));
    const resolved = orderedPatches.map((patch) => ({ patch, file: this.dependencies.findFile(patch.notePath) }));
    const conflicts: CleanupExecutionConflict[] = [];
    const prepared: PreparedCleanupTarget[] = [];

    for (const target of resolved) {
      if (!target.file) {
        conflicts.push({ notePath: target.patch.notePath, kind: "missing" });
        continue;
      }
      try {
        await this.dependencies.frontmatterWriter.checkSnapshot(target.file, {
          beforeTags: target.patch.beforeTags,
          sourceContentHash: target.patch.sourceContentHash
        });
        let afterBodyHash = target.patch.beforeBodyHash;
        if (target.patch.inlineEdits.length > 0) {
          const checked = await this.dependencies.inlineWriter.checkPatch(target.file, inlinePatchFor(target.patch));
          afterBodyHash = checked.afterBodyHash;
        }
        prepared.push({ patch: target.patch, file: target.file, afterBodyHash });
      } catch (error) {
        conflicts.push({ notePath: target.patch.notePath, kind: cleanupConflictKind(error) });
      }
    }

    if (conflicts.length > 0) {
      return { status: "conflict", conflicts };
    }

    const record = this.dependencies.operationLog.addCleanupIntent(
      {
        itemId: plan.itemId,
        title: plan.title,
        action: plan.action,
        sourceTags: [...plan.sourceTags],
        targetTag: plan.targetTag,
        partial: plan.partial,
        files: prepared.map((target) => cleanupFileFromPrepared(target))
      },
      operationLogLimit
    );
    await this.dependencies.persist();

    const attempted: PreparedCleanupTarget[] = [];
    const afterContentHashes = new Map<string, string>();
    try {
      for (const target of prepared) {
        attempted.push(target);
        let currentContentHash = target.patch.sourceContentHash;
        if (target.patch.inlineEdits.length > 0) {
          const inlineResult = await this.dependencies.inlineWriter.apply(target.file, inlinePatchFor(target.patch));
          currentContentHash = inlineResult.afterContentHash;
        }
        if (!sameTags(target.patch.beforeTags, target.patch.afterTags)) {
          const frontmatterResult = await this.dependencies.frontmatterWriter.replaceTagsIfSnapshotMatches(
            target.file,
            { beforeTags: target.patch.beforeTags, sourceContentHash: currentContentHash },
            target.patch.afterTags
          );
          currentContentHash = frontmatterResult.afterContentHash ?? currentContentHash;
        }
        afterContentHashes.set(target.patch.notePath, currentContentHash);
      }

      const files = record.files.map((file) => ({
        ...file,
        afterContentHash: afterContentHashes.get(file.notePath),
        recoveryState: "after" as const
      }));
      this.dependencies.operationLog.updateCleanupFiles(record.id, files);
      const applied = this.dependencies.operationLog.updateCleanupStatus(record.id, "applied")!;
      await this.dependencies.persist();
      const indexRefreshError = await this.refreshIndexSafely();
      return { status: "applied", conflicts: [], record: applied, indexRefreshError };
    } catch (error) {
      let compensationFailed = false;
      for (const target of [...attempted].reverse()) {
        try {
          await this.compensateToBefore(target);
        } catch {
          compensationFailed = true;
        }
      }

      if (!compensationFailed) {
        this.dependencies.operationLog.remove(record.id);
        await this.dependencies.persist();
        return { status: "rolledBack", conflicts: [], error: errorMessage(error) };
      }

      const classified = await Promise.all(record.files.map((file) => this.classifyForRecord(file)));
      const recoveryRecord = this.dependencies.operationLog.setCleanupRecoveryTarget(record.id, "before", classified)!;
      await this.dependencies.persist();
      const indexRefreshError = await this.refreshIndexSafely();
      return {
        status: "recoveryRequired",
        conflicts: [],
        record: recoveryRecord,
        error: errorMessage(error),
        indexRefreshError
      };
    }
  }

  private async compensateToBefore(target: PreparedCleanupTarget): Promise<void> {
    const currentTags = this.dependencies.frontmatterWriter.readCurrentTags(target.file);
    const currentInline = await this.dependencies.inlineWriter.readSnapshot(target.file);
    if (!sameTags(currentTags, target.patch.beforeTags) && !sameTags(currentTags, target.patch.afterTags)) {
      throw new Error("Frontmatter tags conflict with both cleanup snapshots.");
    }
    if (currentInline.bodyHash !== target.patch.beforeBodyHash && currentInline.bodyHash !== target.afterBodyHash) {
      throw new Error("Note body conflicts with both cleanup snapshots.");
    }

    let currentContentHash = currentInline.contentHash;
    if (sameTags(currentTags, target.patch.afterTags) && !sameTags(target.patch.beforeTags, target.patch.afterTags)) {
      const restored = await this.dependencies.frontmatterWriter.replaceTagsIfSnapshotMatches(
        target.file,
        { beforeTags: target.patch.afterTags, sourceContentHash: currentContentHash },
        target.patch.beforeTags
      );
      currentContentHash = restored.afterContentHash ?? currentContentHash;
    }
    if (currentInline.bodyHash === target.afterBodyHash && target.patch.inlineEdits.length > 0) {
      await this.dependencies.inlineWriter.apply(
        target.file,
        createReverseInlineTagWritePatch(target.patch.inlineEdits, currentContentHash, target.afterBodyHash)
      );
    }
  }

  private async classifyForRecord(change: CleanupFileChangeV2): Promise<CleanupFileChangeV2> {
    const file = this.dependencies.findFile(change.notePath);
    if (!file) return { ...change, recoveryState: "missing" };
    try {
      const tags = this.dependencies.frontmatterWriter.readCurrentTags(file);
      const inline = await this.dependencies.inlineWriter.readSnapshot(file);
      return { ...change, recoveryState: classifyCleanupFileState(tags, inline.bodyHash, change) };
    } catch {
      return { ...change, recoveryState: "conflict" };
    }
  }

  private async refreshIndexSafely(): Promise<string | undefined> {
    try {
      await this.dependencies.refreshIndex();
      return undefined;
    } catch (error) {
      return errorMessage(error);
    }
  }
}

export function validateSelectedCleanupPlan(plan: SelectedCleanupPlan): void {
  validateCleanupReviewIdentity(plan.action, plan.sourceTags, plan.targetTag);
  if (plan.files.length === 0) throw new UnsafeCleanupPlanError("At least one selected cleanup change is required.");
  const sourceSet = new Set(plan.sourceTags.map(normalizeTag).filter(Boolean));
  const targetTag = normalizeTag(plan.targetTag);
  sourceSet.delete(targetTag);
  const paths = new Set<string>();

  for (const file of plan.files) {
    if (!file.notePath || paths.has(file.notePath)) {
      throw new UnsafeCleanupPlanError("Cleanup file paths must be non-empty and unique.");
    }
    paths.add(file.notePath);
    const frontmatterChanged = !sameTags(file.beforeTags, file.afterTags);
    if (!frontmatterChanged && file.inlineEdits.length === 0) {
      throw new UnsafeCleanupPlanError(`${file.notePath}: empty cleanup patches are not writable.`);
    }
    if (frontmatterChanged && !sameTags(file.afterTags, transformTags(file.beforeTags, sourceSet, targetTag))) {
      throw new UnsafeCleanupPlanError(`${file.notePath}: frontmatter changes do not match the reviewed cleanup identity.`);
    }
    for (const edit of file.inlineEdits) {
      if (!sourceSet.has(normalizeTag(edit.beforeText)) || normalizeTag(edit.afterText) !== targetTag) {
        throw new UnsafeCleanupPlanError(`${file.notePath}: inline edits do not match the reviewed cleanup identity.`);
      }
    }
  }
}

export function classifyCleanupFileState(
  currentTags: string[],
  currentBodyHash: string,
  change: CleanupFileChangeV2
): CleanupFileChangeV2["recoveryState"] {
  const tagsBefore = sameTags(currentTags, change.beforeTags);
  const tagsAfter = sameTags(currentTags, change.afterTags);
  const bodyBefore = currentBodyHash === change.beforeBodyHash;
  const bodyAfter = currentBodyHash === change.afterBodyHash;
  if (tagsBefore && bodyBefore) return "before";
  if (tagsAfter && bodyAfter) return "after";
  if (tagsBefore && bodyAfter && !bodyBefore) return "bodyChanged";
  return "conflict";
}

function inlinePatchFor(patch: SelectedCleanupFilePatch): InlineTagWritePatch {
  return {
    expectedContentHash: patch.sourceContentHash,
    expectedBodyHash: patch.beforeBodyHash,
    edits: patch.inlineEdits
  };
}

function cleanupFileFromPrepared(target: PreparedCleanupTarget): CleanupFileChangeV2 {
  return {
    notePath: target.patch.notePath,
    beforeTags: [...target.patch.beforeTags],
    afterTags: [...target.patch.afterTags],
    sourceContentHash: target.patch.sourceContentHash,
    beforeBodyHash: target.patch.beforeBodyHash,
    afterBodyHash: target.afterBodyHash,
    inlineEdits: target.patch.inlineEdits.map((edit) => ({ ...edit })),
    recoveryState: "before"
  };
}

function transformTags(currentTags: string[], sourceSet: Set<string>, targetTag: string): string[] {
  const result: string[] = [];
  let insertedTarget = false;
  for (const rawTag of currentTags) {
    const tag = normalizeTag(rawTag);
    if (!sourceSet.has(tag)) {
      if (tag && !result.includes(tag)) result.push(tag);
      continue;
    }
    if (!insertedTarget && !result.includes(targetTag)) {
      result.push(targetTag);
      insertedTarget = true;
    }
  }
  return result;
}

function cleanupConflictKind(error: unknown): CleanupReviewConflictKind {
  if (error instanceof SnapshotConflictError) return error.kind;
  if (error instanceof InlineTagWriteError) return error.kind === "tokenChanged" ? "tokenChanged" : "contentChanged";
  return "contentChanged";
}

function sameTags(left: string[], right: string[]): boolean {
  const leftSet = new Set(left.map(normalizeTag).filter(Boolean));
  const rightSet = new Set(right.map(normalizeTag).filter(Boolean));
  return leftSet.size === rightSet.size && [...leftSet].every((tag) => rightSet.has(tag));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
