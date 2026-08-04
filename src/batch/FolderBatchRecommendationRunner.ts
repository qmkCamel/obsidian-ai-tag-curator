// Generates per-note folder-batch candidates with bounded concurrency and immediate generation cancellation.
import type { RecommendationResult } from "../ai/RecommendationSchema";
import type { IndexedNote, TagIndex } from "../index/TagIndex";
import {
  createAiCandidates,
  createInlineSyncCandidates,
  deriveFolderBatchItemPlanStatus,
  deriveFolderBatchStatus,
  type FolderBatchPlan,
  type FolderBatchPlanItem
} from "./FolderBatchPlan";

export interface FolderBatchRunnerDependencies {
  readNote(notePath: string): Promise<IndexedNote>;
  recommendForNote(note: IndexedNote, index: TagIndex): Promise<RecommendationResult>;
  inlineSyncReason: string;
}

export interface FolderBatchProgressSnapshot {
  plan: FolderBatchPlan;
  completed: number;
  total: number;
  sourceReady: number;
  sourceFailed: number;
  aiReady: number;
  aiFailed: number;
  cancelled: number;
  planReady: number;
  noChange: number;
}

export type FolderBatchProgressListener = (snapshot: FolderBatchProgressSnapshot) => void;

export class FolderBatchRecommendationRunner {
  private plan: FolderBatchPlan | null = null;
  private generation = 0;
  private cancelled = false;
  private listener: FolderBatchProgressListener | undefined;
  private frozenNotes = new Map<string, IndexedNote>();

  constructor(
    private readonly dependencies: FolderBatchRunnerDependencies,
    private readonly concurrency = 2
  ) {
    if (concurrency < 1 || concurrency > 2) {
      throw new Error("Folder batch recommendation concurrency must be between 1 and 2.");
    }
  }

  async run(
    initialPlan: FolderBatchPlan,
    index: TagIndex,
    onProgress?: FolderBatchProgressListener
  ): Promise<FolderBatchPlan> {
    this.plan = clonePlan(initialPlan);
    this.listener = onProgress;
    this.cancelled = false;
    const generation = ++this.generation;
    const paths = [...this.plan.filePaths];
    let cursor = 0;

    this.emit();
    const worker = async (): Promise<void> => {
      while (generation === this.generation && !this.cancelled) {
        const path = paths[cursor++];
        if (path === undefined) {
          return;
        }
        await this.processPath(path, index, generation, false);
      }
    };

    await Promise.all(Array.from({ length: Math.min(this.concurrency, paths.length) }, () => worker()));
    return clonePlan(this.requirePlan());
  }

  cancel(): FolderBatchPlan | null {
    if (!this.plan) {
      return null;
    }

    this.cancelled = true;
    this.generation += 1;
    this.plan = updateAllItems(this.plan, (item) => cancelItem(item));
    this.plan = derivePlan(this.plan);
    this.emit();
    return clonePlan(this.plan);
  }

  async retryFailed(
    index: TagIndex,
    onProgress?: FolderBatchProgressListener,
    reviewedPlan?: FolderBatchPlan
  ): Promise<FolderBatchPlan> {
    if (reviewedPlan) {
      this.plan = clonePlan(reviewedPlan);
    }
    const current = this.requirePlan();
    this.listener = onProgress ?? this.listener;
    this.cancelled = false;
    const generation = ++this.generation;
    const paths = current.items
      .filter((item) => item.sourceStatus === "failed" || item.aiStatus === "failed")
      .map((item) => item.notePath);
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (generation === this.generation && !this.cancelled) {
        const path = paths[cursor++];
        if (path === undefined) {
          return;
        }
        await this.processPath(path, index, generation, true);
      }
    };

