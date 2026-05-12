// Stores recent applied change plans so the plugin can undo the latest edit.
import type { ChangePlan } from "../preview/ChangePlan";

export interface OperationRecord {
  id: string;
  plan: ChangePlan;
}

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

  latestForPath(path: string): OperationRecord | undefined {
    return this.records.find((record) => record.plan.notePath === path);
  }

  remove(id: string): void {
    this.records = this.records.filter((record) => record.id !== id);
  }

  toJSON(): OperationRecord[] {
    return this.records;
  }
}
