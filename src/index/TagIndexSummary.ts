// Summarizes a tag index into counts and top tags for the refresh result UI.
import type { TagIndex } from "./TagIndex";

export interface TagIndexSummary {
  updatedAt: string;
  totalTags: number;
  totalUsages: number;
  totalFiles: number;
  hierarchicalTags: number;
  topTags: TagIndexSummaryItem[];
}

export interface TagIndexSummaryItem {
  tag: string;
  count: number;
  fileCount: number;
}

export function summarizeTagIndex(index: TagIndex, topLimit = 20): TagIndexSummary {
  const usages = Object.values(index.tags);
  const files = new Set<string>();

  for (const usage of usages) {
    for (const file of usage.files) {
      files.add(file.path);
    }
  }

  return {
    updatedAt: index.updatedAt,
    totalTags: usages.length,
    totalUsages: usages.reduce((sum, usage) => sum + usage.count, 0),
    totalFiles: files.size,
    hierarchicalTags: usages.filter((usage) => usage.namingSignals.hasHierarchy).length,
    topTags: usages
      .map((usage) => ({
        tag: usage.tag,
        count: usage.count,
        fileCount: usage.files.length
      }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, topLimit)
  };
}
