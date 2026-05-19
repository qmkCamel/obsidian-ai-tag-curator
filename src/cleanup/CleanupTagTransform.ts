// Applies one cleanup file preview to a note's frontmatter tag list without touching inline tags.
import type { CleanupPlanFilePreview } from "./CleanupPlan";
import { normalizeTag } from "../utils/normalizeTag";

export function applyCleanupPreviewToFrontmatterTags(
  currentTags: string[],
  preview: CleanupPlanFilePreview
): string[] {
  const beforeSet = new Set(preview.beforeTags.map(normalizeTag).filter(Boolean));
  if (beforeSet.size === 0 || !currentTags.some((tag) => beforeSet.has(normalizeTag(tag)))) {
    return currentTags;
  }

  const replacementTags = preview.afterTags.map(normalizeTag).filter(Boolean);
  const result: string[] = [];
  let insertedReplacement = false;

  for (const tag of currentTags) {
    const normalized = normalizeTag(tag);
    if (!beforeSet.has(normalized)) {
      result.push(tag);
      continue;
    }

    if (!insertedReplacement) {
      result.push(...replacementTags);
      insertedReplacement = true;
    }
  }

  return dedupeTags(result);
}

function dedupeTags(tags: string[]): string[] {
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
