// Reconciles interrupted folder operations, retries their fixed recovery target, and undoes applied batches safely.
import type { TFile } from "obsidian";
import type { FrontmatterSnapshot, FrontmatterTagChange } from "../obsidian/FrontmatterWriter";
import type {
  BatchFileChange,
  BatchFileRecoveryState,
  BatchOperationRecord,
  BatchRecoveryTarget,
  OperationLog
} from "../operations/OperationLog";
import { normalizeTag } from "../utils/normalizeTag";
import { exactTagValuePatch, reverseTagValueFields, sameTagValue, tagValueFields } from "../obsidian/TagValuePatch";

export interface FolderBatchRecoveryWriter {
  checkSnapshot?(file: TFile, snapshot: FrontmatterSnapshot): Promise<FrontmatterTagChange | void>;
  readCurrentTags(file: TFile): string[];
  readSnapshot(file: TFile): Promise<FrontmatterSnapshot>;
  replaceTagsIfSnapshotMatches(
    file: TFile,
    snapshot: FrontmatterSnapshot,
    nextTags: string[]
  ): Promise<FrontmatterTagChange>;
}

export interface FolderBatchRecoveryDependencies {
  findFile(notePath: string): TFile | null;
  writer: FolderBatchRecoveryWriter;
  operationLog: OperationLog;
  persist(): Promise<void>;
  refreshIndex(): Promise<void>;
}

export interface FolderBatchRecoveryResult {
  status: "none" | "removed" | "applied" | "conflict" | "recoveryRequired";
  record?: BatchOperationRecord;
  files: BatchFileChange[];
  error?: string;
  indexRefreshError?: string;
}

interface ClassifiedFile {
  change: BatchFileChange;
  file: TFile | null;
  state: BatchFileRecoveryState;
  snapshot?: FrontmatterSnapshot;
}

export class FolderBatchRecoveryService {
  constructor(private readonly dependencies: FolderBatchRecoveryDependencies) {}

  /** Resolves an interrupted applying/undoing record or persists its one valid recovery direction. */
  async reconcileInterruptedBatch(): Promise<FolderBatchRecoveryResult> {
    return this.dependencies.operationLog.runMutation(() => this.reconcileInterruptedBatchLocked());
  }

  private async reconcileInterruptedBatchLocked(): Promise<FolderBatchRecoveryResult> {
    const record = this.dependencies.operationLog.latestUnresolvedBatch();
    if (!record || record.status === "recoveryRequired") {
      return { status: record ? "recoveryRequired" : "none", record, files: record?.files ?? [] };
    }

    const classified = await this.classify(record, false);
    const allBefore = classified.every((item) => item.state === "before");
    const allAfter = classified.every((item) => item.state === "after");

    if ((record.status === "applying" && allBefore) || (record.status === "undoing" && allBefore)) {
      await this.dependencies.operationLog.removeAndPersist(record.id, () => this.dependencies.persist(), { status: record.status === "applying" ? "rolledBack" : "undone" });
      const indexRefreshError = await this.refreshIndexSafely();
      return { status: "removed", files: classified.map(withRecoveryState), indexRefreshError };
    }
    if ((record.status === "applying" && allAfter) || (record.status === "undoing" && allAfter)) {
      const applied = this.dependencies.operationLog.updateBatchStatus(record.id, "applied")!;
      await this.dependencies.persist();
      const indexRefreshError = await this.refreshIndexSafely();
      return { status: "applied", record: applied, files: classified.map(withRecoveryState), indexRefreshError };
    }

    const target: BatchRecoveryTarget = record.status === "applying" ? "before" : "after";
    const recovery = this.dependencies.operationLog.setBatchRecoveryTarget(
      record.id,
      target,
      classified.map(withRecoveryState)
    )!;
    await this.dependencies.persist();
    const indexRefreshError = await this.refreshIndexSafely();
    return { status: "recoveryRequired", record: recovery, files: recovery.files, indexRefreshError };
  }

