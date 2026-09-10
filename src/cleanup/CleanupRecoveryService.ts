// Reconciles, retries, and undoes V2 cleanup transactions without changing their persisted recovery target.
import type { TFile } from "obsidian";
import type { FrontmatterSnapshot, FrontmatterTagChange } from "../obsidian/FrontmatterWriter";
import type { InlineTagSnapshot, InlineTagWritePatch, InlineTagWriteResult } from "../obsidian/InlineTagWriter";
import { createReverseInlineTagWritePatch } from "../obsidian/InlineTagWriter";
import type {
  CleanupFileChangeV2,
  CleanupFileRecoveryState,
  CleanupOperationRecordV2,
  CleanupRecoveryTarget,
  OperationLog
} from "../operations/OperationLog";
import { normalizeTag } from "../utils/normalizeTag";
import { classifyCleanupFileState } from "./CleanupExecutor";

export interface CleanupRecoveryInlineWriter {
  apply(file: TFile, patch: InlineTagWritePatch): Promise<InlineTagWriteResult>;
  readSnapshot(file: TFile): Promise<InlineTagSnapshot>;
}

export interface CleanupRecoveryFrontmatterWriter {
  readCurrentTags(file: TFile): string[];
  replaceTagsIfSnapshotMatches(
    file: TFile,
    snapshot: FrontmatterSnapshot,
    nextTags: string[]
  ): Promise<FrontmatterTagChange>;
}

export interface CleanupRecoveryDependencies {
  findFile(notePath: string): TFile | null;
  inlineWriter: CleanupRecoveryInlineWriter;
  frontmatterWriter: CleanupRecoveryFrontmatterWriter;
  operationLog: OperationLog;
  persist(): Promise<void>;
  refreshIndex(): Promise<void>;
}

export interface CleanupRecoveryResult {
  status: "none" | "removed" | "applied" | "conflict" | "recoveryRequired";
  record?: CleanupOperationRecordV2;
  files: CleanupFileChangeV2[];
  error?: string;
  indexRefreshError?: string;
}

interface ClassifiedCleanupFile {
  change: CleanupFileChangeV2;
  file: TFile | null;
  state: CleanupFileRecoveryState;
  inlineSnapshot?: InlineTagSnapshot;
}

export class CleanupRecoveryService {
  constructor(private readonly dependencies: CleanupRecoveryDependencies) {}

  async reconcileInterruptedCleanup(): Promise<CleanupRecoveryResult> {
    const record = this.dependencies.operationLog.latestUnresolvedCleanup();
    if (!record || record.status === "recoveryRequired") {
      return { status: record ? "recoveryRequired" : "none", record, files: record?.files ?? [] };
    }

    const classified = await this.classify(record);
    const allBefore = classified.every((item) => item.state === "before");
    const allAfter = classified.every((item) => item.state === "after");
    if (allBefore) {
      this.dependencies.operationLog.remove(record.id);
      await this.dependencies.persist();
      const indexRefreshError = await this.refreshIndexSafely();
      return { status: "removed", files: classified.map(withRecoveryState), indexRefreshError };
    }
    if (allAfter) {
      const applied = this.dependencies.operationLog.updateCleanupStatus(record.id, "applied")!;
      await this.dependencies.persist();
      const indexRefreshError = await this.refreshIndexSafely();
      return { status: "applied", record: applied, files: classified.map(withRecoveryState), indexRefreshError };
    }

    const target: CleanupRecoveryTarget = record.status === "applying" ? "before" : "after";
    const recovery = this.dependencies.operationLog.setCleanupRecoveryTarget(
      record.id,
      target,
      classified.map(withRecoveryState)
    )!;
    await this.dependencies.persist();
    const indexRefreshError = await this.refreshIndexSafely();
    return { status: "recoveryRequired", record: recovery, files: recovery.files, indexRefreshError };
  }

