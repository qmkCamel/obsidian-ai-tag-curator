// Persists recommendation, cleanup, and batch transaction records for undo and crash recovery.
import type { TagHealthSuggestion } from "../health/TagHealthReport";
import type { ChangePlan } from "../preview/ChangePlan";
import type { FolderBatchSettingsSnapshot } from "../batch/FolderBatchPlan";
import type { CleanupReviewAction, InlineTextEdit } from "../cleanup/CleanupReviewPlan";
import type { TagValuePatch } from "../obsidian/TagValuePatch";
import type { ReviewContext } from "../management/ManualTagIntent";
import { createHistoryReceipt, operationSequences, type HistoryReceipt, type ReceiptOptions } from "./OperationHistory";

export type { HistoryReceipt, ReceiptOptions } from "./OperationHistory";

export interface OperationValueMetadata {
  tagValuePatch?: TagValuePatch;
  tagValueVersion?: 1;
}

export interface OperationMetadata extends OperationValueMetadata {
  /** Monotonic order assigned from array position, never from timestamps or ids. */
  sequence?: number;
  policyRevision?: number;
}

export interface RecommendationOperationRecord extends OperationMetadata {
  id: string;
  type?: "recommendation";
  plan: ChangePlan;
}

export interface CleanupFileChange extends OperationValueMetadata {
  notePath: string;
  beforeTags: string[];
  afterTags: string[];
}

export interface LegacyCleanupOperationRecord extends OperationMetadata {
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

export interface CleanupFileChangeV2 extends OperationValueMetadata {
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

export interface CleanupOperationRecordV2 extends OperationMetadata {
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
  origin?: "manual" | "health";
  context?: ReviewContext;
  createdAt: string;
  files: CleanupFileChangeV2[];
}

export type AnyCleanupOperationRecord = LegacyCleanupOperationRecord | CleanupOperationRecordV2;

export type BatchOperationStatus = "applying" | "applied" | "undoing" | "recoveryRequired";
export type BatchRecoveryTarget = "before" | "after";
export type BatchFileRecoveryState = "before" | "after" | "conflict" | "missing";

export interface BatchFileChange extends OperationValueMetadata {
  notePath: string;
  beforeTags: string[];
  afterTags: string[];
  syncedInlineTags: string[];
  aiAddedTags: string[];
  sourceContentHash?: string;
  afterContentHash?: string;
  recoveryState?: BatchFileRecoveryState;
}

export interface BatchOperationRecord extends OperationMetadata {
  id: string;
  type: "batch";
  origin?: "recommendation" | "batch";
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

export const OPERATION_HISTORY_BYTE_LIMIT = 20 * 1024 * 1024;
export const HISTORY_RECEIPT_LIMIT = 100;

export class InvalidOperationLogError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
    this.name = "InvalidOperationLogError";
  }
}

export class OperationLogCapacityError extends Error {
  constructor(readonly bytes: number, readonly limit: number) {
    super(`Operation history exceeds the ${limit}-byte UTF-8 budget. Reduce the operation scope.`);
    this.name = "OperationLogCapacityError";
  }
}

export class OperationLog {
  private records: OperationRecord[];
  private receipts: HistoryReceipt[];
  private invalidRecords?: { value: unknown };
  private invalidReceipts?: { value: unknown };
  private persistenceUncertain = false;
  private completedLimit = Infinity;
  private mutationRunning = false;
  private historyRevision = 0;

  get revision(): number { return this.historyRevision; }

  get isMutationRunning(): boolean {
    return this.mutationRunning;
  }

  /** Acquire synchronously, before any preflight await, and retain through compensation. */
  async runMutation<T>(action: () => Promise<T>): Promise<T> {
    if (this.mutationRunning) throw new MutationInProgressError();
    this.assertValid();
    this.mutationRunning = true;
    try {
      return await action();
    } finally {
      this.mutationRunning = false;
    }
  }

  constructor(records: unknown = [], receipts: unknown = []) {
    // Clone JSON-shaped data before narrowing it: future schemas must survive reload unchanged.
    this.records = Array.isArray(records) ? records.map(cloneOperationRecord) : [];
    this.receipts = Array.isArray(receipts) ? cloneData(receipts) : [];
    if (!Array.isArray(records)) this.invalidRecords = { value: cloneData(records) };
    if (!Array.isArray(receipts)) this.invalidReceipts = { value: cloneData(receipts) };
  }

