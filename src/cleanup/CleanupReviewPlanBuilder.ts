// Hydrates one cleanup item into a cancellable, occurrence-level review plan.
import type { CleanupPlanItem } from "./CleanupPlan";
import type { InlineTagOccurrenceReadResult } from "../obsidian/InlineTagOccurrenceReader";
import { normalizeTag } from "../utils/normalizeTag";
import {
  type CleanupReviewAction,
  type CleanupReviewFile,
  type CleanupReviewPlan,
  validateCleanupReviewIdentity
} from "./CleanupReviewPlan";

export interface CleanupReviewPlanBuilderDependencies {
  readOccurrences(notePath: string, relevantTags: string[]): Promise<InlineTagOccurrenceReadResult>;
}

export interface CleanupReviewProgressSnapshot {
  total: number;
  completed: number;
  ready: number;
  unavailable: number;
  failed: number;
  cancelled: number;
}

export type CleanupReviewProgressListener = (snapshot: CleanupReviewProgressSnapshot) => void;

export class CleanupReviewPlanBuilder {
  private generation = 0;

  constructor(private readonly dependencies: CleanupReviewPlanBuilderDependencies) {}

  cancel(): void {
    this.generation += 1;
  }

  async build(item: CleanupPlanItem, onProgress?: CleanupReviewProgressListener): Promise<CleanupReviewPlan> {
    validateCleanupReviewIdentity(item.action, item.tags, item.targetTag);
    const action = item.action as CleanupReviewAction;
    const targetTag = normalizeTag(item.targetTag!);
    const sourceTags = uniqueNormalized(item.tags).filter((tag) => tag !== targetTag);
    const generation = ++this.generation;
    const sourceSet = new Set(sourceTags);
    const paths = Array.from(
      new Set(
        item.files
          .filter((file) => file.beforeTags.some((tag) => sourceSet.has(normalizeTag(tag))))
          .map((file) => file.path)
      )
    ).sort((left, right) => left.localeCompare(right));
    const files = new Map<string, CleanupReviewFile>(
      paths.map((notePath) => [notePath, emptyReviewFile(notePath)])
    );
    let nextIndex = 0;
    emitProgress(files, onProgress);

    const workers = Array.from({ length: Math.min(4, paths.length) }, async () => {
      while (generation === this.generation) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= paths.length) return;
        const notePath = paths[index];
        try {
          const read = await this.dependencies.readOccurrences(notePath, sourceTags);
          if (generation !== this.generation) return;
          files.set(notePath, buildReviewFile(read, sourceTags, targetTag));
        } catch (error) {
          if (generation !== this.generation) return;
          files.set(notePath, {
            ...emptyReviewFile(notePath),
            status: "failed",
            error: error instanceof Error ? error.message : String(error)
          });
        }
        emitProgress(files, onProgress);
      }
    });

    await Promise.all(workers);
    const cancelled = generation !== this.generation;
    if (cancelled) {
      for (const [path, file] of files.entries()) {
        if (file.status === "pending") files.set(path, { ...file, status: "cancelled" });
      }
    }
    emitProgress(files, onProgress);

    return {
      itemId: item.id,
      title: item.title,
      action,
      sourceTags,
      targetTag,
      createdAt: new Date().toISOString(),
      files: paths.map((path) => files.get(path)!),
      cancelled
    };
  }
}

function buildReviewFile(
  read: InlineTagOccurrenceReadResult,
  sourceTags: string[],
  targetTag: string
): CleanupReviewFile {
  const sourceSet = new Set(sourceTags);
  const proposedAfterTags = transformFrontmatterTags(read.frontmatterTags, sourceSet, targetTag);
  const frontmatterChanged = !sameTags(read.frontmatterTags, proposedAfterTags);
  const occurrences = read.occurrences.map((occurrence) => ({
    ...occurrence,
    afterText: `#${targetTag}`,
    selected: occurrence.availability === "trusted"
  }));
  const hasTrusted = occurrences.some((occurrence) => occurrence.availability === "trusted");
  const status = frontmatterChanged || hasTrusted ? "ready" : "unavailable";

  return {
    notePath: read.notePath,
    status,
    sourceContentHash: read.sourceContentHash,
    beforeBodyHash: read.bodyHash,
    beforeTags: [...read.frontmatterTags],
    proposedAfterTags,
    frontmatterChanged,
    frontmatterSelected: frontmatterChanged,
    occurrences
  };
}

function transformFrontmatterTags(currentTags: string[], sourceSet: Set<string>, targetTag: string): string[] {
  const result: string[] = [];
  let insertedTarget = false;
  for (const rawTag of currentTags) {
    const tag = normalizeTag(rawTag);
    if (!sourceSet.has(tag)) {
      if (tag && !result.includes(tag)) result.push(tag);
      continue;
    }
    if (!insertedTarget && !result.includes(targetTag)) {
      result.push(targetTag);
      insertedTarget = true;
    }
  }
  return result;
}

function emptyReviewFile(notePath: string): CleanupReviewFile {
  return {
    notePath,
    status: "pending",
    beforeTags: [],
    proposedAfterTags: [],
    frontmatterChanged: false,
    frontmatterSelected: false,
    occurrences: []
  };
}

function emitProgress(
  files: Map<string, CleanupReviewFile>,
  listener: CleanupReviewProgressListener | undefined
): void {
  if (!listener) return;
  const values = Array.from(files.values());
  listener({
    total: values.length,
    completed: values.filter((file) => file.status !== "pending").length,
    ready: values.filter((file) => file.status === "ready").length,
    unavailable: values.filter((file) => file.status === "unavailable").length,
    failed: values.filter((file) => file.status === "failed").length,
    cancelled: values.filter((file) => file.status === "cancelled").length
  });
}

function uniqueNormalized(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean)));
}

function sameTags(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((tag, index) => normalizeTag(tag) === normalizeTag(right[index]));
}
