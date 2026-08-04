// Creates a safe before-and-after tag write plan from selected recommendations.
import { normalizeTag } from "../utils/normalizeTag";

export interface CreateChangePlanInput {
  notePath: string;
  beforeTags: string[];
  sourceContentHash: string;
  selectedInlineTags?: string[];
  selectedAiTags?: string[];
  /** Compatibility input for recommendation records created before source separation. */
  selectedTags?: string[];
  createdAt?: Date;
}

export interface ChangePlan {
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

export function createChangePlan(input: CreateChangePlanInput): ChangePlan {
  const beforeTags = normalizeTagList(input.beforeTags);
  const selectedInlineTags = normalizeTagList(input.selectedInlineTags ?? []);
  const selectedAiTags = normalizeTagList(input.selectedAiTags ?? input.selectedTags ?? []);
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
      if (beforeSet.has(tag)) {
        skippedTags.push(tag);
        continue;
      }

      if (afterTags.includes(tag)) {
        skippedTags.push(tag);
        continue;
      }

      afterTags.push(tag);
      addedTags.push(tag);
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
