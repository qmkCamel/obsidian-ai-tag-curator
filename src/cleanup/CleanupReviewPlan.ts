// Models the reviewed frontmatter and inline-token changes for one deterministic cleanup action.
import type { TagHealthSuggestion } from "../health/TagHealthReport";
import type { InlineOccurrenceAvailability, InlineTagOccurrence } from "../obsidian/InlineTagOccurrenceReader";
import { isInlineTagToken } from "../obsidian/InlineTagOccurrenceReader";
import { normalizeTag } from "../utils/normalizeTag";

export type CleanupReviewAction = Extract<TagHealthSuggestion, "merge" | "rename">;
export type CleanupReviewFileStatus = "pending" | "ready" | "unavailable" | "failed" | "cancelled";
export type CleanupReviewConflictKind = "missing" | "tagsChanged" | "contentChanged" | "tokenChanged";

export interface CleanupReviewOccurrence extends InlineTagOccurrence {
  afterText: string;
  selected: boolean;
}

export interface InlineTextEdit {
  occurrenceId: string;
  beforeBodyStart: number;
  beforeBodyEnd: number;
  afterBodyStart: number;
  afterBodyEnd: number;
  beforeText: string;
  afterText: string;
}

export interface CleanupReviewFile {
  notePath: string;
  status: CleanupReviewFileStatus;
  sourceContentHash?: string;
  beforeBodyHash?: string;
  beforeTags: string[];
  proposedAfterTags: string[];
  frontmatterChanged: boolean;
  frontmatterSelected: boolean;
  occurrences: CleanupReviewOccurrence[];
  error?: string;
}

export interface CleanupReviewPlan {
  itemId: string;
  title: string;
  action: CleanupReviewAction;
  sourceTags: string[];
  targetTag: string;
  createdAt: string;
  files: CleanupReviewFile[];
  cancelled: boolean;
}

export interface SelectedCleanupFilePatch {
  notePath: string;
  sourceContentHash: string;
  beforeBodyHash: string;
  beforeTags: string[];
  afterTags: string[];
  inlineEdits: InlineTextEdit[];
}

export type CleanupReviewFilePatch = SelectedCleanupFilePatch;

export interface SelectedCleanupPlan {
  itemId: string;
  title: string;
  action: CleanupReviewAction;
  sourceTags: string[];
  targetTag: string;
  createdAt: string;
  files: SelectedCleanupFilePatch[];
  fileCount: number;
  frontmatterChangeCount: number;
  inlineEditCount: number;
  remainingSourceCount: number;
  partial: boolean;
}

export type InlineEditDirection = "forward" | "reverse";

export class InvalidCleanupReviewPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCleanupReviewPlanError";
  }
}

export function setCleanupFrontmatterSelected(
  plan: CleanupReviewPlan,
  notePath: string,
  selected: boolean
): CleanupReviewPlan {
  return mapReviewFile(plan, notePath, (file) => ({
    ...file,
    frontmatterSelected: file.frontmatterChanged && selected
  }));
}

export function setCleanupOccurrenceSelected(
  plan: CleanupReviewPlan,
  occurrenceId: string,
  selected: boolean
): CleanupReviewPlan {
  return {
    ...plan,
    files: plan.files.map((file) => ({
      ...file,
      occurrences: file.occurrences.map((occurrence) =>
        occurrence.id === occurrenceId
          ? { ...occurrence, selected: occurrence.availability === "trusted" && selected }
          : occurrence
      )
    }))
  };
}

export function selectAllTrustedCleanupChanges(plan: CleanupReviewPlan): CleanupReviewPlan {
  return {
    ...plan,
    files: plan.files.map((file) => ({
      ...file,
      frontmatterSelected: file.frontmatterChanged,
      occurrences: file.occurrences.map((occurrence) => ({
        ...occurrence,
        selected: occurrence.availability === "trusted"
      }))
    }))
  };
}

export function clearAllCleanupChanges(plan: CleanupReviewPlan): CleanupReviewPlan {
  return {
    ...plan,
    files: plan.files.map((file) => ({
      ...file,
      frontmatterSelected: false,
      occurrences: file.occurrences.map((occurrence) => ({ ...occurrence, selected: false }))
    }))
  };
}