  /** Retries only the persisted target after a zero-write full classification rejects third states. */
  async retryRecovery(record = this.dependencies.operationLog.latestUnresolvedBatch()): Promise<FolderBatchRecoveryResult> {
    return this.dependencies.operationLog.runMutation(() => this.retryRecoveryLocked(record));
  }

  private async retryRecoveryLocked(record = this.dependencies.operationLog.latestUnresolvedBatch()): Promise<FolderBatchRecoveryResult> {
    if (!record || record.status !== "recoveryRequired" || !record.recoveryTarget) {
      return { status: "none", files: [] };
    }

    const classified = await this.classify(record, true);
    if (classified.some((item) => item.state === "missing" || item.state === "conflict")) {
      const recovery = this.dependencies.operationLog.setBatchRecoveryTarget(
        record.id,
        record.recoveryTarget,
        classified.map(withRecoveryState)
      )!;
      await this.dependencies.persist();
      return { status: "conflict", record: recovery, files: recovery.files };
    }

    const target = record.recoveryTarget;
    const ordered = orderForTarget(classified, target);
    try {
      for (const item of ordered) {
        if (item.state === target) {
          continue;
        }
        await this.dependencies.writer.replaceTagsIfSnapshotMatches(
          item.file!,
          { ...item.snapshot!, ...(target === "before" ? reverseTagValueFields(item.change) : tagValueFields(exactTagValuePatch(item.change))) },
          target === "before" ? item.change.beforeTags : item.change.afterTags
        );
      }
    } catch (error) {
      const current = await this.classify(record, true);
      const recovery = this.dependencies.operationLog.setBatchRecoveryTarget(
        record.id,
        target,
        current.map(withRecoveryState)
      )!;
      await this.dependencies.persist();
      const indexRefreshError = await this.refreshIndexSafely();
      return {
        status: "recoveryRequired",
        record: recovery,
        files: recovery.files,
        error: errorMessage(error),
        indexRefreshError
      };
    }

    if (target === "before") {
      await this.dependencies.operationLog.removeAndPersist(record.id, () => this.dependencies.persist(), { status: "rolledBack" });
      const indexRefreshError = await this.refreshIndexSafely();
      return { status: "removed", files: classified.map(withRecoveryState), indexRefreshError };
    }
    const applied = this.dependencies.operationLog.updateBatchStatus(record.id, "applied")!;
    await this.dependencies.persist();
    const indexRefreshError = await this.refreshIndexSafely();
    return { status: "applied", record: applied, files: applied.files, indexRefreshError };
  }

  /** Undoes the latest applied batch in reverse order and compensates back to after on failure. */
  async undoLatestAppliedBatch(): Promise<FolderBatchRecoveryResult> {
    return this.dependencies.operationLog.runMutation(() => this.undoLatestAppliedBatchLocked());
  }

