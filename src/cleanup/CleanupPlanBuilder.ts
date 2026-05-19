// Turns read-only tag health findings into a reviewable cleanup plan.
import type { TagHealthIssueType, TagHealthReport, TagHealthSuggestion } from "../health/TagHealthReport";
import type { TagIndex, TagUsage } from "../index/TagIndex";
import type { CleanupPlan, CleanupPlanFilePreview, CleanupPlanItem } from "./CleanupPlan";

const SECTION_ORDER: TagHealthIssueType[] = [
  "lowFrequency",
  "nearDuplicates",
  "hierarchyInconsistency",
  "overBroad",
  "overNarrow",
  "namingDrift"
];

export function buildCleanupPlan(report: TagHealthReport, index: TagIndex, now = new Date()): CleanupPlan {
  const items: CleanupPlanItem[] = [];

  for (const sectionType of SECTION_ORDER) {
    const section = report.sections[sectionType];
    section.items.forEach((issue, issueIndex) => {
      const item = buildCleanupPlanItem(issue.type, issueIndex, issue.suggestion, issue.title, issue.tags, issue.impact, index);
      if (item.affectedFileCount > 0) {
        items.push(item);
      }
    });
  }

  return {
    generatedAt: now.toISOString(),
    itemCount: items.length,
    affectedFileCount: new Set(items.flatMap((item) => item.files.map((file) => file.path))).size,
    items
  };
}

function buildCleanupPlanItem(
  type: TagHealthIssueType,
  issueIndex: number,
  action: TagHealthSuggestion,
  title: string,
  tags: string[],
  rationale: string,
  index: TagIndex
): CleanupPlanItem {
  const targetTag = chooseTargetTag(action, tags, index);
  const files = buildFilePreviews(action, tags, targetTag, index);

  return {
    id: `${type}-${issueIndex + 1}`,
    title,
    action,
    tags,
    targetTag,
    rationale,
    affectedFileCount: files.length,
    files
  };
}

function chooseTargetTag(action: TagHealthSuggestion, tags: string[], index: TagIndex): string | undefined {
  if (action !== "merge" && action !== "rename") {
    return undefined;
  }

  if (tags.length <= 1) {
    return undefined;
  }

  return [...tags].sort((left, right) => compareCanonicalTags(index.tags[left], index.tags[right], left, right))[0];
}

function compareCanonicalTags(leftUsage: TagUsage | undefined, rightUsage: TagUsage | undefined, left: string, right: string): number {
  const leftCount = leftUsage?.count ?? 0;
  const rightCount = rightUsage?.count ?? 0;
  if (leftCount !== rightCount) {
    return rightCount - leftCount;
  }

  const leftFiles = leftUsage?.files.length ?? 0;
  const rightFiles = rightUsage?.files.length ?? 0;
  if (leftFiles !== rightFiles) {
    return rightFiles - leftFiles;
  }

  if (left.length !== right.length) {
    return left.length - right.length;
  }

  return left.localeCompare(right);
}

function buildFilePreviews(
  action: TagHealthSuggestion,
  tags: string[],
  targetTag: string | undefined,
  index: TagIndex
): CleanupPlanFilePreview[] {
  const filesByPath = new Map<string, Set<string>>();

  for (const tag of tags) {
    const usage = index.tags[tag];
    if (!usage) {
      continue;
    }

    for (const file of usage.files) {
      const fileTags = filesByPath.get(file.path) ?? new Set<string>();
      fileTags.add(tag);
      filesByPath.set(file.path, fileTags);
    }
  }

  return Array.from(filesByPath.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, fileTags]) => {
      const beforeTags = tags.filter((tag) => fileTags.has(tag));
      return {
        path,
        beforeTags,
        afterTags: previewAfterTags(action, beforeTags, targetTag)
      };
    });
}

function previewAfterTags(action: TagHealthSuggestion, beforeTags: string[], targetTag: string | undefined): string[] {
  if (action === "deprecate") {
    return [];
  }

  if ((action === "merge" || action === "rename") && targetTag) {
    return beforeTags.includes(targetTag) ? [targetTag] : [targetTag];
  }

  return beforeTags;
}
