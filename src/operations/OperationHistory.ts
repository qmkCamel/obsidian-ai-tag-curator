import {
  cloneData,
  isBatchRecord,
  isCleanupV2Record,
  isHistoryReceipt,
  isLegacyCleanupRecord,
  isOperationRecord,
  isRecommendationRecord,
  isUnresolvedOperation,
  validateOperationRecords,
  type CleanupOperationStatus,
  type OperationRecord,
  type OperationValueMetadata
} from "./OperationLog";

export type HistoryOrigin = "recommendation" | "batch" | "health" | "manual";
export type HistoryReceiptStatus = "undone" | "rolledBack";

export interface HistoryFileChange extends OperationValueMetadata {
  notePath: string;
  beforeTags: string[];
  afterTags: string[];
  inlineChanges?: Array<{ before: string; after: string }>;
}

export interface HistoryReceipt {
  id: string;
  operationId: string;
  sequence: number;
  createdAt?: string;
  completedAt: string;
  origin: HistoryOrigin;
  action: string;
  status: HistoryReceiptStatus;
  files: HistoryFileChange[];
}

export interface ReceiptOptions {
  status?: HistoryReceiptStatus;
  completedAt?: string;
}

export type HistoryUnavailableReason = "invalidHistory" | "recoveryRequired" | "notLatest" | "legacyReadOnly" | "completed";

export interface OperationHistoryRow {
  id: string;
  operationId: string;
  sequence: number;
  origin: HistoryOrigin | "unknown";
  action: string;
  createdAt?: string;
  completedAt?: string;
  status: CleanupOperationStatus | HistoryReceiptStatus | "unknown";
  files: HistoryFileChange[];
  model?: string;
  legacy: boolean;
  canUndo: boolean;
  canRecover: boolean;
  unavailableReason?: HistoryUnavailableReason;
}

/** Resolve legacy order from array position; existing sequence anchors only merge receipts. */
export function operationSequences(records: readonly unknown[], receipts: readonly unknown[] = []): number[] {
  const receiptMax = Math.max(0, ...receipts.filter(isHistoryReceipt).map((receipt) => receipt.sequence));
  const result: number[] = [];
  let previous = 0;
  for (let index = records.length - 1; index >= 0; index--) {
    const record = records[index];
    const stored = isOperationRecord(record) ? record.sequence : undefined;
    previous = Math.max(previous + 1, stored ?? receiptMax + records.length - index);
    result[index] = previous;
  }
  return result;
}

export function createHistoryReceipt(record: OperationRecord, sequence: number, options: ReceiptOptions = {}): HistoryReceipt {
  if (!isOperationRecord(record)) throw new Error("Cannot finalize an unknown operation.");
  const status = options.status ?? ((isUnresolvedOperation(record) &&
    (record.status === "applying" || record.recoveryTarget === "before")) ? "rolledBack" : "undone");
  return {
    id: `receipt:${record.id}`,
    operationId: record.id,
    sequence,
    createdAt: recordedTime(record),
    completedAt: options.completedAt ?? new Date().toISOString(),
    origin: operationOrigin(record),
    action: operationAction(record),
    status,
    files: operationFiles(record)
  };
}