  private async undoLatestAppliedBatchLocked(): Promise<FolderBatchRecoveryResult> {
    const record = this.dependencies.operationLog.latestBatch("applied");
    if (!record) {
      return { status: "none", files: [] };
    }

    const classified = await this.classify(record, true);
    if (classified.some((item) => item.state !== "after")) {
      return { status: "conflict", record, files: classified.map(withRecoveryState) };
    }

    this.dependencies.operationLog.updateBatchStatus(record.id, "undoing");
    await this.dependencies.persist();
    const attempted: Array<{ item: ClassifiedFile; beforeContentHash?: string }> = [];
    try {
      for (const item of [...classified].sort((left, right) => right.change.notePath.localeCompare(left.change.notePath))) {
        // A rejected write may already have changed the file; retain it for classification and compensation.
        const attempt: { item: ClassifiedFile; beforeContentHash?: string } = { item };
        attempted.push(attempt);
        const change = await this.dependencies.writer.replaceTagsIfSnapshotMatches(
          item.file!,
          { ...item.snapshot!, ...reverseTagValueFields(item.change) },
          item.change.beforeTags
        );
        attempt.beforeContentHash = change.afterContentHash;
      }

      await this.dependencies.operationLog.removeAndPersist(record.id, () => this.dependencies.persist(), { status: "undone" });
      const indexRefreshError = await this.refreshIndexSafely();
      return { status: "removed", files: classified.map(withRecoveryState), indexRefreshError };
    } catch (error) {
      let compensationFailed = false;
      for (const attempt of [...attempted].reverse()) {
        try {
          const [current] = await this.classify({ ...record, files: [{
            ...attempt.item.change,
            sourceContentHash: attempt.beforeContentHash ?? attempt.item.change.sourceContentHash
          }] }, true);
          if (current.state === "after") continue;
          if (current.state !== "before") throw new Error("Undo compensation conflict.");
          await this.dependencies.writer.replaceTagsIfSnapshotMatches(
            current.file!,
            { ...current.snapshot!, ...tagValueFields(exactTagValuePatch(current.change)) },
            current.change.afterTags
          );
        } catch {
          compensationFailed = true;
        }
      }

      if (!compensationFailed) {
        const applied = this.dependencies.operationLog.updateBatchStatus(record.id, "applied")!;
        await this.dependencies.persist();
        return { status: "applied", record: applied, files: applied.files, error: errorMessage(error) };
      }

      const current = await this.classify(record, true);
      const recovery = this.dependencies.operationLog.setBatchRecoveryTarget(
        record.id,
        "after",
        current.map(withRecoveryState)
      )!;
      await this.dependencies.persist();
      const indexRefreshError = await this.refreshIndexSafely();
      return {
        status: "recoveryRequired",
        record: recovery,
        files: recovery.files,
        error: errorMessage(error),
        indexRefreshError
      };
    }
  }

  /** Classifies each file as before, after, missing, or conflict; strict retries also validate content hashes. */
  private async classify(record: BatchOperationRecord, validateContent: boolean): Promise<ClassifiedFile[]> {
    return Promise.all(
      record.files.map(async (change) => {
        const file = this.dependencies.findFile(change.notePath);
        if (!file) {
          return { change, file: null, state: "missing" as const };
        }
        let snapshot: FrontmatterSnapshot;
        try {
          snapshot = await this.dependencies.writer.readSnapshot(file);
        } catch {
          return { change, file, state: "conflict" as const };
        }
        const raw = exactTagValuePatch(change);
        let state: BatchFileRecoveryState = "conflict";
        if (raw ? sameTagValue(snapshot.tagValueSnapshot, raw.before) : sameTags(snapshot.beforeTags, change.beforeTags)) {
          state = "before";
        } else if (raw ? sameTagValue(snapshot.tagValueSnapshot, raw.after) : sameTags(snapshot.beforeTags, change.afterTags)) {
          state = "after";
        }

        if (validateContent && state !== "conflict") {
          const expectedHash = state === "before" ? change.sourceContentHash : change.afterContentHash;
          if (expectedHash && expectedHash !== snapshot.sourceContentHash) {
            // A reverse raw patch may reformat YAML. Prove its forward image is the persisted after image.
            if (raw && state === "before" && change.afterContentHash && this.dependencies.writer.checkSnapshot) {
              try {
                const checked = await this.dependencies.writer.checkSnapshot(file, { ...snapshot, ...tagValueFields(raw) });
                if (checked?.afterContentHash !== change.afterContentHash) state = "conflict";
              } catch {
                state = "conflict";
              }
            } else state = "conflict";
          }
        }
        return { change, file, state, snapshot };
      })
    );
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

function orderForTarget(classified: ClassifiedFile[], target: BatchRecoveryTarget): ClassifiedFile[] {
  return [...classified].sort((left, right) =>
    target === "before"
      ? right.change.notePath.localeCompare(left.change.notePath)
      : left.change.notePath.localeCompare(right.change.notePath)
  );
}

function withRecoveryState(item: ClassifiedFile): BatchFileChange {
  return { ...item.change, recoveryState: item.state };
}

function sameTags(left: string[], right: string[]): boolean {
  const leftSet = new Set(left.map(normalizeTag).filter(Boolean));
  const rightSet = new Set(right.map(normalizeTag).filter(Boolean));
  return leftSet.size === rightSet.size && [...leftSet].every((tag) => rightSet.has(tag));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
