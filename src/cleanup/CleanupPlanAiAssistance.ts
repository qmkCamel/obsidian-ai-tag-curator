// Attaches AI health analysis hints to cleanup plan items without changing local action capability.
import type { TagHealthAiAnalysis, TagHealthAiPriority } from "../health/TagHealthAiAnalysis";
import { normalizeTag } from "../utils/normalizeTag";
import type { CleanupPlan, CleanupPlanItem } from "./CleanupPlan";

export function applyAiAssistanceToCleanupPlan(plan: CleanupPlan, analysis: TagHealthAiAnalysis): CleanupPlan {
  return {
    ...plan,
    items: plan.items.map((item) => {
      const priority = analysis.priorities.find((candidate) => matchesItem(candidate, item));
      if (!priority) {
        return item;
      }

      return {
        ...item,
        aiAssistance: {
          priorityHint: priority.severity,
          confidence: priority.confidence,
          reason: priority.reason,
          targetTagCandidate: priority.targetTag,
          riskNote: priority.riskNote
        }
      };
    })
  };
}

function matchesItem(priority: TagHealthAiPriority, item: CleanupPlanItem): boolean {
  if (priority.issueType !== item.issueType) {
    return false;
  }

  const itemTags = new Set(item.tags.map(normalizeTag));
  return priority.tags.some((tag) => itemTags.has(normalizeTag(tag)));
}
