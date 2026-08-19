// Persists recommendation, cleanup, and batch transaction records for undo and crash recovery.
import type { TagHealthSuggestion } from "../health/TagHealthReport";
import type { ChangePlan } from "../preview/ChangePlan";
import type { FolderBatchSettingsSnapshot } from "../batch/FolderBatchPlan";
import type { CleanupReviewAction, InlineTextEdit } from "../cleanup/CleanupReviewPlan";

export interface RecommendationOperationRecord {
  id: string;
  type?: "recommendation";
  plan: ChangePlan;
}

export interface CleanupFileChange {
  notePath: string;
  beforeTags: string[];
  afterTags: string[];
}

export interface LegacyCleanupOperationRecord {
  id: string;
  type: "cleanup";
  itemId: string;
  title: string;
  action: TagHealthSuggestion;
  createdAt: string;
  files: CleanupFileChange[];
}

/** @deprecated Use LegacyCleanupOperationRecord when referring to the historical frontmatter-only schema. */
export type CleanupOperationRecord = LegacyCleanupOperationRecord;

export type CleanupOperationStatus = "applying" | "applied" | "undoing" | "recoveryRequired";
export type CleanupRecoveryTarget = "before" | "after";
export type CleanupFileRecoveryState = "before" | "bodyChanged" | "after" | "conflict" | "missing";

export interface CleanupFileChangeV2 {
  notePath: string;
  beforeTags: string[];
  afterTags: string[];
  sourceContentHash: string;
  beforeBodyHash: string;
  afterBodyHash: string;
  afterContentHash?: string;
  inlineEdits: InlineTextEdit[];
  recoveryState?: CleanupFileRecoveryState;
}

export interface CleanupOperationRecordV2 {
  id: string;
  type: "cleanup";
  schemaVersion: 2;
  status: CleanupOperationStatus;
  recoveryTarget?: CleanupRecoveryTarget;
  itemId: string;
  title: string;
  action: CleanupReviewAction;
  sourceTags: string[];
  targetTag: string;
  partial: boolean;
  createdAt: string;
  files: CleanupFileChangeV2[];
}

export type AnyCleanupOperationRecord = LegacyCleanupOperationRecord | CleanupOperationRecordV2;

export type BatchOperationStatus = "applying" | "applied" | "undoing" | "recoveryRequired";
export type BatchRecoveryTarget = "before" | "after";
export type BatchFileRecoveryState = "before" | "after" | "conflict" | "missing";

export interface BatchFileChange {
  notePath: string;
  beforeTags: string[];
  afterTags: string[];
  syncedInlineTags: string[];
  aiAddedTags: string[];
  sourceContentHash?: string;
  afterContentHash?: string;
  recoveryState?: BatchFileRecoveryState;
}

export interface BatchOperationRecord {
  id: string;
  type: "batch";
  status: BatchOperationStatus;
  recoveryTarget?: BatchRecoveryTarget;
  folderPath: string;
  includeSubfolders: boolean;
  indexUpdatedAt: string;
  settings: FolderBatchSettingsSnapshot;
  createdAt: string;
  files: BatchFileChange[];
}

export type OperationRecord = RecommendationOperationRecord | AnyCleanupOperationRecord | BatchOperationRecord;

export class OperationLog {
  private records: OperationRecord[];

  constructor(records: OperationRecord[] = []) {
    this.records = records.map(cloneOperationRecord);
  }

  add(plan: ChangePlan, limit: number): OperationRecord {
    const record: OperationRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      plan
    };

