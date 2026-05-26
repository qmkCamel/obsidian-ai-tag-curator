// Structured, read-only AI interpretation layered on top of the rule-based health report.
import type { TagHealthIssueType, TagHealthSuggestion } from "./TagHealthReport";

export type TagHealthAiSeverity = "high" | "medium" | "low";
export type TagHealthAiConfidence = "high" | "medium" | "low";

export interface TagHealthAiAnalysis {
  summary: string;
  priorities: TagHealthAiPriority[];
}

export interface CachedTagHealthAiAnalysis {
  analysis: TagHealthAiAnalysis;
  analyzedAt: string;
  indexUpdatedAt: string;
}

export interface TagHealthAiPriority {
  issueType: TagHealthIssueType;
  tags: string[];
  severity: TagHealthAiSeverity;
  confidence: TagHealthAiConfidence;
  diagnosis: string;
  suggestedAction: TagHealthSuggestion;
  targetTag?: string;
  reason: string;
  riskNote?: string;
}