    await Promise.all(Array.from({ length: Math.min(this.concurrency, paths.length) }, () => worker()));
    return clonePlan(this.requirePlan());
  }

  getSnapshot(): FolderBatchProgressSnapshot | null {
    return this.plan ? buildFolderBatchProgressSnapshot(this.plan) : null;
  }

  private async processPath(notePath: string, index: TagIndex, generation: number, retry: boolean): Promise<void> {
    const existingItem = this.findItem(notePath);
    let note = retry && existingItem.sourceStatus === "ready" ? this.frozenNotes.get(notePath) : undefined;

    if (!note) {
      this.updateItem(notePath, (item) => ({
        ...item,
        sourceStatus: "pending",
        aiStatus: "notStarted",
        planStatus: "pending",
        sourceError: undefined,
        aiError: undefined,
        candidates: []
      }));
      try {
        note = await this.dependencies.readNote(notePath);
      } catch (error) {
        if (!this.isCurrent(generation)) {
          return;
        }
        this.updateItem(notePath, (item) => ({
          ...item,
          sourceStatus: "failed",
          aiStatus: "notStarted",
          sourceError: errorMessage(error),
          candidates: []
        }));
        return;
      }

      if (!this.isCurrent(generation)) {
        return;
      }
      this.frozenNotes.set(notePath, note);
      const localCandidates = createInlineSyncCandidates(
        notePath,
        {
          frontmatterTags: note.frontmatterTags,
          inlineTags: note.inlineTags,
          allTags: note.allTags
        },
        this.dependencies.inlineSyncReason
      );
      this.updateItem(notePath, (item) => ({
        ...item,
        beforeTags: note!.frontmatterTags,
        sourceContentHash: note!.sourceContentHash,
        inventory: {
          frontmatterTags: note!.frontmatterTags,
          inlineTags: note!.inlineTags,
          allTags: note!.allTags
        },
        sourceStatus: "ready",
        aiStatus: "pending",
        sourceError: undefined,
        aiError: undefined,
        candidates: localCandidates
      }));
    } else {
      this.updateItem(notePath, (item) => ({
        ...item,
        aiStatus: "pending",
        aiError: undefined,
        candidates: item.candidates.filter((candidate) => candidate.source === "inline")
      }));
    }

    try {
      const result = await this.dependencies.recommendForNote(note, index);
      if (!this.isCurrent(generation)) {
        return;
      }
      this.updateItem(notePath, (item) => ({
        ...item,
        aiStatus: "ready",
        aiError: undefined,
        candidates: [
          ...item.candidates.filter((candidate) => candidate.source === "inline"),
          ...createAiCandidates(
            notePath,
            result.recommendations,
            this.requirePlan().settings.allowNewTags,
            Object.keys(index.tags)
          )
        ]
      }));
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return;
      }
      this.updateItem(notePath, (item) => ({
        ...item,
        aiStatus: "failed",
        aiError: errorMessage(error),
        candidates: item.candidates.filter((candidate) => candidate.source === "inline")
      }));
    }
  }

  private updateItem(notePath: string, update: (item: FolderBatchPlanItem) => FolderBatchPlanItem): void {
    const plan = this.requirePlan();
    const items = plan.items.map((item) => {
      if (item.notePath !== notePath) {
        return item;
      }
      const updated = update(item);
      return { ...updated, planStatus: deriveFolderBatchItemPlanStatus(updated) };
    });
    this.plan = { ...plan, items, status: deriveFolderBatchStatus(items) };
    this.emit();
  }

  private findItem(notePath: string): FolderBatchPlanItem {
    const item = this.requirePlan().items.find((candidate) => candidate.notePath === notePath);
    if (!item) {
      throw new Error(`Folder batch item not found: ${notePath}`);
    }
    return item;
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation && !this.cancelled;
  }

  private requirePlan(): FolderBatchPlan {
    if (!this.plan) {
      throw new Error("Folder batch runner has not been started.");
    }
    return this.plan;
  }

  private emit(): void {
    if (this.listener && this.plan) {
      this.listener(buildFolderBatchProgressSnapshot(this.plan));
    }
  }
}

export function buildFolderBatchProgressSnapshot(plan: FolderBatchPlan): FolderBatchProgressSnapshot {
  const completed = plan.items.filter(
    (item) => item.sourceStatus !== "pending" && item.aiStatus !== "pending"
  ).length;
  return {
    plan: clonePlan(plan),
    completed,
    total: plan.items.length,
    sourceReady: plan.items.filter((item) => item.sourceStatus === "ready").length,
    sourceFailed: plan.items.filter((item) => item.sourceStatus === "failed").length,
    aiReady: plan.items.filter((item) => item.aiStatus === "ready").length,
    aiFailed: plan.items.filter((item) => item.aiStatus === "failed").length,
    cancelled: plan.items.filter(
      (item) => item.sourceStatus === "cancelled" || item.aiStatus === "cancelled"
    ).length,
    planReady: plan.items.filter((item) => item.planStatus === "ready").length,
    noChange: plan.items.filter((item) => item.planStatus === "noChange").length
  };
}

function cancelItem(item: FolderBatchPlanItem): FolderBatchPlanItem {
  if (item.aiStatus === "ready" || item.aiStatus === "failed" || item.sourceStatus === "failed") {
    return item;
  }
  if (item.sourceStatus === "ready") {
    return { ...item, aiStatus: "cancelled", planStatus: item.candidates.length > 0 ? "ready" : "unavailable" };
  }
  return { ...item, sourceStatus: "cancelled", aiStatus: "cancelled", planStatus: "unavailable" };
}

function derivePlan(plan: FolderBatchPlan): FolderBatchPlan {
  const items = plan.items.map((item) => ({ ...item, planStatus: deriveFolderBatchItemPlanStatus(item) }));
  return { ...plan, items, status: deriveFolderBatchStatus(items) };
}

function updateAllItems(
  plan: FolderBatchPlan,
  update: (item: FolderBatchPlanItem) => FolderBatchPlanItem
): FolderBatchPlan {
  return { ...plan, items: plan.items.map(update) };
}

function clonePlan(plan: FolderBatchPlan): FolderBatchPlan {
  return {
    ...plan,
    filePaths: [...plan.filePaths],
    settings: { ...plan.settings },
    items: plan.items.map((item) => ({
      ...item,
      beforeTags: item.beforeTags ? [...item.beforeTags] : undefined,
      inventory: item.inventory
        ? {
            frontmatterTags: [...item.inventory.frontmatterTags],
            inlineTags: [...item.inventory.inlineTags],
            allTags: [...item.inventory.allTags]
          }
        : undefined,
      candidates: item.candidates.map((candidate) => ({ ...candidate }))
    }))
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
