// Read-only cleanup plan generated from tag health issues before any batch writes exist.
import type { TagHealthIssue, TagHealthSuggestion } from "../health/TagHealthReport";

export interface CleanupPlan {
  generatedAt: string;
  itemCount: number;
  affectedFileCount: number;
  items: CleanupPlanItem[];
}

export interface CleanupPlanItem {
  id: string;
  title: string;
  action: TagHealthSuggestion;
  tags: string[];
  targetTag?: string;
  rationale: string;
  affectedFileCount: number;
  files: CleanupPlanFilePreview[];
}

export interface CleanupPlanFilePreview {
  path: string;
  beforeTags: string[];
  afterTags: string[];
}

export interface CleanupPlanIssue extends TagHealthIssue {
  issueIndex: number;
}
