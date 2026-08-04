// Derives the folder review and recovery summaries consumed by DOM modals.
import type { BatchOperationRecord } from "../operations/OperationLog";
import type { ChangePlan } from "../preview/ChangePlan";
import {
  deriveChangePlans,
  type FolderBatchCandidate,
  type FolderBatchPlan,
  type FolderBatchPlanItem,
  type FolderBatchRisk
} from "./FolderBatchPlan";

export type FolderBatchRiskFilter = "all" | FolderBatchRisk;

export interface FolderBatchPreviewFileViewModel {
  notePath: string;
  sourceStatus: FolderBatchPlanItem["sourceStatus"];
  aiStatus: FolderBatchPlanItem["aiStatus"];
  planStatus: FolderBatchPlanItem["planStatus"];
  frontmatterTags: string[];
  inlineTags: string[];
  afterTags: string[];
  candidates: FolderBatchCandidate[];
  sourceError?: string;
  aiError?: string;
}

export interface FolderBatchPreviewViewModel {
  plans: ChangePlan[];
  files: FolderBatchPreviewFileViewModel[];
  selectedFileCount: number;
  selectedTagCount: number;
  riskCounts: Record<FolderBatchRisk, number>;
  hasRetryableFailures: boolean;
  canApply: boolean;
}

export function buildFolderBatchPreviewViewModel(
  plan: FolderBatchPlan,
  riskFilter: FolderBatchRiskFilter = "all"
): FolderBatchPreviewViewModel {
  const plans = deriveChangePlans(plan);
  const planByPath = new Map(plans.map((change) => [change.notePath, change]));
  const allCandidates = plan.items.flatMap((item) => item.candidates);

  return {
    plans,
    files: plan.items.map((item) => {
      const change = planByPath.get(item.notePath);
      return {
        notePath: item.notePath,
        sourceStatus: item.sourceStatus,
        aiStatus: item.aiStatus,
        planStatus: item.planStatus,
        frontmatterTags: item.inventory?.frontmatterTags ?? [],
        inlineTags: item.inventory?.inlineTags ?? [],
        afterTags: change?.afterTags ?? item.beforeTags ?? [],
        candidates: item.candidates.filter((candidate) => riskFilter === "all" || candidate.risk === riskFilter),
        sourceError: item.sourceError,
        aiError: item.aiError
      };
    }),
    selectedFileCount: plans.length,
    selectedTagCount: plans.reduce((sum, change) => sum + change.addedTags.length, 0),
    riskCounts: {
      low: allCandidates.filter((candidate) => candidate.risk === "low").length,
      medium: allCandidates.filter((candidate) => candidate.risk === "medium").length,
      high: allCandidates.filter((candidate) => candidate.risk === "high").length
    },
    hasRetryableFailures: plan.items.some((item) => item.sourceStatus === "failed" || item.aiStatus === "failed"),
    canApply: plans.length > 0
  };
}

export interface FolderBatchRecoveryViewModel {
  target?: "before" | "after";
  beforeCount: number;
  afterCount: number;
  conflictPaths: string[];
  missingPaths: string[];
  canRetry: boolean;
}

export function buildFolderBatchRecoveryViewModel(record: BatchOperationRecord): FolderBatchRecoveryViewModel {
  const conflictPaths = record.files.filter((file) => file.recoveryState === "conflict").map((file) => file.notePath);
  const missingPaths = record.files.filter((file) => file.recoveryState === "missing").map((file) => file.notePath);
  return {
    target: record.recoveryTarget,
    beforeCount: record.files.filter((file) => file.recoveryState === "before").length,
    afterCount: record.files.filter((file) => file.recoveryState === "after").length,
    conflictPaths,
    missingPaths,
    canRetry: Boolean(record.recoveryTarget) && conflictPaths.length === 0 && missingPaths.length === 0
  };
}
