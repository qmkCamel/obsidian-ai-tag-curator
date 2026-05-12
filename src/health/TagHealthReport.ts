// Data model for the read-only vault tag health report.
import type { TagIndexSummary } from "../index/TagIndexSummary";

export type TagHealthIssueType =
  | "lowFrequency"
  | "nearDuplicates"
  | "hierarchyInconsistency"
  | "overBroad"
  | "overNarrow"
  | "namingDrift";

export type TagHealthSuggestion = "merge" | "rename" | "observe" | "deprecate";

export interface TagHealthReport {
  generatedAt: string;
  indexUpdatedAt: string;
  summary: TagHealthSummary;
  sections: Record<TagHealthIssueType, TagHealthSection>;
}

export interface TagHealthSummary extends TagIndexSummary {
  riskItemCount: number;
}

export interface TagHealthSection {
  type: TagHealthIssueType;
  items: TagHealthIssue[];
}

export interface TagHealthIssue {
  type: TagHealthIssueType;
  title: string;
  tags: string[];
  evidence: string;
  impact: string;
  suggestion: TagHealthSuggestion;
}
