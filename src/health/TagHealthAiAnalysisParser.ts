// Validates AI-generated tag health analysis before it is shown in the report UI.
import type {
  TagHealthAiAnalysis,
  TagHealthAiConfidence,
  TagHealthAiPriority,
  TagHealthAiSeverity
} from "./TagHealthAiAnalysis";
import type { TagHealthIssueType, TagHealthSuggestion } from "./TagHealthReport";

const issueTypes: TagHealthIssueType[] = [
  "lowFrequency",
  "nearDuplicates",
  "hierarchyInconsistency",
  "overBroad",
  "overNarrow",
  "namingDrift"
];
const severities: TagHealthAiSeverity[] = ["high", "medium", "low"];
const confidences: TagHealthAiConfidence[] = ["high", "medium", "low"];
const suggestions: TagHealthSuggestion[] = ["merge", "rename", "observe", "deprecate"];
const severityRank: Record<TagHealthAiSeverity, number> = { high: 3, medium: 2, low: 1 };
const confidenceRank: Record<TagHealthAiConfidence, number> = { high: 3, medium: 2, low: 1 };

export function parseTagHealthAiAnalysis(raw: string): TagHealthAiAnalysis {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI health analysis must be valid JSON.");
  }

  if (!isRecord(parsed) || typeof parsed.summary !== "string") {
    throw new Error("AI health analysis must include a summary.");
  }

  if (!Array.isArray(parsed.priorities)) {
    throw new Error("AI health analysis must include a priorities array.");
  }

  return {
    summary: parsed.summary.trim(),
    priorities: sortPriorities(parsed.priorities.map(parsePriority))
  };
}

function sortPriorities(priorities: TagHealthAiPriority[]): TagHealthAiPriority[] {
  return priorities
    .map((priority, index) => ({ priority, index }))
    .sort((left, right) => {
      const severityDiff = severityRank[right.priority.severity] - severityRank[left.priority.severity];
      if (severityDiff !== 0) {
        return severityDiff;
      }

      const confidenceDiff = confidenceRank[right.priority.confidence] - confidenceRank[left.priority.confidence];
      if (confidenceDiff !== 0) {
        return confidenceDiff;
      }

      return left.index - right.index;
    })
    .map((item) => item.priority);
}

function parsePriority(value: unknown): TagHealthAiPriority {
  if (!isRecord(value)) {
    throw new Error("Each AI priority must be an object.");
  }

  if (!issueTypes.includes(value.issueType as TagHealthIssueType)) {
    throw new Error("Each AI priority must include a valid issueType.");
  }

  if (!severities.includes(value.severity as TagHealthAiSeverity)) {
    throw new Error("Each AI priority must include a valid severity.");
  }

  if (!confidences.includes(value.confidence as TagHealthAiConfidence)) {
    throw new Error("Each AI priority must include a valid confidence.");
  }

  if (!suggestions.includes(value.suggestedAction as TagHealthSuggestion)) {
    throw new Error("Each AI priority must include a valid suggestedAction.");
  }

  return {
    issueType: value.issueType as TagHealthIssueType,
    tags: parseTags(value.tags, "Each AI priority must include tags."),
    severity: value.severity as TagHealthAiSeverity,
    confidence: value.confidence as TagHealthAiConfidence,
    diagnosis: parseRequiredString(value.diagnosis, "Each AI priority must include a diagnosis."),
    suggestedAction: value.suggestedAction as TagHealthSuggestion,
    targetTag: parseOptionalString(value.targetTag),
    reason: parseRequiredString(value.reason, "Each AI priority must include a reason."),
    riskNote: parseOptionalString(value.riskNote)
  };
}

function parseTags(value: unknown, errorMessage: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(errorMessage);
  }

  const items: unknown[] = value;
  const tags: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(errorMessage);
    }
    tags.push(item.trim().replace(/^#+/, ""));
  }
  return tags;
}

function parseRequiredString(value: unknown, errorMessage: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(errorMessage);
  }

  return value.trim();
}

function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().replace(/^#+/, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