  validate(): string[] {
    const errors: string[] = [];
    if (this.invalidRecords) errors.push("Operations must be an array; the original data has been preserved.");
    if (this.invalidReceipts) errors.push("Receipts must be an array; the original data has been preserved.");
    const ids = new Set<string>();
    for (const [index, record] of this.records.entries()) {
      if (!isOperationRecord(record)) {
        errors.push(`Unknown or invalid operation at position ${index}; recovery is read-only.`);
        continue;
      }
      if (ids.has(record.id)) errors.push(`Duplicate operation id: ${record.id}.`);
      ids.add(record.id);
    }
    if (this.records.filter(isUnresolvedOperation).length > 1) errors.push("Multiple unresolved operations require read-only recovery.");
    if (this.receipts.some((receipt) => !isHistoryReceipt(receipt))) errors.push("Unknown or invalid history receipt; original data has been preserved.");
    if (this.persistenceUncertain) errors.push("Saving operation history failed; reload and validate before new writes.");
    return errors;
  }

  get validationErrors(): string[] {
    return this.validate();
  }

  assertValid(): void {
    const errors = this.validate();
    if (errors.length > 0) throw new InvalidOperationLogError(errors);
  }

  latest(): OperationRecord | undefined {
    const record = this.records[0];
    return record === undefined ? undefined : cloneOperationRecord(record);
  }

  latestOperation(): OperationRecord | undefined {
    return this.latest();
  }

  isLatest(id: string): boolean {
    return this.validate().length === 0 && this.records[0]?.id === id;
  }

  canUndo(id: string): boolean {
    const record = this.records[0];
    return this.isLatest(id) && !this.latestUnresolvedMutation() && !!record && !isLegacyCleanupRecord(record);
  }

  add(plan: ChangePlan, limit: number): OperationRecord {
    const record: OperationRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      plan
    };

    this.insert(record, limit);
    return cloneOperationRecord(this.records[0]);
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

    this.insert(cleanupRecord, limit);
    return cloneData(this.records[0]) as LegacyCleanupOperationRecord;
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
    this.insert(cleanupRecord, limit);
    return cloneCleanupV2(this.records[0] as CleanupOperationRecordV2);
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
    this.insert(batchRecord, limit);
    return cloneBatchRecord(this.records[0] as BatchOperationRecord);
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
    const record = this.records.find((record): record is RecommendationOperationRecord => isRecommendationRecord(record) && record.plan.notePath === path);
    return record ? cloneData(record) : undefined;
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
    const record = this.records.find(
      (record): record is BatchOperationRecord => isBatchRecord(record) && (status === undefined || record.status === status)
    );
    return record ? cloneBatchRecord(record) : undefined;
  }

  /** Returns any batch whose transaction has not reached the stable applied state and therefore blocks new writes. */
  latestUnresolvedBatch(): BatchOperationRecord | undefined {
    const record = this.records.find(
      (record): record is BatchOperationRecord => isBatchRecord(record) && record.status !== "applied"
    );
    return record ? cloneBatchRecord(record) : undefined;
  }

  latestUnresolvedMutation(): BatchOperationRecord | CleanupOperationRecordV2 | undefined {
    const record = this.records.find(
      (candidate): candidate is BatchOperationRecord | CleanupOperationRecordV2 =>
        (isBatchRecord(candidate) && candidate.status !== "applied") ||
        (isCleanupV2Record(candidate) && candidate.status !== "applied")
    );
    return record ? (isBatchRecord(record) ? cloneBatchRecord(record) : cloneCleanupV2(record)) : undefined;
  }

  remove(id: string, receipt?: ReceiptOptions): void {
    this.finalize(id, receipt);
  }

  /** Also used by startup reconciliation; no writer/UI-specific receipt path is needed. */
  finalize(id: string, options?: ReceiptOptions): HistoryReceipt | undefined {
    this.assertValid();
    const records = this.withSequences();
    const record = records.find((entry) => entry.id === id);
    if (!record) return cloneData(this.receipts.find((receipt) => receipt.operationId === id));
    const receipt = createHistoryReceipt(record, record.sequence!, options);
    const retained = this.fitHistory(records.filter((entry) => entry.id !== id), [receipt, ...this.receipts.filter((entry) => entry.operationId !== id)], Infinity);
    this.records = retained.operations;
    this.receipts = retained.receipts;
    this.historyRevision += 1;
    return cloneData(receipt);
  }

