// Stores recent applied change plans so the plugin can undo the latest edit.
import type { TagHealthSuggestion } from "../health/TagHealthReport";
import type { ChangePlan } from "../preview/ChangePlan";

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

export type OperationRecord = RecommendationOperationRecord | CleanupOperationRecord;

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

  latestForPath(path: string): RecommendationOperationRecord | undefined {
    return this.records.find((record): record is RecommendationOperationRecord => isRecommendationRecord(record) && record.plan.notePath === path);
  }

  latestCleanup(): CleanupOperationRecord | undefined {
    return this.records.find((record): record is CleanupOperationRecord => record.type === "cleanup");
  }

  remove(id: string): void {
    this.records = this.records.filter((record) => record.id !== id);
  }

  toJSON(): OperationRecord[] {
    return this.records;
  }
}

function isRecommendationRecord(record: OperationRecord): record is RecommendationOperationRecord {
  return record.type !== "cleanup" && "plan" in record;
}
