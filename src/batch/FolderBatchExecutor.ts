// Applies a reviewed folder batch as a compensating transaction with full preflight and per-file CAS.
import type { TFile } from "obsidian";
import type { FrontmatterSnapshot, FrontmatterTagChange } from "../obsidian/FrontmatterWriter";
import { SnapshotConflictError } from "../obsidian/FrontmatterWriter";
import type { OperationLog, BatchFileChange, BatchOperationRecord } from "../operations/OperationLog";
import type { ChangePlan } from "../preview/ChangePlan";
import { normalizeTag } from "../utils/normalizeTag";
import type { FolderBatchPlan, FolderBatchConflict } from "./FolderBatchPlan";

export interface FolderBatchExecutorWriter {
  checkSnapshot(file: TFile, snapshot: FrontmatterSnapshot): Promise<void>;
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

  async execute(
    batchPlan: FolderBatchPlan,
    changePlans: ChangePlan[],
    operationLogLimit: number
  ): Promise<FolderBatchExecutionResult> {
    const plans = [...changePlans].sort((left, right) => left.notePath.localeCompare(right.notePath));
    validateFolderBatchChangePlans(plans);

    const resolved = plans.map((plan) => ({ plan, file: this.dependencies.findFile(plan.notePath) }));
    const conflicts: FolderBatchExecutionConflict[] = [];
    for (const target of resolved) {
      if (!target.file) {
        conflicts.push({ notePath: target.plan.notePath, kind: "missing" });
        continue;
      }
      try {
        await this.dependencies.writer.checkSnapshot(target.file, snapshotFor(target.plan));
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
        files: plans.map(batchFileFromPlan)
      },
      operationLogLimit
    );
    await this.dependencies.persist();

    const written: Array<{ plan: ChangePlan; file: TFile; afterContentHash: string }> = [];
    try {
      for (const target of resolved) {
        const file = target.file!;
        const change = await this.dependencies.writer.replaceTagsIfSnapshotMatches(
          file,
          snapshotFor(target.plan),
          target.plan.afterTags
        );
        written.push({
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
          await this.dependencies.writer.replaceTagsIfSnapshotMatches(
            entry.file,
            { beforeTags: entry.plan.afterTags, sourceContentHash: entry.afterContentHash },
            entry.plan.beforeTags
          );
        } catch {
          compensationFailed = true;
        }
      }

      if (!compensationFailed) {
        this.dependencies.operationLog.remove(record.id);
        await this.dependencies.persist();
        return { status: "rolledBack", conflicts: [], error: errorMessage(error) };
      }

      const recoveredFiles = record.files.map((file) => ({
        ...file,
        recoveryState: classifyCurrentTags(this.dependencies.findFile(file.notePath), file, this.dependencies.writer)
      }));
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

export function validateFolderBatchChangePlans(plans: ChangePlan[]): void {
  if (plans.length === 0) {
    throw new UnsafeBatchPlanError("A folder batch must contain at least one selected change plan.");
  }
  for (const plan of plans) {
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
  return { beforeTags: plan.beforeTags, sourceContentHash: plan.sourceContentHash };
}

function batchFileFromPlan(plan: ChangePlan): BatchFileChange {
  return {
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

function classifyCurrentTags(
  file: TFile | null,
  change: BatchFileChange,
  writer: FolderBatchExecutorWriter
): BatchFileChange["recoveryState"] {
  if (!file) {
    return "missing";
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