  /** Restore the same record and position if deleting it cannot be persisted. */
  async removeAndPersist(id: string, persist: () => Promise<void>, receipt?: ReceiptOptions): Promise<void> {
    this.assertValid();
    const previousRecords = cloneData(this.records);
    const previousReceipts = cloneData(this.receipts);
    this.remove(id, receipt);
    try {
      await persist();
    } catch (error) {
      this.records = previousRecords;
      this.receipts = previousReceipts;
      this.historyRevision += 1;
      this.persistenceUncertain = true;
      throw error;
    }
  }

  async finalizeAndPersist(id: string, persist: () => Promise<void>, receipt?: ReceiptOptions): Promise<void> {
    return this.removeAndPersist(id, persist, receipt);
  }

  toJSON(): OperationRecord[] {
    return this.invalidRecords ? cloneData(this.invalidRecords.value) as OperationRecord[] : this.records.map(cloneOperationRecord);
  }

  receiptsToJSON(): HistoryReceipt[] {
    return this.invalidReceipts ? cloneData(this.invalidReceipts.value) as HistoryReceipt[] : cloneData(this.receipts);
  }

  /** Completed entries are evictable; unknown data and every unresolved intent are pinned. */
  enforceRetention(limit: number): void {
    if (this.invalidRecords || this.invalidReceipts) this.assertValid();
    const retained = this.fitHistory(this.withSequences(), this.receipts, limit);
    this.records = retained.operations;
    this.receipts = retained.receipts;
    this.historyRevision += 1;
    this.completedLimit = limit;
  }

  serializedBytes(): number {
    return operationHistoryBytes(this.toJSON(), this.receiptsToJSON());
  }

  private withSequences(): OperationRecord[] {
    const sequences = operationSequences(this.records, this.receipts);
    return this.records.map((record, index) => isOperationRecord(record) ? { ...record, sequence: sequences[index] } : cloneData(record));
  }

  private insert(record: OperationRecord, limit: number): void {
    this.assertValid();
    if (this.latestUnresolvedMutation()) throw new InvalidOperationLogError(["Resolve the existing operation before creating a new intent."]);
    if (!isOperationRecord(record)) throw new InvalidOperationLogError(["Invalid new operation."]);
    const records = this.withSequences();
    const sequence = Math.max(0, ...records.map((entry) => entry.sequence ?? 0), ...this.receipts.map((entry) => entry.sequence)) + 1;
    const next = sanitizeNewOperation({ ...record, sequence });
    const retained = this.fitHistory([next, ...records], this.receipts, limit, next.id);
    this.records = retained.operations;
    this.receipts = retained.receipts;
    this.historyRevision += 1;
    this.completedLimit = limit;
  }

  private fitHistory(operations: OperationRecord[], receipts: HistoryReceipt[], limit: number, protectedId?: string): { operations: OperationRecord[]; receipts: HistoryReceipt[] } {
    if (Number.isNaN(limit) || limit < 0) throw new RangeError("Operation history limit must be non-negative.");
    let completed = 0;
    const retained = operations.filter((record) => {
      if (!isOperationRecord(record) || isUnresolvedOperation(record)) return true;
      return ++completed <= Math.floor(limit) || record.id === protectedId;
    });
    // Invalid receipts are preserved, not silently dropped to restore a writable state.
    const summaries = [
      ...receipts.filter((receipt) => !isHistoryReceipt(receipt)),
      ...receipts.filter(isHistoryReceipt).sort((left, right) => right.sequence - left.sequence).slice(0, HISTORY_RECEIPT_LIMIT)
    ];
    let bytes = operationHistoryBytes(retained, summaries);
    while (bytes > OPERATION_HISTORY_BYTE_LIMIT) {
      const receiptIndex = findLastIndex(summaries, isHistoryReceipt);
      if (receiptIndex >= 0) summaries.splice(receiptIndex, 1);
      else {
        const recordIndex = findLastIndex(retained, (record) => isOperationRecord(record) && !isUnresolvedOperation(record) && record.id !== protectedId);
        if (recordIndex < 0) throw new OperationLogCapacityError(bytes, OPERATION_HISTORY_BYTE_LIMIT);
        retained.splice(recordIndex, 1);
      }
      bytes = operationHistoryBytes(retained, summaries);
    }
    return { operations: retained, receipts: summaries };
  }

