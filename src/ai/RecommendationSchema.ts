// Shared data shapes for AI tag recommendation results.
export type RecommendationType = "existing" | "new";
export type RecommendationConfidence = "high" | "medium" | "low";

export interface RejectedTag {
  tag: string;
  reason: string;
}

export interface TagRecommendation {
  tag: string;
  type: RecommendationType;
  confidence: RecommendationConfidence;
  reason: string;
  rejectedSimilarTags?: RejectedTag[];
}

export interface RecommendationResult {
  notePath: string;
  /** Kept for compatibility; represents the original frontmatter tag snapshot. */
  existingTags: string[];
  frontmatterTags: string[];
  inlineTags: string[];
  allTags: string[];
  sourceContentHash: string;
  recommendations: TagRecommendation[];
  warnings: string[];
  aiError?: string;
}

export interface RecommendationParseContext {
  notePath: string;
  frontmatterTags: string[];
  inlineTags: string[];
  allTags: string[];
  sourceContentHash: string;
}
