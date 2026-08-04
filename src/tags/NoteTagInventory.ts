// Builds the normalized, source-aware tag inventory shared by single-note and folder workflows.
import { uniqueTags } from "../utils/normalizeTag";

export interface NoteTagInventory {
  frontmatterTags: string[];
  inlineTags: string[];
  allTags: string[];
}

export function createNoteTagInventory(frontmatterTags: string[], inlineTags: string[]): NoteTagInventory {
  const normalizedFrontmatterTags = uniqueTags(frontmatterTags);
  const normalizedInlineTags = uniqueTags(inlineTags);

  return {
    frontmatterTags: normalizedFrontmatterTags,
    inlineTags: normalizedInlineTags,
    allTags: uniqueTags([...normalizedFrontmatterTags, ...normalizedInlineTags])
  };
}

export function findUnsyncedInlineTags(inventory: NoteTagInventory): string[] {
  const frontmatter = new Set(inventory.frontmatterTags);
  return inventory.inlineTags.filter((tag) => !frontmatter.has(tag));
}