  private updateBatch(
    id: string,
    update: (record: BatchOperationRecord) => BatchOperationRecord
  ): BatchOperationRecord | undefined {
    let updated: BatchOperationRecord | undefined;
    const records = this.records.map((record) => {
      if (!isBatchRecord(record) || record.id !== id) {
        return record;
      }
      updated = cloneBatchRecord(update(record));
      return updated;
    });
    const retained = this.fitHistory(records, this.receipts, this.completedLimit, id);
    this.records = retained.operations;
    this.receipts = retained.receipts;
    this.historyRevision += 1;
    return updated ? cloneBatchRecord(updated) : undefined;
  }

  private updateCleanupV2(
    id: string,
    update: (record: CleanupOperationRecordV2) => CleanupOperationRecordV2
  ): CleanupOperationRecordV2 | undefined {
    let updated: CleanupOperationRecordV2 | undefined;
    const records = this.records.map((record) => {
      if (!isCleanupV2Record(record) || record.id !== id) return record;
      updated = cloneCleanupV2(update(record));
      return updated;
    });
    const retained = this.fitHistory(records, this.receipts, this.completedLimit, id);
    this.records = retained.operations;
    this.receipts = retained.receipts;
    this.historyRevision += 1;
    return updated ? cloneCleanupV2(updated) : undefined;
  }
}

export function isRecommendationRecord(record: unknown): record is RecommendationOperationRecord {
  if (!isRecordBase(record) || (record.type !== undefined && record.type !== "recommendation") || record.schemaVersion !== undefined) return false;
  const plan = record.plan;
  return isObject(plan) && isTagChange(plan) && isStringArray(plan.addedTags) &&
    isStringArray(plan.unchangedTags) && isStringArray(plan.skippedTags) &&
    optionalStringArray(plan.syncedInlineTags) && optionalStringArray(plan.aiAddedTags) &&
    optionalString(plan.sourceContentHash) && optionalString(plan.createdAt);
}

export function isCleanupRecord(record: unknown): record is AnyCleanupOperationRecord {
  return isLegacyCleanupRecord(record) || isCleanupV2Record(record);
}

export function isLegacyCleanupRecord(record: unknown): record is LegacyCleanupOperationRecord {
  return isRecordBase(record) && record.type === "cleanup" && !("schemaVersion" in record) && !("status" in record) &&
    typeof record.itemId === "string" && typeof record.title === "string" &&
    ["merge", "rename", "observe", "deprecate"].includes(record.action as string) &&
    optionalString(record.createdAt) && Array.isArray(record.files) && record.files.every(isTagChange);
}

export function isCleanupV2Record(record: unknown): record is CleanupOperationRecordV2 {
  return (
    isRecordBase(record) && record.type === "cleanup" &&
    record.schemaVersion === 2 &&
    isTransactionStatus(record.status) && isRecoveryTarget(record.recoveryTarget) &&
    typeof record.itemId === "string" && typeof record.title === "string" &&
    ["merge", "rename"].includes(record.action as string) && isStringArray(record.sourceTags) &&
    typeof record.targetTag === "string" && typeof record.partial === "boolean" && optionalString(record.createdAt) &&
    (record.origin === undefined || record.origin === "manual" || record.origin === "health") &&
    (record.context === undefined || isReviewContext(record.context)) &&
    Array.isArray(record.files) && record.files.every((file: unknown) =>
      isTagChange(file) && typeof file.sourceContentHash === "string" && typeof file.beforeBodyHash === "string" &&
      typeof file.afterBodyHash === "string" && optionalString(file.afterContentHash) &&
      (file.recoveryState === undefined || ["before", "after", "bodyChanged", "conflict", "missing"].includes(file.recoveryState as string)) &&
      Array.isArray(file.inlineEdits) && file.inlineEdits.every(isInlineEdit))
  );
}

export function isBatchRecord(record: unknown): record is BatchOperationRecord {
  return isRecordBase(record) && record.type === "batch" && record.schemaVersion === undefined &&
    (record.origin === undefined || record.origin === "recommendation" || record.origin === "batch") &&
    isTransactionStatus(record.status) && isRecoveryTarget(record.recoveryTarget) &&
    typeof record.folderPath === "string" && typeof record.includeSubfolders === "boolean" &&
    optionalString(record.indexUpdatedAt) && optionalString(record.createdAt) && isObject(record.settings) &&
    Array.isArray(record.files) && record.files.every((file: unknown) => isTagChange(file) &&
      isStringArray(file.syncedInlineTags) && isStringArray(file.aiAddedTags) &&
      optionalString(file.sourceContentHash) && optionalString(file.afterContentHash) &&
      (file.recoveryState === undefined || ["before", "after", "conflict", "missing"].includes(file.recoveryState as string)));
}

