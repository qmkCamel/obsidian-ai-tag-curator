// Applies a reviewed folder batch as a compensating transaction with full preflight and per-file CAS.
import type { TFile } from "obsidian";
import type { FrontmatterSnapshot, FrontmatterTagChange } from "../obsidian/FrontmatterWriter";
import { SnapshotConflictError } from "../obsidian/FrontmatterWriter";
import type { OperationLog, BatchFileChange, BatchOperationRecord } from "../operations/OperationLog";
import type { ChangePlan } from "../preview/ChangePlan";
import { normalizeTag } from "../utils/normalizeTag";
import type { FolderBatchPlan, FolderBatchConflict } from "./FolderBatchPlan";
import { createAdditiveTagValuePatch, exactTagValuePatch, normalizedSnapshotTags, reverseTagValueFields, sameTagValue, tagValueFields, type TagValueSnapshot } from "../obsidian/TagValuePatch";

export interface FolderBatchExecutorWriter {
  readTagValueSnapshot?(file: TFile): Promise<TagValueSnapshot>;
  readSnapshot?(file: TFile): Promise<FrontmatterSnapshot>;
  checkSnapshot(file: TFile, snapshot: FrontmatterSnapshot): Promise<FrontmatterTagChange | void>;
  replaceTagsIfSnapshotMatches(
    file: TFile,
    snapshot: FrontmatterSnapshot,
    nextTags: string[]
  ): Promise<FrontmatterTagChange>;
  readCurrentTags(file: TFile): string[];
}

export interface FolderBatchExecutorDependencies {
  findFile(notePath: string): TFile | null;
  writer: FolderBatchExecutorWriter;
  operationLog: OperationLog;
  persist(): Promise<void>;
  refreshIndex(): Promise<void>;
}

export interface FolderBatchExecutionConflict {
  notePath: string;
  kind: FolderBatchConflict;
}

export interface FolderBatchExecutionResult {
  status: "applied" | "conflict" | "rolledBack" | "recoveryRequired";
  conflicts: FolderBatchExecutionConflict[];
  record?: BatchOperationRecord;
  error?: string;
  indexRefreshError?: string;
}

export class UnsafeBatchPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeBatchPlanError";
  }
}

export class FolderBatchExecutor {
  constructor(private readonly dependencies: FolderBatchExecutorDependencies) {}

  /**
   * Applies reviewed plans as a compensating transaction: full preflight, persisted intent,
   * per-file CAS, then reverse-order compensation if any write fails.
   */
  async execute(
    batchPlan: FolderBatchPlan,
    changePlans: ChangePlan[],
    operationLogLimit: number
  ): Promise<FolderBatchExecutionResult> {
    return this.dependencies.operationLog.runMutation(() => this.executeLocked(batchPlan, changePlans, operationLogLimit));
  }