    this.records = [record, ...this.records].slice(0, limit);
    return record;
  }

  addCleanup(
    record: Omit<LegacyCleanupOperationRecord, "id" | "type" | "createdAt">,
    limit: number
  ): LegacyCleanupOperationRecord {
    const cleanupRecord: LegacyCleanupOperationRecord = {
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "cleanup",
      createdAt: new Date().toISOString()
    };

    this.records = [cleanupRecord, ...this.records].slice(0, limit);
    return cleanupRecord;
  }

  addCleanupIntent(
    record: Omit<CleanupOperationRecordV2, "id" | "type" | "schemaVersion" | "status" | "createdAt">,
    limit: number
  ): CleanupOperationRecordV2 {
    const cleanupRecord: CleanupOperationRecordV2 = {
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "cleanup",
      schemaVersion: 2,
      status: "applying",
      sourceTags: [...record.sourceTags],
      files: record.files.map(cloneCleanupFileV2),
      createdAt: new Date().toISOString()
    };
    this.records = [cleanupRecord, ...this.records].slice(0, limit);
    return cloneCleanupV2(cleanupRecord);
  }

  /** Records the complete applying intent before the first file write so reload recovery has a source of truth. */
  addBatchIntent(
    record: Omit<BatchOperationRecord, "id" | "type" | "status" | "createdAt">,
    limit: number
  ): BatchOperationRecord {
    const batchRecord: BatchOperationRecord = {
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "batch",
      status: "applying",
      createdAt: new Date().toISOString()
    };
    this.records = [batchRecord, ...this.records].slice(0, limit);
    return batchRecord;
  }

  updateBatchStatus(id: string, status: BatchOperationStatus): BatchOperationRecord | undefined {
    return this.updateBatch(id, (record) => ({ ...record, status }));
  }

  /** Persists the only allowed recovery direction together with the latest per-file classification. */
  setBatchRecoveryTarget(
    id: string,
    recoveryTarget: BatchRecoveryTarget,
    files?: BatchFileChange[]
  ): BatchOperationRecord | undefined {
    return this.updateBatch(id, (record) => ({
      ...record,
      status: "recoveryRequired",
      recoveryTarget,
      files: files ? files.map(cloneBatchFile) : record.files
    }));
  }

  updateBatchFiles(id: string, files: BatchFileChange[]): BatchOperationRecord | undefined {
    return this.updateBatch(id, (record) => ({ ...record, files: files.map(cloneBatchFile) }));
  }

  updateCleanupStatus(id: string, status: CleanupOperationStatus): CleanupOperationRecordV2 | undefined {
    return this.updateCleanupV2(id, (record) => ({ ...record, status }));
  }

  setCleanupRecoveryTarget(
    id: string,
    recoveryTarget: CleanupRecoveryTarget,
    files?: CleanupFileChangeV2[]
  ): CleanupOperationRecordV2 | undefined {
    return this.updateCleanupV2(id, (record) => ({
      ...record,
      status: "recoveryRequired",
      recoveryTarget,
      files: files ? files.map(cloneCleanupFileV2) : record.files
    }));
  }

  updateCleanupFiles(id: string, files: CleanupFileChangeV2[]): CleanupOperationRecordV2 | undefined {
    return this.updateCleanupV2(id, (record) => ({ ...record, files: files.map(cloneCleanupFileV2) }));
  }

  latestForPath(path: string): RecommendationOperationRecord | undefined {
    return this.records.find((record): record is RecommendationOperationRecord => isRecommendationRecord(record) && record.plan.notePath === path);
  }

  latestCleanup(): AnyCleanupOperationRecord | undefined {
    const record = this.records.find(isCleanupRecord);
    return record ? cloneCleanupRecord(record) : undefined;
  }

  latestCleanupV2(status?: CleanupOperationStatus): CleanupOperationRecordV2 | undefined {
    const record = this.records.find(
      (candidate): candidate is CleanupOperationRecordV2 =>
        isCleanupV2Record(candidate) && (status === undefined || candidate.status === status)
    );
    return record ? cloneCleanupV2(record) : undefined;
  }

  latestUnresolvedCleanup(): CleanupOperationRecordV2 | undefined {
    const record = this.records.find(
      (candidate): candidate is CleanupOperationRecordV2 => isCleanupV2Record(candidate) && candidate.status !== "applied"
    );
    return record ? cloneCleanupV2(record) : undefined;
  }

  latestBatch(status?: BatchOperationStatus): BatchOperationRecord | undefined {
    return this.records.find(
      (record): record is BatchOperationRecord => isBatchRecord(record) && (status === undefined || record.status === status)
    );
  }

  /** Returns any batch whose transaction has not reached the stable applied state and therefore blocks new writes. */
  latestUnresolvedBatch(): BatchOperationRecord | undefined {
    return this.records.find(
      (record): record is BatchOperationRecord => isBatchRecord(record) && record.status !== "applied"
    );
  }

  latestUnresolvedMutation(): BatchOperationRecord | CleanupOperationRecordV2 | undefined {
    const record = this.records.find(
      (candidate): candidate is BatchOperationRecord | CleanupOperationRecordV2 =>
        (isBatchRecord(candidate) && candidate.status !== "applied") ||
        (isCleanupV2Record(candidate) && candidate.status !== "applied")
    );
    return record ? (isBatchRecord(record) ? cloneBatchRecord(record) : cloneCleanupV2(record)) : undefined;
  }

  remove(id: string): void {
    this.records = this.records.filter((record) => record.id !== id);
  }

  toJSON(): OperationRecord[] {
    return this.records.map(cloneOperationRecord);
  }

  private updateBatch(
    id: string,
    update: (record: BatchOperationRecord) => BatchOperationRecord
  ): BatchOperationRecord | undefined {
    let updated: BatchOperationRecord | undefined;
    this.records = this.records.map((record) => {
      if (!isBatchRecord(record) || record.id !== id) {
        return record;
      }
      updated = update(record);
      return updated;
    });
    return updated ? cloneBatchRecord(updated) : undefined;
  }

  private updateCleanupV2(
    id: string,
    update: (record: CleanupOperationRecordV2) => CleanupOperationRecordV2
  ): CleanupOperationRecordV2 | undefined {
    let updated: CleanupOperationRecordV2 | undefined;
    this.records = this.records.map((record) => {
      if (!isCleanupV2Record(record) || record.id !== id) return record;
      updated = cloneCleanupV2(update(record));
      return updated;
    });
    return updated ? cloneCleanupV2(updated) : undefined;
  }
}

