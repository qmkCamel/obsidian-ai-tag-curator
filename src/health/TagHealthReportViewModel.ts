// Builds the health report UI model that separates rule evidence from AI action guidance.
import type { CleanupActionCapability } from "../cleanup/CleanupActionCapability";
import type { CleanupPlan, CleanupPlanItem } from "../cleanup/CleanupPlan";
import { normalizeTag } from "../utils/normalizeTag";
import type { TagHealthAiAnalysis, TagHealthAiConfidence, TagHealthAiPriority, TagHealthAiSeverity } from "./TagHealthAiAnalysis";
import type { TagHealthIssue, TagHealthIssueType, TagHealthReport, TagHealthSuggestion } from "./TagHealthReport";

export type HealthReportAiState = "initial" | "loading" | "results";

export interface HealthReportViewModel {
  aiState: HealthReportAiState;
  overview: HealthReportOverview;
  actionItems: HealthActionItemView[];
  evidenceSections: HealthEvidenceSectionView[];
}

export interface HealthReportOverview {
  totalTags: number;
  totalUsages: number;
  totalFiles: number;
  riskItemCount: number;
  executableItemCount: number;
}

export interface HealthActionItemView {
  id: string;
  tags: string[];
  priority: TagHealthAiSeverity;
  confidence: TagHealthAiConfidence;
  diagnosis: string;
  suggestedAction: TagHealthSuggestion;
  reason: string;
  targetTag?: string;
  riskNote?: string;
  evidenceTypes: TagHealthIssueType[];
  capability: CleanupActionCapability;
  cleanupItem?: CleanupPlanItem;
  cleanupItemId?: string;
  source: "ai";
}

export interface HealthEvidenceSectionView {
  type: TagHealthIssueType;
  items: TagHealthIssue[];
}

interface BuildHealthReportViewModelOptions {
  aiAnalysis: TagHealthAiAnalysis | null;
  aiLoading: boolean;
}

const SECTION_ORDER: TagHealthIssueType[] = [
  "lowFrequency",
  "nearDuplicates",
  "hierarchyInconsistency",
  "overBroad",
  "overNarrow",
  "namingDrift"
];

const manualReviewCapability: CleanupActionCapability = {
  kind: "manualReview",
  availability: "manualReview",
  riskLevel: "high",
  requiresTargetTag: false,
  requiresFilePreview: true,
  supportsBatch: false,
  defaultSelected: false
};

export function buildTagHealthReportViewModel(
  report: TagHealthReport,
  cleanupPlan: CleanupPlan,
  options: BuildHealthReportViewModelOptions
): HealthReportViewModel {
  return {
    aiState: options.aiLoading ? "loading" : options.aiAnalysis ? "results" : "initial",
    overview: {
      totalTags: report.summary.totalTags,
      totalUsages: report.summary.totalUsages,
      totalFiles: report.summary.totalFiles,
      riskItemCount: report.summary.riskItemCount,
      executableItemCount: cleanupPlan.items.filter((item) => item.capability.availability === "executable").length
    },
    actionItems: options.aiAnalysis ? buildActionItems(cleanupPlan, options.aiAnalysis) : [],
    evidenceSections: SECTION_ORDER.map((type) => ({
      type,
      items: report.sections[type].items
    }))
  };
}

function buildActionItems(cleanupPlan: CleanupPlan, analysis: TagHealthAiAnalysis): HealthActionItemView[] {
  return [...analysis.priorities]
    .sort(comparePriority)
    .map((priority, index) => {
      const cleanupItem = findMatchingCleanupItem(cleanupPlan.items, priority);
      const evidenceTypes = findRelatedEvidenceTypes(cleanupPlan.items, priority);

      return {
        id: `ai-action-${index + 1}`,
        tags: priority.tags,
        priority: priority.severity,
        confidence: priority.confidence,
        diagnosis: priority.diagnosis,
        suggestedAction: priority.suggestedAction,
        reason: priority.reason,
        targetTag: priority.targetTag,
        riskNote: priority.riskNote,
        evidenceTypes,
        capability: cleanupItem?.capability ?? manualReviewCapability,
        cleanupItem,
        cleanupItemId: cleanupItem?.id,
        source: "ai"
      };
    });
}

function findMatchingCleanupItem(items: CleanupPlanItem[], priority: TagHealthAiPriority): CleanupPlanItem | undefined {
  const priorityTags = normalizedSet(priority.tags);
  return items.find((item) => item.issueType === priority.issueType && item.tags.some((tag) => priorityTags.has(normalizeTag(tag))));
}

function findRelatedEvidenceTypes(items: CleanupPlanItem[], priority: TagHealthAiPriority): TagHealthIssueType[] {
  const priorityTags = normalizedSet(priority.tags);
  const evidenceTypes: TagHealthIssueType[] = [];

  for (const item of items) {
    if (!item.tags.some((tag) => priorityTags.has(normalizeTag(tag)))) {
      continue;
    }

    if (!evidenceTypes.includes(item.issueType)) {
      evidenceTypes.push(item.issueType);
    }
  }

  return evidenceTypes.length > 0 ? evidenceTypes : [priority.issueType];
}

function normalizedSet(tags: string[]): Set<string> {
  return new Set(tags.map(normalizeTag).filter(Boolean));
}

function comparePriority(left: TagHealthAiPriority, right: TagHealthAiPriority): number {
  const severity = severityRank(right.severity) - severityRank(left.severity);
  if (severity !== 0) {
    return severity;
  }

  return confidenceRank(right.confidence) - confidenceRank(left.confidence);
}

function severityRank(value: TagHealthAiSeverity): number {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

function confidenceRank(value: TagHealthAiConfidence): number {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}
