// Stores recent applied change plans so the plugin can undo the latest edit.
import type { TagHealthSuggestion } from "../health/TagHealthReport";
import type { ChangePlan } from "../preview/ChangePlan";
import type { FolderBatchSettingsSnapshot } from "../batch/FolderBatchPlan";

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

export interface CleanupOperationRecord {
  id: string;
  type: "cleanup";
  itemId: string;
  title: string;
  action: TagHealthSuggestion;
  createdAt: string;
  files: CleanupFileChange[];
}

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

export type OperationRecord = RecommendationOperationRecord | CleanupOperationRecord | BatchOperationRecord;

export class OperationLog {
  private records: OperationRecord[];

  constructor(records: OperationRecord[] = []) {
    this.records = records;
  }

  add(plan: ChangePlan, limit: number): OperationRecord {
    const record: OperationRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      plan
    };

    this.records = [record, ...this.records].slice(0, limit);
    return record;
  }

  addCleanup(record: Omit<CleanupOperationRecord, "id" | "type" | "createdAt">, limit: number): CleanupOperationRecord {
    const cleanupRecord: CleanupOperationRecord = {
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "cleanup",
      createdAt: new Date().toISOString()
    };

    this.records = [cleanupRecord, ...this.records].slice(0, limit);
    return cleanupRecord;
  }

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

  latestForPath(path: string): RecommendationOperationRecord | undefined {
    return this.records.find((record): record is RecommendationOperationRecord => isRecommendationRecord(record) && record.plan.notePath === path);
  }

  latestCleanup(): CleanupOperationRecord | undefined {
    return this.records.find((record): record is CleanupOperationRecord => record.type === "cleanup");
  }

  latestBatch(status?: BatchOperationStatus): BatchOperationRecord | undefined {
    return this.records.find(
      (record): record is BatchOperationRecord => isBatchRecord(record) && (status === undefined || record.status === status)
    );
  }

  latestUnresolvedBatch(): BatchOperationRecord | undefined {
    return this.records.find(
      (record): record is BatchOperationRecord => isBatchRecord(record) && record.status !== "applied"
    );
  }

  remove(id: string): void {
    this.records = this.records.filter((record) => record.id !== id);
  }

  toJSON(): OperationRecord[] {
    return this.records;
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
    return updated;
  }
}

export function isRecommendationRecord(record: OperationRecord): record is RecommendationOperationRecord {
  return record.type !== "cleanup" && record.type !== "batch" && "plan" in record;
}

export function isCleanupRecord(record: OperationRecord): record is CleanupOperationRecord {
  return record.type === "cleanup";
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