export function isRecommendationRecord(record: OperationRecord): record is RecommendationOperationRecord {
  return record.type !== "cleanup" && record.type !== "batch" && "plan" in record;
}

export function isCleanupRecord(record: OperationRecord): record is AnyCleanupOperationRecord {
  return isLegacyCleanupRecord(record) || isCleanupV2Record(record);
}

export function isLegacyCleanupRecord(record: OperationRecord): record is LegacyCleanupOperationRecord {
  return record.type === "cleanup" && !("schemaVersion" in record) && !("status" in record) && Array.isArray(record.files);
}

export function isCleanupV2Record(record: OperationRecord): record is CleanupOperationRecordV2 {
  return (
    record.type === "cleanup" &&
    "schemaVersion" in record &&
    record.schemaVersion === 2 &&
    "status" in record &&
    typeof record.status === "string" &&
    Array.isArray(record.files)
  );
}

export function isBatchRecord(record: OperationRecord): record is BatchOperationRecord {
  return record.type === "batch" && Array.isArray(record.files) && typeof record.status === "string";
}

function cloneBatchFile(file: BatchFileChange): BatchFileChange {
  return {
    ...file,
    beforeTags: [...file.beforeTags],
    afterTags: [...file.afterTags],
    syncedInlineTags: [...file.syncedInlineTags],
    aiAddedTags: [...file.aiAddedTags]
  };
}

function cloneCleanupFile(file: CleanupFileChange): CleanupFileChange {
  return { ...file, beforeTags: [...file.beforeTags], afterTags: [...file.afterTags] };
}

function cloneCleanupFileV2(file: CleanupFileChangeV2): CleanupFileChangeV2 {
  return {
    ...file,
    beforeTags: [...file.beforeTags],
    afterTags: [...file.afterTags],
    inlineEdits: file.inlineEdits.map((edit) => ({ ...edit }))
  };
}

function cloneCleanupV2(record: CleanupOperationRecordV2): CleanupOperationRecordV2 {
  return {
    ...record,
    sourceTags: [...record.sourceTags],
    files: record.files.map(cloneCleanupFileV2)
  };
}

function cloneCleanupRecord(record: AnyCleanupOperationRecord): AnyCleanupOperationRecord {
  return isCleanupV2Record(record)
    ? cloneCleanupV2(record)
    : { ...record, files: record.files.map(cloneCleanupFile) };
}

function cloneBatchRecord(record: BatchOperationRecord): BatchOperationRecord {
  return { ...record, settings: { ...record.settings }, files: record.files.map(cloneBatchFile) };
}

function cloneOperationRecord(record: OperationRecord): OperationRecord {
  if (isBatchRecord(record)) return cloneBatchRecord(record);
  if (isCleanupV2Record(record)) return cloneCleanupV2(record);
  if (isLegacyCleanupRecord(record)) return { ...record, files: record.files.map(cloneCleanupFile) };
  return {
    ...record,
    plan: {
      ...record.plan,
      beforeTags: [...record.plan.beforeTags],
      afterTags: [...record.plan.afterTags],
      addedTags: [...record.plan.addedTags],
      syncedInlineTags: [...record.plan.syncedInlineTags],
      aiAddedTags: [...record.plan.aiAddedTags],
      unchangedTags: [...record.plan.unchangedTags],
      skippedTags: [...record.plan.skippedTags]
    }
  };
}
