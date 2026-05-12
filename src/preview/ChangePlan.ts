// Creates a safe before-and-after tag write plan from selected recommendations.
import { normalizeTag } from "../utils/normalizeTag";

export interface CreateChangePlanInput {
  notePath: string;
  beforeTags: string[];
  selectedTags: string[];
  createdAt?: Date;
}

export interface ChangePlan {
  notePath: string;
  beforeTags: string[];
  afterTags: string[];
  addedTags: string[];
  unchangedTags: string[];
  skippedTags: string[];
  createdAt: string;
}

export function createChangePlan(input: CreateChangePlanInput): ChangePlan {
  const beforeTags = normalizeTagList(input.beforeTags);
  const selectedTags = normalizeTagList(input.selectedTags);
  const beforeSet = new Set(beforeTags);
  const afterTags = [...beforeTags];
  const addedTags: string[] = [];
  const skippedTags: string[] = [];

  for (const tag of selectedTags) {
    if (beforeSet.has(tag)) {
      continue;
    }

    if (afterTags.includes(tag)) {
      skippedTags.push(tag);
      continue;
    }

    afterTags.push(tag);
    addedTags.push(tag);
  }

  return {
    notePath: input.notePath,
    beforeTags,
    afterTags,
    addedTags,
    unchangedTags: beforeTags,
    skippedTags,
    createdAt: (input.createdAt ?? new Date()).toISOString()
  };
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
