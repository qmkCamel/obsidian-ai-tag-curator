// Hydrates one cleanup item into a cancellable, occurrence-level review plan.
import type { CleanupPlanItem } from "./CleanupPlan";
import type { InlineTagOccurrenceReadResult } from "../obsidian/InlineTagOccurrenceReader";
import { normalizeTag } from "../utils/normalizeTag";
import { resolveCleanupActionCapability } from "./CleanupActionCapability";
import { captureTagValueSnapshot, createCleanupTagValuePatch, normalizedSnapshotTags, sameTagValue, tagValueFields, validateTagLiteral } from "../obsidian/TagValuePatch";
import {
  type CleanupReviewAction,
  type CleanupReviewFile,
  type CleanupReviewPlan,
  type DeterministicCleanupInput,
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
    if (item.capability.availability !== "executable" || resolveCleanupActionCapability(item.issueType, item.action).availability !== "executable") {
      throw new Error("This health suggestion does not authorize executable cleanup.");
    }
    const sourceSet = new Set(uniqueNormalized(item.tags).filter((tag) => tag !== normalizeTag(item.targetTag!)));
    return this.buildInput({
      id: item.id, title: item.title, action: item.action as CleanupReviewAction,
      sourceTags: item.tags, targetTag: item.targetTag!,
      candidatePaths: item.files.filter((file) => file.beforeTags.some((tag) => sourceSet.has(normalizeTag(tag)))).map((file) => file.path)
    }, onProgress);
  }

  async buildInput(input: DeterministicCleanupInput, onProgress?: CleanupReviewProgressListener): Promise<CleanupReviewPlan> {
    const targetTag = validateTagLiteral(input.targetTag);
    validateCleanupReviewIdentity(input.action, input.sourceTags, targetTag);
    input.sourceTags.forEach(validateTagLiteral);
    const action = input.action;
    const sourceTags = uniqueNormalized(input.sourceTags).filter((tag) => tag !== normalizeTag(targetTag));
    const generation = ++this.generation;
    const paths = Array.from(new Set(input.candidatePaths)).sort((left, right) => left.localeCompare(right));
    if (paths.length > 200) throw new Error("Cleanup review is limited to 200 candidate files; narrow the scope.");
    if (paths.some((path) => !path)) throw new Error("Candidate paths must be non-empty.");
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
      itemId: input.id,
      title: input.title,
      context: input.context,
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
  if (read.tagValueError) return { ...emptyReviewFile(read.notePath), status: "unavailable", error: read.tagValueError };
  // Compatibility readers may omit the field, but their actual Markdown still supplies the evidence.
  const before = read.tagValueSnapshot ?? captureTagValueSnapshot(read.content);
  const patch = createCleanupTagValuePatch(before, sourceTags, targetTag);
  const beforeTags = normalizedSnapshotTags(patch.before);
  const proposedAfterTags = normalizedSnapshotTags(patch.after);
  const frontmatterChanged = !sameTagValue(patch.before, patch.after);
  const occurrences = read.occurrences.filter((occurrence) => sourceSet.has(occurrence.normalizedTag)).map((occurrence) => ({
    ...occurrence,
    afterText: `#${targetTag}`,
    selected: occurrence.availability === "trusted"
  }));
  const hasTrusted = occurrences.some((occurrence) => occurrence.availability === "trusted");
  const status = frontmatterChanged || hasTrusted ? "ready" : "unavailable";

  return {
    ...tagValueFields(patch),
    notePath: read.notePath,
    status,
    sourceContentHash: read.sourceContentHash,
    beforeBodyHash: read.bodyHash,
    beforeTags,
    proposedAfterTags,
    frontmatterChanged,
    frontmatterSelected: frontmatterChanged,
    occurrences
  };
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
