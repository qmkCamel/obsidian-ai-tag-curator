// Cleanup plan generated from tag health issues before any broad batch automation exists.
import type { TagHealthIssue, TagHealthSuggestion } from "../health/TagHealthReport";
import type { TagHealthAiConfidence, TagHealthAiSeverity } from "../health/TagHealthAiAnalysis";
import type { CleanupActionCapability } from "./CleanupActionCapability";

export interface CleanupPlan {
  generatedAt: string;
  itemCount: number;
  affectedFileCount: number;
  items: CleanupPlanItem[];
}

export interface CleanupPlanItem {
  id: string;
  issueType: TagHealthIssue["type"];
  title: string;
  action: TagHealthSuggestion;
  capability: CleanupActionCapability;
  tags: string[];
  targetTag?: string;
  rationale: string;
  affectedFileCount: number;
  files: CleanupPlanFilePreview[];
  aiAssistance?: CleanupPlanAiAssistance;
}

export interface CleanupPlanFilePreview {
  path: string;
  beforeTags: string[];
  afterTags: string[];
}

export interface CleanupPlanIssue extends TagHealthIssue {
  issueIndex: number;
}

export interface CleanupPlanAiAssistance {
  priorityHint: TagHealthAiSeverity;
  confidence: TagHealthAiConfidence;
  reason: string;
  targetTagCandidate?: string;
  riskNote?: string;
}