  async retryRecovery(record = this.dependencies.operationLog.latestUnresolvedCleanup()): Promise<CleanupRecoveryResult> {
    if (!record || record.status !== "recoveryRequired" || !record.recoveryTarget) {
      return { status: "none", files: [] };
    }
    const classified = await this.classify(record);
    if (classified.some((item) => item.state === "missing" || item.state === "conflict")) {
      const recovery = this.dependencies.operationLog.setCleanupRecoveryTarget(
        record.id,
        record.recoveryTarget,
        classified.map(withRecoveryState)
      )!;
      await this.dependencies.persist();
      return { status: "conflict", record: recovery, files: recovery.files };
    }

    const target = record.recoveryTarget;
    try {
      for (const item of orderForTarget(classified, target)) {
        if (item.state !== target) await this.moveToTarget(item, target);
      }
    } catch (error) {
      const current = await this.classify(record);
      const recovery = this.dependencies.operationLog.setCleanupRecoveryTarget(
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

    return this.finishTarget(record, target);
  }

  async undoLatestAppliedCleanup(): Promise<CleanupRecoveryResult> {
    const record = this.dependencies.operationLog.latestCleanupV2("applied");
    if (!record) return { status: "none", files: [] };
    const classified = await this.classify(record);
    if (classified.some((item) => item.state !== "after")) {
      return { status: "conflict", record, files: classified.map(withRecoveryState) };
    }

    this.dependencies.operationLog.updateCleanupStatus(record.id, "undoing");
    await this.dependencies.persist();
    const attempted: ClassifiedCleanupFile[] = [];
    try {
      for (const item of orderForTarget(classified, "before")) {
        attempted.push(item);
        await this.moveToTarget(item, "before");
      }
      this.dependencies.operationLog.remove(record.id);
      await this.dependencies.persist();
      const indexRefreshError = await this.refreshIndexSafely();
      return { status: "removed", files: classified.map(withRecoveryState), indexRefreshError };
    } catch (error) {
      let compensationFailed = false;
      for (const item of [...attempted].reverse()) {
        try {
          const current = await this.classifyOne(item.change);
          if (current.state === "missing" || current.state === "conflict") throw new Error("Undo compensation conflict.");
          if (current.state !== "after") await this.moveToTarget(current, "after");
        } catch {
          compensationFailed = true;
        }
      }

      if (!compensationFailed) {
        const applied = this.dependencies.operationLog.updateCleanupStatus(record.id, "applied")!;
        await this.dependencies.persist();
        const indexRefreshError = await this.refreshIndexSafely();
        return {
          status: "applied",
          record: applied,
          files: applied.files,
          error: errorMessage(error),
          indexRefreshError
        };
      }

      const current = await this.classify(record);
      const recovery = this.dependencies.operationLog.setCleanupRecoveryTarget(
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

  private async finishTarget(
    record: CleanupOperationRecordV2,
    target: CleanupRecoveryTarget
  ): Promise<CleanupRecoveryResult> {
    if (target === "before") {
      this.dependencies.operationLog.remove(record.id);
      await this.dependencies.persist();
      const indexRefreshError = await this.refreshIndexSafely();
      return { status: "removed", files: record.files, indexRefreshError };
    }
    const current = await this.classify(record);
    const updatedFiles = current.map((item) => ({
      ...item.change,
      afterContentHash: item.inlineSnapshot?.contentHash ?? item.change.afterContentHash,
      recoveryState: item.state
    }));
    this.dependencies.operationLog.updateCleanupFiles(record.id, updatedFiles);
    const applied = this.dependencies.operationLog.updateCleanupStatus(record.id, "applied")!;
    await this.dependencies.persist();
    const indexRefreshError = await this.refreshIndexSafely();
    return { status: "applied", record: applied, files: applied.files, indexRefreshError };
  }

  private async moveToTarget(item: ClassifiedCleanupFile, target: CleanupRecoveryTarget): Promise<void> {
    if (!item.file || item.state === "missing" || item.state === "conflict") {
      throw new Error(`${item.change.notePath}: cleanup state is not safely recoverable.`);
    }
    if (target === "before") {
      await this.moveToBefore(item);
    } else {
      await this.moveToAfter(item);
    }
  }

  private async moveToBefore(item: ClassifiedCleanupFile): Promise<void> {
    let snapshot = item.inlineSnapshot ?? (await this.dependencies.inlineWriter.readSnapshot(item.file!));
    const currentTags = this.dependencies.frontmatterWriter.readCurrentTags(item.file!);
    if (!sameTags(currentTags, item.change.beforeTags)) {
      const restored = await this.dependencies.frontmatterWriter.replaceTagsIfSnapshotMatches(
        item.file!,
        { beforeTags: item.change.afterTags, sourceContentHash: snapshot.contentHash },
        item.change.beforeTags
      );
      snapshot = {
        contentHash: restored.afterContentHash ?? snapshot.contentHash,
        bodyHash: snapshot.bodyHash
      };
    }
    if (snapshot.bodyHash !== item.change.beforeBodyHash && item.change.inlineEdits.length > 0) {
      await this.dependencies.inlineWriter.apply(
        item.file!,
        createReverseInlineTagWritePatch(item.change.inlineEdits, snapshot.contentHash, item.change.afterBodyHash)
      );
    }
  }

  private async moveToAfter(item: ClassifiedCleanupFile): Promise<void> {
    let snapshot = item.inlineSnapshot ?? (await this.dependencies.inlineWriter.readSnapshot(item.file!));
    if (snapshot.bodyHash !== item.change.afterBodyHash && item.change.inlineEdits.length > 0) {
      const applied = await this.dependencies.inlineWriter.apply(item.file!, {
        expectedContentHash: snapshot.contentHash,
        expectedBodyHash: item.change.beforeBodyHash,
        edits: item.change.inlineEdits
      });
      snapshot = { contentHash: applied.afterContentHash, bodyHash: applied.afterBodyHash };
    }
    const currentTags = this.dependencies.frontmatterWriter.readCurrentTags(item.file!);
    if (!sameTags(currentTags, item.change.afterTags)) {
      await this.dependencies.frontmatterWriter.replaceTagsIfSnapshotMatches(
        item.file!,
        { beforeTags: item.change.beforeTags, sourceContentHash: snapshot.contentHash },
        item.change.afterTags
      );
    }
  }

  private async classify(record: CleanupOperationRecordV2): Promise<ClassifiedCleanupFile[]> {
    return Promise.all(record.files.map((change) => this.classifyOne(change)));
  }

  private async classifyOne(change: CleanupFileChangeV2): Promise<ClassifiedCleanupFile> {
    const file = this.dependencies.findFile(change.notePath);
    if (!file) return { change, file: null, state: "missing" };
    try {
      const inlineSnapshot = await this.dependencies.inlineWriter.readSnapshot(file);
      const tags = this.dependencies.frontmatterWriter.readCurrentTags(file);
      return {
        change,
        file,
        state: classifyCleanupFileState(tags, inlineSnapshot.bodyHash, change) ?? "conflict",
        inlineSnapshot
      };
    } catch {
      return { change, file, state: "conflict" };
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

function orderForTarget(items: ClassifiedCleanupFile[], target: CleanupRecoveryTarget): ClassifiedCleanupFile[] {
  return [...items].sort((left, right) =>
    target === "before"
      ? right.change.notePath.localeCompare(left.change.notePath)
      : left.change.notePath.localeCompare(right.change.notePath)
  );
}

function withRecoveryState(item: ClassifiedCleanupFile): CleanupFileChangeV2 {
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