/** Pure projection. Filtering these rows never recomputes or grants undo eligibility. */
export function projectOperationHistory(records: unknown = [], receipts: unknown = []): OperationHistoryRow[] {
  const active = Array.isArray(records) ? records : [records];
  const summaries = Array.isArray(receipts) ? receipts : [receipts];
  const invalid = validateOperationRecords(records).length > 0 || !Array.isArray(receipts) || summaries.some((receipt) => !isHistoryReceipt(receipt));
  const unresolved = active.some(isUnresolvedOperation);
  const sequences = operationSequences(active, summaries);
  const seen = new Set<string>();
  const rows: OperationHistoryRow[] = active.map((record, index) => {
    if (!isOperationRecord(record)) return unknownRow(record, sequences[index], index);
    seen.add(record.id);
    const legacyReadOnly = isLegacyCleanupRecord(record);
    const needsRecovery = isUnresolvedOperation(record);
    const unavailableReason: HistoryUnavailableReason | undefined = invalid ? "invalidHistory" :
      unresolved ? "recoveryRequired" : index > 0 ? "notLatest" : legacyReadOnly ? "legacyReadOnly" : undefined;
    return {
      id: record.id,
      operationId: record.id,
      sequence: sequences[index],
      origin: operationOrigin(record),
      action: operationAction(record),
      createdAt: recordedTime(record),
      status: isBatchRecord(record) || isCleanupV2Record(record) ? record.status : "applied",
      files: operationFiles(record),
      model: isBatchRecord(record) && typeof record.settings.model === "string" && record.settings.model.length > 0 ? record.settings.model : undefined,
      legacy: legacyReadOnly || !hasRawValues(record),
      canUndo: unavailableReason === undefined,
      canRecover: !invalid && needsRecovery,
      unavailableReason
    };
  });
  for (const [index, receipt] of summaries.entries()) {
    if (!isHistoryReceipt(receipt)) {
      rows.push(unknownRow(receipt, 0, active.length + index));
      continue;
    }
    if (seen.has(receipt.operationId)) continue;
    seen.add(receipt.operationId);
    rows.push({
      id: receipt.id,
      operationId: receipt.operationId,
      sequence: receipt.sequence,
      createdAt: receipt.createdAt,
      completedAt: receipt.completedAt,
      origin: receipt.origin,
      action: receipt.action,
      status: receipt.status,
      files: receipt.files.map(projectFile),
      legacy: !receipt.files.every((file) => !!file.tagValuePatch),
      canUndo: false,
      canRecover: false,
      unavailableReason: invalid ? "invalidHistory" : "completed"
    });
  }
  return rows.sort((left, right) => Number(right.canRecover) - Number(left.canRecover) || right.sequence - left.sequence);
}

function operationOrigin(record: OperationRecord): HistoryOrigin {
  if (isRecommendationRecord(record)) return "recommendation";
  if (isBatchRecord(record)) return record.origin ?? "batch";
  return isCleanupV2Record(record) ? record.origin ?? "health" : "health";
}

function operationAction(record: OperationRecord): string {
  return isRecommendationRecord(record) || isBatchRecord(record) ? "addTags" : record.action;
}

function recordedTime(record: OperationRecord): string | undefined {
  const value = isRecommendationRecord(record) ? record.plan.createdAt : record.createdAt;
  return value || undefined;
}

function operationFiles(record: OperationRecord): HistoryFileChange[] {
  if (isRecommendationRecord(record)) {
    return [projectFile({ ...record.plan, tagValuePatch: record.plan.tagValuePatch ?? record.tagValuePatch,
      tagValueVersion: record.plan.tagValueVersion ?? record.tagValueVersion })];
  }
  if (isCleanupV2Record(record)) return record.files.map(file => projectFile({
    ...file,
    inlineChanges: file.inlineEdits.map(edit => ({ before: edit.beforeText, after: edit.afterText }))
  }));
  return record.files.map(projectFile);
}

function projectFile(file: HistoryFileChange): HistoryFileChange {
  return {
    notePath: file.notePath,
    beforeTags: [...file.beforeTags],
    afterTags: [...file.afterTags],
    ...(file.inlineChanges ? { inlineChanges: file.inlineChanges.map(change => ({ before: change.before, after: change.after })) } : {}),
    ...(file.tagValuePatch ? { tagValuePatch: cloneData(file.tagValuePatch) } : {}),
    ...(file.tagValueVersion === 1 ? { tagValueVersion: 1 as const } : {})
  };
}

function hasRawValues(record: OperationRecord): boolean {
  const files = operationFiles(record);
  return files.length > 0 && files.every((file) => !!file.tagValuePatch);
}

function unknownRow(record: unknown, sequence: number, index: number): OperationHistoryRow {
  const id = record && typeof record === "object" && "id" in record && typeof record.id === "string" ? record.id : `unknown:${index}`;
  return { id, operationId: id, sequence, origin: "unknown", action: "unknown", status: "unknown",
    files: [], legacy: true, canUndo: false, canRecover: false, unavailableReason: "invalidHistory" };
}