function cloneBatchFile(file: BatchFileChange): BatchFileChange {
  return cloneData(file);
}

function cloneCleanupFileV2(file: CleanupFileChangeV2): CleanupFileChangeV2 {
  return cloneData(file);
}

function cloneCleanupV2(record: CleanupOperationRecordV2): CleanupOperationRecordV2 {
  return cloneData(record);
}

function cloneCleanupRecord(record: AnyCleanupOperationRecord): AnyCleanupOperationRecord {
  return cloneData(record);
}

function cloneBatchRecord(record: BatchOperationRecord): BatchOperationRecord {
  return cloneData(record);
}

export function cloneOperationRecord(record: OperationRecord): OperationRecord {
  const cloned = cloneData(record);
  if (isRecommendationRecord(cloned)) {
    cloned.plan.syncedInlineTags ??= [];
    cloned.plan.aiAddedTags ??= [...cloned.plan.addedTags];
  }
  return cloned;
}

/** JSON data only; unlike shape-specific clones this also preserves unrecognized records. */
export function cloneData<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneData(entry)) as T;
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneData(entry)])) as T;
  return value;
}

export function isOperationRecord(value: unknown): value is OperationRecord {
  return isRecommendationRecord(value) || isCleanupRecord(value) || isBatchRecord(value);
}

export function validateOperationRecords(records: unknown): string[] {
  return new OperationLog(records).validate();
}

export function isUnresolvedOperation(value: unknown): value is CleanupOperationRecordV2 | BatchOperationRecord {
  return (isCleanupV2Record(value) || isBatchRecord(value)) && value.status !== "applied";
}

export function operationHistoryBytes(operations: unknown, receipts: unknown): number {
  return new TextEncoder().encode(JSON.stringify({ operations, receipts })).byteLength;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function optionalString(value: unknown): boolean { return value === undefined || typeof value === "string"; }
function optionalStringArray(value: unknown): boolean { return value === undefined || isStringArray(value); }
function isRecoveryTarget(value: unknown): boolean { return value === undefined || value === "before" || value === "after"; }
function isTransactionStatus(value: unknown): boolean { return ["applying", "applied", "undoing", "recoveryRequired"].includes(value as string); }
function isSequence(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }

function isTagValueSnapshot(value: unknown): boolean {
  return isObject(value) && (value.kind === "absent" ||
    (value.kind === "list" && isStringArray(value.values)) || (value.kind === "scalar" && typeof value.value === "string"));
}

function hasValidValueMetadata(value: Record<string, unknown>): boolean {
  return (value.tagValueVersion === undefined || value.tagValueVersion === 1) &&
    (value.tagValuePatch === undefined || (isObject(value.tagValuePatch) &&
      isTagValueSnapshot(value.tagValuePatch.before) && isTagValueSnapshot(value.tagValuePatch.after)));
}

function isRecordBase(value: unknown): value is Record<string, unknown> {
  return isObject(value) && typeof value.id === "string" && value.id.length > 0 &&
    (value.sequence === undefined || isSequence(value.sequence)) &&
    (value.policyRevision === undefined || (Number.isSafeInteger(value.policyRevision) && (value.policyRevision as number) >= 0)) && hasValidValueMetadata(value);
}

function isTagChange(value: unknown): value is Record<string, unknown> {
  return isObject(value) && typeof value.notePath === "string" && isStringArray(value.beforeTags) &&
    isStringArray(value.afterTags) && hasValidValueMetadata(value);
}

function isInlineEdit(value: unknown): boolean {
  if (!isObject(value) || typeof value.occurrenceId !== "string" || typeof value.beforeText !== "string" || typeof value.afterText !== "string") return false;
  return ["beforeBodyStart", "beforeBodyEnd", "afterBodyStart", "afterBodyEnd"].every((key) => Number.isSafeInteger(value[key]) && (value[key] as number) >= 0) &&
    (value.beforeBodyEnd as number) - (value.beforeBodyStart as number) === value.beforeText.length &&
    (value.afterBodyEnd as number) - (value.afterBodyStart as number) === value.afterText.length;
}

function isReviewContext(value: unknown): boolean {
  return isObject(value) && (value.origin === "manual" || value.origin === "health") &&
    ["indexRevision", "vaultRevision", "policyRevision"].every((key) => Number.isSafeInteger(value[key]) && (value[key] as number) >= 0) &&
    isStringArray(value.candidatePaths) && isObject(value.scope) && Array.isArray(value.scope.include) &&
    value.scope.include.every((entry: unknown) => isObject(entry) && typeof entry.path === "string" && typeof entry.recursive === "boolean");
}

export function isHistoryReceipt(value: unknown): value is HistoryReceipt {
  return isObject(value) && typeof value.id === "string" && typeof value.operationId === "string" &&
    isSequence(value.sequence) && optionalString(value.createdAt) && typeof value.completedAt === "string" &&
    ["recommendation", "batch", "health", "manual"].includes(value.origin as string) && typeof value.action === "string" &&
    (value.status === "undone" || value.status === "rolledBack") && Array.isArray(value.files) && value.files.every(file =>
      isTagChange(file) && (file.inlineChanges === undefined || (Array.isArray(file.inlineChanges) &&
        file.inlineChanges.every(change => isObject(change) && typeof change.before === "string" && typeof change.after === "string"))));
}

function findLastIndex<T>(values: T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index--) if (predicate(values[index])) return index;
  return -1;
}