  private async executeLocked(
    batchPlan: FolderBatchPlan,
    changePlans: ChangePlan[],
    operationLogLimit: number
  ): Promise<FolderBatchExecutionResult> {
    const plans = [...changePlans].sort((left, right) => left.notePath.localeCompare(right.notePath));
    validateFolderBatchChangePlans(plans);
    if ((batchPlan.policyRevision !== undefined || batchPlan.origin) && plans.some((plan) => !exactTagValuePatch(plan))) {
      throw new UnsafeBatchPlanError("New batch plans require raw tag snapshots.");
    }

    const resolved = plans.map((plan) => ({ plan, file: this.dependencies.findFile(plan.notePath) }));
    const conflicts: FolderBatchExecutionConflict[] = [];
    const preparedHashes = new Map<string, string>();
    for (const target of resolved) {
      if (!target.file) {
        conflicts.push({ notePath: target.plan.notePath, kind: "missing" });
        continue;
      }
      try {
        const checked = await this.dependencies.writer.checkSnapshot(target.file, snapshotFor(target.plan));
        if (exactTagValuePatch(target.plan) && !checked?.afterContentHash) throw new UnsafeBatchPlanError("Raw writes require a prepared after-content hash.");
        if (checked?.afterContentHash) preparedHashes.set(target.plan.notePath, checked.afterContentHash);
      } catch (error) {
        conflicts.push({ notePath: target.plan.notePath, kind: conflictKind(error) });
      }
    }
    if (conflicts.length > 0) {
      return { status: "conflict", conflicts };
    }

    const record = this.dependencies.operationLog.addBatchIntent(
      {
        folderPath: batchPlan.folderPath,
        includeSubfolders: batchPlan.includeSubfolders,
        indexUpdatedAt: batchPlan.indexUpdatedAt,
        settings: batchPlan.settings,
        ...(batchPlan.origin ? { origin: batchPlan.origin } : {}),
        ...(batchPlan.policyRevision === undefined ? {} : { policyRevision: batchPlan.policyRevision }),
        files: plans.map((plan) => ({ ...batchFileFromPlan(plan), afterContentHash: preparedHashes.get(plan.notePath) }))
      },
      operationLogLimit
    );
    await this.dependencies.persist();

    const written: Array<{ plan: ChangePlan; file: TFile; afterContentHash: string }> = [];
    try {
      for (const target of resolved) {
        const file = target.file!;
        const raw = exactTagValuePatch(target.plan);
        const attempt = { plan: target.plan, file, afterContentHash: preparedHashes.get(target.plan.notePath) ?? target.plan.sourceContentHash };
        if (raw) written.push(attempt);
        const change = await this.dependencies.writer.replaceTagsIfSnapshotMatches(
          file,
          snapshotFor(target.plan),
          target.plan.afterTags
        );
        if (raw) attempt.afterContentHash = change.afterContentHash ?? attempt.afterContentHash;
        else written.push({
          plan: target.plan,
          file,
          afterContentHash: change.afterContentHash ?? target.plan.sourceContentHash
        });
      }

      const files = record.files.map((file) => ({
        ...file,
        afterContentHash: written.find((entry) => entry.plan.notePath === file.notePath)?.afterContentHash
      }));
      this.dependencies.operationLog.updateBatchFiles(record.id, files);
      const applied = this.dependencies.operationLog.updateBatchStatus(record.id, "applied")!;
      await this.dependencies.persist();
      const indexRefreshError = await this.refreshIndexSafely();
      return { status: "applied", conflicts: [], record: applied, indexRefreshError };
    } catch (error) {
      let compensationFailed = false;
      for (const entry of [...written].reverse()) {
        try {
          const patch = exactTagValuePatch(entry.plan);
          if (patch) {
            const current = await this.dependencies.writer.readSnapshot?.(entry.file);
            if (current && sameTagValue(current.tagValueSnapshot, patch.before) && current.sourceContentHash === entry.plan.sourceContentHash) continue;
          }
          await this.dependencies.writer.replaceTagsIfSnapshotMatches(
            entry.file,
            { beforeTags: entry.plan.afterTags, sourceContentHash: entry.afterContentHash, ...reverseTagValueFields(entry.plan) },
            entry.plan.beforeTags
          );
        } catch {
          compensationFailed = true;
        }
      }

      if (!compensationFailed) {
        await this.dependencies.operationLog.removeAndPersist(record.id, () => this.dependencies.persist(), { status: "rolledBack" });
        return { status: "rolledBack", conflicts: [], error: errorMessage(error) };
      }

      const recoveredFiles = await Promise.all(record.files.map(async (file) => ({
        ...file,
        recoveryState: await classifyCurrentTags(this.dependencies.findFile(file.notePath), file, this.dependencies.writer)
      })));
      const recoveryRecord = this.dependencies.operationLog.setBatchRecoveryTarget(record.id, "before", recoveredFiles)!;
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

  private async refreshIndexSafely(): Promise<string | undefined> {
    try {
      await this.dependencies.refreshIndex();
      return undefined;
    } catch (error) {
      return errorMessage(error);
    }
  }
}

/** Defense-in-depth validation that rejects removal, replacement, unselected additions, and empty writes. */
export function validateFolderBatchChangePlans(plans: ChangePlan[]): void {
  if (plans.length === 0) {
    throw new UnsafeBatchPlanError("A folder batch must contain at least one selected change plan.");
  }
  const paths = new Set<string>();
  for (const plan of plans) {
    if (!plan.notePath || paths.has(plan.notePath)) throw new UnsafeBatchPlanError("Batch paths must be non-empty and unique.");
    paths.add(plan.notePath);
    const raw = exactTagValuePatch(plan);
    if (raw && (!sameTagValue(raw.after, createAdditiveTagValuePatch(raw.before, [...plan.syncedInlineTags, ...plan.aiAddedTags]).after) ||
        !sameTags(plan.beforeTags, normalizedSnapshotTags(raw.before)) || !sameTags(plan.afterTags, normalizedSnapshotTags(raw.after)))) {
      throw new UnsafeBatchPlanError(`${plan.notePath}: raw patch is not the selected additive change.`);
    }
    const before = new Set(plan.beforeTags.map(normalizeTag).filter(Boolean));
    const after = new Set(plan.afterTags.map(normalizeTag).filter(Boolean));
    const allowedAdded = new Set([...plan.syncedInlineTags, ...plan.aiAddedTags].map(normalizeTag).filter(Boolean));

    if ([...before].some((tag) => !after.has(tag))) {
      throw new UnsafeBatchPlanError(`${plan.notePath}: batch plans may not remove or replace tags.`);
    }
    const actualAdded = [...after].filter((tag) => !before.has(tag));
    if (actualAdded.some((tag) => !allowedAdded.has(tag)) || [...allowedAdded].some((tag) => !actualAdded.includes(tag))) {
      throw new UnsafeBatchPlanError(`${plan.notePath}: added tags must come from explicitly selected candidates.`);
    }
    if (actualAdded.length === 0) {
      throw new UnsafeBatchPlanError(`${plan.notePath}: empty change plans are not writable.`);
    }
  }
}

function snapshotFor(plan: ChangePlan): FrontmatterSnapshot {
  return { beforeTags: plan.beforeTags, sourceContentHash: plan.sourceContentHash, ...tagValueFields(exactTagValuePatch(plan)) };
}

function batchFileFromPlan(plan: ChangePlan): BatchFileChange {
  return {
    ...tagValueFields(exactTagValuePatch(plan)),
    notePath: plan.notePath,
    beforeTags: [...plan.beforeTags],
    afterTags: [...plan.afterTags],
    syncedInlineTags: [...plan.syncedInlineTags],
    aiAddedTags: [...plan.aiAddedTags],
    sourceContentHash: plan.sourceContentHash
  };
}

function conflictKind(error: unknown): FolderBatchConflict {
  return error instanceof SnapshotConflictError ? error.kind : "contentChanged";
}

async function classifyCurrentTags(
  file: TFile | null,
  change: BatchFileChange,
  writer: FolderBatchExecutorWriter
): Promise<BatchFileChange["recoveryState"]> {
  if (!file) {
    return "missing";
  }
  try {
    const patch = exactTagValuePatch(change);
    if (patch) {
      const current = await writer.readTagValueSnapshot?.(file);
      if (sameTagValue(current, patch.before)) return "before";
      if (sameTagValue(current, patch.after)) return "after";
      return "conflict";
    }
  } catch {
    return "conflict";
  }
  const current = writer.readCurrentTags(file);
  if (sameTags(current, change.beforeTags)) {
    return "before";
  }
  if (sameTags(current, change.afterTags)) {
    return "after";
  }
  return "conflict";
}

function sameTags(left: string[], right: string[]): boolean {
  const leftSet = new Set(left.map(normalizeTag).filter(Boolean));
  const rightSet = new Set(right.map(normalizeTag).filter(Boolean));
  return leftSet.size === rightSet.size && [...leftSet].every((tag) => rightSet.has(tag));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
