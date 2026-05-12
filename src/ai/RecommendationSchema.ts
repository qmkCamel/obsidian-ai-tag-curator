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
  existingTags: string[];
  recommendations: TagRecommendation[];
  warnings: string[];
}

export interface RecommendationParseContext {
  notePath: string;
  existingTags: string[];
}