/** New records are allowlisted; loaded unknown schemas are preserved by cloneData instead. */
function sanitizeNewOperation(record: OperationRecord): OperationRecord {
  const common = ["id", "type", "sequence", "policyRevision", "tagValueVersion", "tagValuePatch"];
  const fileFields = ["notePath", "beforeTags", "afterTags", "tagValueVersion", "tagValuePatch"];
  if (isRecommendationRecord(record)) {
    return { ...pick(record, common), plan: pick(record.plan, [
      ...fileFields, "addedTags", "syncedInlineTags", "aiAddedTags", "unchangedTags", "skippedTags", "sourceContentHash", "createdAt"
    ]) } as unknown as RecommendationOperationRecord;
  }
  if (isBatchRecord(record)) {
    return {
      ...pick(record, [...common, "status", "recoveryTarget", "origin", "folderPath", "includeSubfolders", "indexUpdatedAt", "createdAt"]),
      settings: pick(record.settings, ["providerType", "providerPreset", "model", "supportsJsonMode", "providerConcurrency", "promptProfile", "maxRecommendations", "maxFolderBatchFiles", "allowNewTags", "newTagStrictness", "uiLanguage"]),
      files: record.files.map((file) => pick(file, [...fileFields, "syncedInlineTags", "aiAddedTags", "sourceContentHash", "afterContentHash", "recoveryState"]))
    } as unknown as BatchOperationRecord;
  }
  const cleanup = pick(record, [...common, "itemId", "title", "action", "createdAt"]);
  if (!isCleanupV2Record(record)) return { ...cleanup, files: record.files.map((file) => pick(file, fileFields)) } as unknown as LegacyCleanupOperationRecord;
  const context = record.context && {
    ...pick(record.context, ["origin", "indexRevision", "vaultRevision", "policyRevision", "candidatePaths"]),
    scope: { include: record.context.scope.include.map((entry) => pick(entry, ["path", "recursive"])) }
  };
  return {
    ...cleanup,
    ...pick(record, ["schemaVersion", "status", "recoveryTarget", "sourceTags", "targetTag", "partial", "origin"]),
    ...(context ? { context } : {}),
    files: record.files.map((file) => ({
      ...pick(file, [...fileFields, "sourceContentHash", "beforeBodyHash", "afterBodyHash", "afterContentHash", "recoveryState"]),
      inlineEdits: file.inlineEdits.map((edit) => pick(edit, ["occurrenceId", "beforeBodyStart", "beforeBodyEnd", "afterBodyStart", "afterBodyEnd", "beforeText", "afterText"]))
    }))
  } as unknown as CleanupOperationRecordV2;
}

function pick(value: object, fields: string[]): Record<string, unknown> {
  const source = value as Record<string, unknown>;
  return Object.fromEntries(fields.filter((field) => source[field] !== undefined).map((field) => [field, cloneData(source[field])]));
}

export class MutationInProgressError extends Error {
  constructor() {
    super("Another tag operation is in progress. Wait for it to finish before retrying.");
    this.name = "MutationInProgressError";
  }
}
