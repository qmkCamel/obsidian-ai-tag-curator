// Builds the structured prompt that asks the model to behave like a tag curator.
import type { TagIndex } from "../index/TagIndex";
import type { IndexedNote } from "../index/TagIndex";
import type { TagCuratorSettings } from "../settings/PluginSettings";
import type { UiLanguage } from "../ui/labels";
import type { ChatMessage } from "./AiProvider";

export function buildRecommendationMessages(
  note: IndexedNote,
  index: TagIndex,
  settings: TagCuratorSettings,
  uiLanguage: UiLanguage
): ChatMessage[] {
  const limits = getRecommendationPromptLimits(settings.promptProfile);
  const relevantTags = Object.values(index.tags)
    .sort((a, b) => b.count - a.count)
    .slice(0, limits.maxVaultTags)
    .map((tag) => ({
      tag: tag.tag,
      count: tag.count,
      examples: tag.examples.slice(0, limits.maxExamplesPerTag)
    }));
  const systemMessages = [
    "You are an AI tag curator for an Obsidian vault.",
    "Prefer existing tags over new tags.",
    "Do not recommend tags that are already present on the current note.",
    "Order recommendations by relevance and confidence.",
    "Each recommendation is an independent candidate, not a parent-child or chained ranking.",
    "Return only valid JSON.",
    `Write all human-facing explanations in ${getOutputLanguageName(uiLanguage)}.`,
    "Use rejectedSimilarTags only for close alternatives that were considered but not selected for that specific candidate."
  ];
  if (settings.promptProfile === "edge-small") {
    systemMessages.push("Use compact short reasons and do not include any text outside the JSON object.");
  }

  return [
    {
      role: "system",
      content: systemMessages.join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Recommend tags for the current note.",
        rules: {
          maxRecommendations: settings.maxRecommendations,
          allowNewTags: settings.allowNewTags,
          newTagStrictness: settings.newTagStrictness,
          responseLanguage: getOutputLanguageName(uiLanguage),
          outputShape: {
            recommendations: [
              {
                tag: "string without leading #",
                type: "existing | new",
                confidence: "high | medium | low",
                reason: `short human explanation in ${getOutputLanguageName(uiLanguage)}`,
                rejectedSimilarTags: [{ tag: "string", reason: `short reason in ${getOutputLanguageName(uiLanguage)}` }]
              }
            ],
            warnings: ["string"]
          }
        },
        note: {
          path: note.path,
          existingTags: note.allTags,
          content: truncate(note.content, limits.maxNoteContentLength)
        },
        vaultTags: relevantTags
      })
    }
  ];
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n[truncated]` : value;
}

function getRecommendationPromptLimits(promptProfile: TagCuratorSettings["promptProfile"]): {
  maxNoteContentLength: number;
  maxVaultTags: number;
  maxExamplesPerTag: number;
} {
  if (promptProfile === "edge-small") {
    return {
      maxNoteContentLength: 4000,
      maxVaultTags: 50,
      maxExamplesPerTag: 1
    };
  }
  return {
    maxNoteContentLength: 10000,
    maxVaultTags: 100,
    maxExamplesPerTag: 3
  };
}

function getOutputLanguageName(uiLanguage: UiLanguage): string {
  return uiLanguage === "zh-CN" ? "Simplified Chinese" : "English";
}
