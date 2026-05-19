// Defines which cleanup suggestions can be applied and which must remain preview, observation, or manual review.
import type { TagHealthIssueType, TagHealthSuggestion } from "../health/TagHealthReport";

export type CleanupActionKind =
  | "mergeTags"
  | "renameTag"
  | "removeTag"
  | "observeOnly"
  | "splitBroadTag"
  | "manualReview";

export type CleanupActionAvailability = "executable" | "previewOnly" | "observeOnly" | "manualReview";
export type CleanupActionRiskLevel = "low" | "medium" | "high";

export interface CleanupActionCapability {
  kind: CleanupActionKind;
  availability: CleanupActionAvailability;
  riskLevel: CleanupActionRiskLevel;
  requiresTargetTag: boolean;
  requiresFilePreview: boolean;
  supportsBatch: boolean;
  defaultSelected: boolean;
}

export function resolveCleanupActionCapability(
  issueType: TagHealthIssueType,
  suggestion: TagHealthSuggestion
): CleanupActionCapability {
  if (issueType === "nearDuplicates" && suggestion === "merge") {
    return executable("mergeTags", "medium", true);
  }

  if ((issueType === "namingDrift" || issueType === "hierarchyInconsistency") && suggestion === "rename") {
    return executable("renameTag", "medium", true);
  }

  if (issueType === "overNarrow" && suggestion === "deprecate") {
    return {
      kind: "removeTag",
      availability: "manualReview",
      riskLevel: "high",
      requiresTargetTag: false,
      requiresFilePreview: true,
      supportsBatch: false,
      defaultSelected: false
    };
  }

  if (issueType === "lowFrequency" && suggestion === "observe") {
    return {
      kind: "observeOnly",
      availability: "observeOnly",
      riskLevel: "low",
      requiresTargetTag: false,
      requiresFilePreview: false,
      supportsBatch: false,
      defaultSelected: false
    };
  }

  if (issueType === "overBroad") {
    return {
      kind: "splitBroadTag",
      availability: "manualReview",
      riskLevel: "high",
      requiresTargetTag: false,
      requiresFilePreview: true,
      supportsBatch: false,
      defaultSelected: false
    };
  }

  return {
    kind: "manualReview",
    availability: "manualReview",
    riskLevel: "high",
    requiresTargetTag: suggestion === "merge" || suggestion === "rename",
    requiresFilePreview: true,
    supportsBatch: false,
    defaultSelected: false
  };
}

function executable(kind: CleanupActionKind, riskLevel: CleanupActionRiskLevel, requiresTargetTag: boolean): CleanupActionCapability {
  return {
    kind,
    availability: "executable",
    riskLevel,
    requiresTargetTag,
    requiresFilePreview: true,
    supportsBatch: false,
    defaultSelected: true
  };
}