export function buildSelectedCleanupPlan(plan: CleanupReviewPlan): SelectedCleanupPlan {
  validateCleanupReviewIdentity(plan.action, plan.sourceTags, plan.targetTag);
  const files: SelectedCleanupFilePatch[] = [];
  let frontmatterChangeCount = 0;
  let inlineEditCount = 0;
  let remainingSourceCount = 0;
  let partial = false;

  for (const file of plan.files) {
    const trusted = file.occurrences.filter((occurrence) => occurrence.availability === "trusted");
    const selectedOccurrences = trusted.filter((occurrence) => occurrence.selected);
    const unselectedTrusted = trusted.length - selectedOccurrences.length;
    const unavailable = file.occurrences.length - trusted.length;
    remainingSourceCount += unselectedTrusted + unavailable;
    partial ||= unselectedTrusted > 0 || unavailable > 0 || (file.frontmatterChanged && !file.frontmatterSelected);

    if (file.status !== "ready" || !file.sourceContentHash || !file.beforeBodyHash) {
      partial ||= file.status === "failed" || file.status === "unavailable";
      continue;
    }

    const inlineEdits = createInlineTextEdits(selectedOccurrences);
    const afterTags = file.frontmatterSelected ? [...file.proposedAfterTags] : [...file.beforeTags];
    const frontmatterChanged = !sameTagList(file.beforeTags, afterTags);
    if (!frontmatterChanged && inlineEdits.length === 0) {
      continue;
    }

    if (frontmatterChanged) frontmatterChangeCount += 1;
    inlineEditCount += inlineEdits.length;
    files.push({
      notePath: file.notePath,
      sourceContentHash: file.sourceContentHash,
      beforeBodyHash: file.beforeBodyHash,
      beforeTags: [...file.beforeTags],
      afterTags,
      inlineEdits
    });
  }

  return {
    itemId: plan.itemId,
    title: plan.title,
    action: plan.action,
    sourceTags: [...plan.sourceTags],
    targetTag: plan.targetTag,
    createdAt: plan.createdAt,
    files,
    fileCount: files.length,
    frontmatterChangeCount,
    inlineEditCount,
    remainingSourceCount,
    partial
  };
}

export function validateCleanupReviewIdentity(
  action: TagHealthSuggestion,
  sourceTags: string[],
  targetTag: string | undefined
): asserts action is CleanupReviewAction {
  if (action !== "merge" && action !== "rename") {
    throw new InvalidCleanupReviewPlanError("Only deterministic merge or rename cleanup actions can rewrite inline tags.");
  }
  if (!targetTag || !isInlineTagToken(`#${targetTag}`)) {
    throw new InvalidCleanupReviewPlanError("A valid target tag is required for inline cleanup.");
  }
  const normalizedTarget = normalizeTag(targetTag);
  const normalizedSources = new Set(sourceTags.map(normalizeTag).filter(Boolean));
  normalizedSources.delete(normalizedTarget);
  if (normalizedSources.size === 0) {
    throw new InvalidCleanupReviewPlanError("At least one source tag distinct from the target is required.");
  }
}

export function createInlineTextEdits(occurrences: CleanupReviewOccurrence[]): InlineTextEdit[] {
  const sorted = [...occurrences].sort((left, right) => left.bodyStart - right.bodyStart || left.bodyEnd - right.bodyEnd);
  let delta = 0;
  let previousEnd = -1;
  return sorted.map((occurrence) => {
    if (occurrence.availability !== "trusted") {
      throw new InvalidCleanupReviewPlanError(`Occurrence ${occurrence.id} is not trusted.`);
    }
    if (occurrence.bodyStart < previousEnd || occurrence.bodyEnd < occurrence.bodyStart) {
      throw new InvalidCleanupReviewPlanError("Inline tag edits overlap or have invalid ranges.");
    }
    if (!isInlineTagToken(occurrence.sourceText) || !isInlineTagToken(occurrence.afterText)) {
      throw new InvalidCleanupReviewPlanError("Inline tag edits must replace complete tag tokens.");
    }
    const afterBodyStart = occurrence.bodyStart + delta;
    const afterBodyEnd = afterBodyStart + occurrence.afterText.length;
    const edit: InlineTextEdit = {
      occurrenceId: occurrence.id,
      beforeBodyStart: occurrence.bodyStart,
      beforeBodyEnd: occurrence.bodyEnd,
      afterBodyStart,
      afterBodyEnd,
      beforeText: occurrence.sourceText,
      afterText: occurrence.afterText
    };
    previousEnd = occurrence.bodyEnd;
    delta += occurrence.afterText.length - occurrence.sourceText.length;
    return edit;
  });
}

export function applyInlineTextEdits(
  body: string,
  edits: InlineTextEdit[],
  direction: InlineEditDirection = "forward"
): string {
  const ranges = edits
    .map((edit) => ({
      start: direction === "forward" ? edit.beforeBodyStart : edit.afterBodyStart,
      end: direction === "forward" ? edit.beforeBodyEnd : edit.afterBodyEnd,
      beforeText: direction === "forward" ? edit.beforeText : edit.afterText,
      afterText: direction === "forward" ? edit.afterText : edit.beforeText
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  let previousEnd = -1;
  for (const range of ranges) {
    if (range.start < 0 || range.end < range.start || range.end > body.length || range.start < previousEnd) {
      throw new InvalidCleanupReviewPlanError("Inline tag edit ranges are invalid or overlap.");
    }
    if (body.slice(range.start, range.end) !== range.beforeText) {
      throw new InvalidCleanupReviewPlanError("Inline tag token no longer matches the reviewed patch.");
    }
    previousEnd = range.end;
  }

  let result = body;
  for (const range of [...ranges].reverse()) {
    result = `${result.slice(0, range.start)}${range.afterText}${result.slice(range.end)}`;
  }
  return result;
}

export function availabilityIsTrusted(availability: InlineOccurrenceAvailability): boolean {
  return availability === "trusted";
}

function mapReviewFile(
  plan: CleanupReviewPlan,
  notePath: string,
  update: (file: CleanupReviewFile) => CleanupReviewFile
): CleanupReviewPlan {
  return { ...plan, files: plan.files.map((file) => (file.notePath === notePath ? update(file) : file)) };
}

function sameTagList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((tag, index) => normalizeTag(tag) === normalizeTag(right[index]));
}
