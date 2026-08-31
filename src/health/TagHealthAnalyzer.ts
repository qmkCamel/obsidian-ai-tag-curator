// Produces a local, read-only diagnosis of tag taxonomy health from the cached tag index.
import type { TagIndex, TagUsage } from "../index/TagIndex";
import { summarizeTagIndex } from "../index/TagIndexSummary";
import type { TagHealthIssue, TagHealthIssueType, TagHealthReport, TagHealthSection } from "./TagHealthReport";

export function analyzeTagHealth(index: TagIndex, now = new Date()): TagHealthReport {
  const usages = Object.values(index.tags).sort((a, b) => a.tag.localeCompare(b.tag));
  const summary = summarizeTagIndex(index);
  const sections = createEmptySections();

  sections.lowFrequency.items = findLowFrequencyTags(usages);
  sections.nearDuplicates.items = findNearDuplicateTags(usages);
  sections.hierarchyInconsistency.items = findHierarchyInconsistencies(usages);
  sections.overBroad.items = findOverBroadTags(usages, summary.totalUsages, summary.totalFiles);
  sections.overNarrow.items = findOverNarrowTags(usages);
  sections.namingDrift.items = findNamingDrift(usages);

  return {
    generatedAt: now.toISOString(),
    indexUpdatedAt: index.updatedAt,
    summary: {
      ...summary,
      riskItemCount: Object.values(sections).reduce((sum, section) => sum + section.items.length, 0)
    },
    sections
  };
}

function createEmptySections(): Record<TagHealthIssueType, TagHealthSection> {
  return {
    lowFrequency: { type: "lowFrequency", items: [] },
    nearDuplicates: { type: "nearDuplicates", items: [] },
    hierarchyInconsistency: { type: "hierarchyInconsistency", items: [] },
    overBroad: { type: "overBroad", items: [] },
    overNarrow: { type: "overNarrow", items: [] },
    namingDrift: { type: "namingDrift", items: [] }
  };
}

function findLowFrequencyTags(usages: TagUsage[]): TagHealthIssue[] {
  const lowFrequencyTags = usages.filter((usage) => usage.count <= 1);
  if (lowFrequencyTags.length === 0) {
    return [];
  }

  return [
    {
      type: "lowFrequency",
      title: `${lowFrequencyTags.length} 个标签`,
      tags: lowFrequencyTags.map((usage) => usage.tag),
      evidence: `这些标签均只出现 1 次，共涉及 ${countDistinctFiles(lowFrequencyTags)} 个文件。`,
      impact: "低频标签可能是临时标签、拼写漂移，或尚未形成稳定分类。",
      suggestion: "observe"
    }
  ];
}

function findNearDuplicateTags(usages: TagUsage[]): TagHealthIssue[] {
  return groupBy(usages, (usage) => duplicateKey(usage.tag))
    .filter((group) => group.length > 1)
    .map((group) => ({
      type: "nearDuplicates",
      title: group.map((usage) => `#${usage.tag}`).join(" / "),
      tags: group.map((usage) => usage.tag),
      evidence: "这些标签在大小写、分隔符或单复数规范化后非常接近。",
      impact: "近似重复会分散检索入口，让同一主题的笔记落到多个标签下。",
      suggestion: "merge"
    }));
}

function findHierarchyInconsistencies(usages: TagUsage[]): TagHealthIssue[] {
  return groupBy(usages, (usage) => hierarchyRoot(usage.tag))
    .filter((group) => group.length > 1 && hasMixedHierarchy(group))
    .map((group) => ({
      type: "hierarchyInconsistency",
      title: group.map((usage) => `#${usage.tag}`).join(" / "),
      tags: group.map((usage) => usage.tag),
      evidence: "同一主题同时存在平铺标签和层级标签。",
      impact: "层级混用会让用户不确定应该继续使用根标签，还是迁移到子标签。",
      suggestion: "rename"
    }));
}

function findOverBroadTags(usages: TagUsage[], totalUsages: number, totalFiles: number): TagHealthIssue[] {
  const usageThreshold = Math.max(10, Math.ceil(totalUsages * 0.25));
  const fileThreshold = Math.max(5, Math.ceil(totalFiles * 0.25));

  return usages
    .filter((usage) => usage.count >= usageThreshold && usage.files.length >= fileThreshold)
    .map((usage) => ({
      type: "overBroad",
      title: `#${usage.tag}`,
      tags: [usage.tag],
      evidence: `出现 ${usage.count} 次，覆盖 ${usage.files.length} 个文件。`,
      impact: "过宽标签可能已经失去区分度，适合拆成更清晰的子主题。",
      suggestion: "rename"
    }));
}

function findOverNarrowTags(usages: TagUsage[]): TagHealthIssue[] {
  const overNarrowTags = usages.filter((usage) => usage.count <= 1 && looksOneOff(usage.tag));
  if (overNarrowTags.length === 0) {
    return [];
  }

  return [
    {
      type: "overNarrow",
      title: `${overNarrowTags.length} 个标签`,
      tags: overNarrowTags.map((usage) => usage.tag),
      evidence: "这些标签都只出现一次，且命名更像一次性标题或过长描述。",
      impact: "过细标签通常难以复用，会让标签系统越来越碎片化。",
      suggestion: "deprecate"
    }
  ];
}

function findNamingDrift(usages: TagUsage[]): TagHealthIssue[] {
  return groupBy(usages.filter((usage) => hasSeparator(usage.tag)), (usage) => separatorlessKey(usage.tag))
    .filter((group) => group.length > 1 && new Set(group.map((usage) => separatorKind(usage.tag))).size > 1)
    .map((group) => ({
      type: "namingDrift",
      title: group.map((usage) => `#${usage.tag}`).join(" / "),
      tags: group.map((usage) => usage.tag),
      evidence: "这些标签表达相近，但分隔符或命名风格不一致。",
      impact: "命名风格漂移会让新标签越来越难预测，也增加重复标签概率。",
      suggestion: "rename"
    }));
}

function groupBy<T>(items: T[], keyForItem: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyForItem(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return Array.from(groups.values());
}

function countDistinctFiles(usages: TagUsage[]): number {
  return new Set(usages.flatMap((usage) => usage.files.map((file) => file.path))).size;
}

function duplicateKey(tag: string): string {
  return stripPlural(separatorlessKey(tag));
}

function separatorlessKey(tag: string): string {
  return tag.toLowerCase().replace(/[#\s/_-]+/g, "");
}

function hierarchyRoot(tag: string): string {
  return tag.split("/")[0].toLowerCase();
}

function hasMixedHierarchy(usages: TagUsage[]): boolean {
  const depths = new Set(usages.map((usage) => usage.namingSignals.depth));
  return depths.size > 1;
}

function looksOneOff(tag: string): boolean {
  return tag.length >= 10 || /[：:，,。]/.test(tag) || tag.split(/[-_/]/).length >= 4;
}

function hasSeparator(tag: string): boolean {
  return /[-_/]/.test(tag);
}

function separatorKind(tag: string): string {
  if (tag.includes("/")) {
    return "/";
  }
  if (tag.includes("_")) {
    return "_";
  }
  return "-";
}

function stripPlural(value: string): string {
  return value.endsWith("s") && value.length > 3 ? value.slice(0, -1) : value;
}
