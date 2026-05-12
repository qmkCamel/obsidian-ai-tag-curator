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
  const relevantTags = Object.values(index.tags)
    .sort((a, b) => b.count - a.count)
    .slice(0, 80)
    .map((tag) => ({
      tag: tag.tag,
      count: tag.count,
      examples: tag.examples.slice(0, 2)
    }));

  return [
    {
      role: "system",
      content: [
        "You are an AI tag curator for an Obsidian vault.",
        "Prefer existing tags over new tags.",
        "Order recommendations by relevance and confidence.",
        "Each recommendation is an independent candidate, not a parent-child or chained ranking.",
        "Return only valid JSON.",
        `Write all human-facing explanations in ${getOutputLanguageName(uiLanguage)}.`,
        "Use rejectedSimilarTags only for close alternatives that were considered but not selected for that specific candidate."
      ].join(" ")
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
          existingTags: note.frontmatterTags,
          content: truncate(note.content, 6000)
        },
        vaultTags: relevantTags
      })
    }
  ];
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n[truncated]` : value;
}

function getOutputLanguageName(uiLanguage: UiLanguage): string {
  return uiLanguage === "zh-CN" ? "Simplified Chinese" : "English";
}
