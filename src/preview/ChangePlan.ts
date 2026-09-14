// Creates a safe before-and-after tag write plan from selected recommendations.
import { normalizeTag } from "../utils/normalizeTag";
import { createAdditiveTagValuePatch, normalizedSnapshotTags, tagValueFields, validateTagLiteral, type TagValueFields, type TagValueSnapshot } from "../obsidian/TagValuePatch";

export interface CreateChangePlanInput {
  notePath: string;
  beforeTags: string[];
  tagValueSnapshot?: TagValueSnapshot;
  sourceContentHash: string;
  selectedInlineTags?: string[];
  selectedAiTags?: string[];
  /** Compatibility input for recommendation records created before source separation. */
  selectedTags?: string[];
  createdAt?: Date;
}

export interface ChangePlan extends TagValueFields {
  notePath: string;
  beforeTags: string[];
  afterTags: string[];
  addedTags: string[];
  syncedInlineTags: string[];
  aiAddedTags: string[];
  unchangedTags: string[];
  skippedTags: string[];
  sourceContentHash: string;
  createdAt: string;
}

/** Builds an additive-only frontmatter plan while preserving inline and AI source attribution. */
export function createChangePlan(input: CreateChangePlanInput): ChangePlan {
  const beforeTags = input.tagValueSnapshot ? normalizedSnapshotTags(input.tagValueSnapshot) : normalizeTagList(input.beforeTags);
  const selectedTags = (tags: string[]) => input.tagValueSnapshot ? tags.map(validateTagLiteral) : normalizeTagList(tags);
  const selectedInlineTags = selectedTags(input.selectedInlineTags ?? []);
  const selectedAiTags = selectedTags(input.selectedAiTags ?? input.selectedTags ?? []);
  const beforeSet = new Set(beforeTags);
  const afterTags = [...beforeTags];
  const addedTags: string[] = [];
  const syncedInlineTags: string[] = [];
  const aiAddedTags: string[] = [];
  const skippedTags: string[] = [];

  appendSelectedTags(selectedInlineTags, syncedInlineTags);
  appendSelectedTags(selectedAiTags, aiAddedTags);

  if (!beforeTags.every((tag) => afterTags.includes(tag))) {
    throw new Error("A tag change plan may only add frontmatter tags.");
  }

  return {
    ...tagValueFields(input.tagValueSnapshot ? createAdditiveTagValuePatch(input.tagValueSnapshot, [...syncedInlineTags, ...aiAddedTags]) : undefined),
    notePath: input.notePath,
    beforeTags,
    afterTags,
    addedTags,
    syncedInlineTags,
    aiAddedTags,
    unchangedTags: beforeTags,
    skippedTags,
    sourceContentHash: input.sourceContentHash,
    createdAt: (input.createdAt ?? new Date()).toISOString()
  };

  function appendSelectedTags(tags: string[], destination: string[]): void {
    for (const tag of tags) {
      const key = normalizeTag(tag);
      if (beforeSet.has(key)) {
        skippedTags.push(tag);
        continue;
      }

      if (afterTags.includes(key)) {
        skippedTags.push(tag);
        continue;
      }

      afterTags.push(key);
      addedTags.push(key);
      destination.push(tag);
    }
  }
}

function normalizeTagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
