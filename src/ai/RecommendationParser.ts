// Validates and normalizes structured AI recommendation responses before UI use.
import type {
  RecommendationConfidence,
  RecommendationParseContext,
  RecommendationResult,
  RecommendationType,
  RejectedTag,
  TagRecommendation
} from "./RecommendationSchema";
import { normalizeTag } from "../utils/normalizeTag";

const recommendationTypes: RecommendationType[] = ["existing", "new"];
const confidenceValues: RecommendationConfidence[] = ["high", "medium", "low"];

export function parseRecommendationResult(raw: string, context: RecommendationParseContext): RecommendationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI response must be valid JSON.");
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.recommendations)) {
    throw new Error("AI response must include a recommendations array.");
  }

  return {
    notePath: context.notePath,
    existingTags: context.frontmatterTags,
    frontmatterTags: context.frontmatterTags,
    inlineTags: context.inlineTags,
    allTags: context.allTags,
    sourceContentHash: context.sourceContentHash,
    recommendations: filterExistingRecommendations(parsed.recommendations.map(parseRecommendation), context.allTags),
    warnings: parseWarnings(parsed.warnings)
  };
}

function filterExistingRecommendations(
  recommendations: TagRecommendation[],
  existingTags: string[]
): TagRecommendation[] {
  const existing = new Set(existingTags.map(normalizeTag));
  return recommendations.filter((recommendation) => !existing.has(normalizeTag(recommendation.tag)));
}

function parseRecommendation(value: unknown): TagRecommendation {
  if (!isRecord(value)) {
    throw new Error("Each recommendation must be an object.");
  }

  if (typeof value.tag !== "string" || value.tag.trim().length === 0) {
    throw new Error("Each recommendation must include a tag.");
  }

  if (!recommendationTypes.includes(value.type as RecommendationType)) {
    throw new Error("Each recommendation must include a valid type.");
  }

  if (!confidenceValues.includes(value.confidence as RecommendationConfidence)) {
    throw new Error("Each recommendation must include a valid confidence.");
  }

  if (typeof value.reason !== "string" || value.reason.trim().length === 0) {
    throw new Error("Each recommendation must include a reason.");
  }

  return {
    tag: value.tag.trim().replace(/^#+/, ""),
    type: value.type as RecommendationType,
    confidence: value.confidence as RecommendationConfidence,
    reason: value.reason.trim(),
    rejectedSimilarTags: parseRejectedSimilarTags(value.rejectedSimilarTags)
  };
}

function parseRejectedSimilarTags(value: unknown): RejectedTag[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error("rejectedSimilarTags must be an array when provided.");
  }

  return value.map((item) => {
    if (!isRecord(item) || typeof item.tag !== "string" || typeof item.reason !== "string") {
      throw new Error("Each rejected similar tag must include tag and reason.");
    }

    return {
      tag: item.tag.trim().replace(/^#+/, ""),
      reason: item.reason.trim()
    };
  });
}

function parseWarnings(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("warnings must be an array when provided.");
  }

  return value.filter((warning): warning is string => typeof warning === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
