// Builds a bounded prompt for optional AI interpretation of the rule-based health report.
import type { ChatMessage } from "../ai/AiProvider";
import type { TagIndex, TagUsage } from "../index/TagIndex";
import type { AiPromptProfile } from "../settings/PluginSettings";
import type { UiLanguage } from "../ui/labels";
import type { TagHealthReport } from "./TagHealthReport";

interface BuildTagHealthAiMessagesOptions {
  allowNewTags: boolean;
  newTagStrictness: "strict" | "balanced" | "exploratory";
  uiLanguage: UiLanguage;
  promptProfile?: AiPromptProfile;
  maxRiskGroups?: number;
}

export function buildTagHealthAiMessages(
  report: TagHealthReport,
  index: TagIndex,
  options: BuildTagHealthAiMessagesOptions
): ChatMessage[] {
  const limits = getTagHealthPromptLimits(options.promptProfile ?? "default", options.maxRiskGroups);
  const riskGroups = Object.values(report.sections)
    .flatMap((section) => section.items)
    .slice(0, limits.maxRiskGroups);

  const involvedTags = new Set(riskGroups.flatMap((item) => item.tags));
  const tagDetails = Object.fromEntries(
    Array.from(involvedTags)
      .map((tag) => index.tags[tag])
      .filter((usage): usage is TagUsage => usage !== undefined)
      .map((usage) => [
        usage.tag,
        {
          count: usage.count,
          fileCount: usage.files.length,
          files: usage.files.slice(0, limits.maxFilesPerTag).map((file) => file.path),
          examples: usage.examples.slice(0, limits.maxExamplesPerTag).map((example) => ({
            path: example.path,
            snippet: truncate(example.snippet, limits.maxSnippetLength)
          }))
        }
      ])
  );
  const systemMessages = [
    "You are an AI tag governance analyst for an Obsidian note library.",
    "Enhance a rule-based tag health report with read-only diagnosis and prioritized actions.",
    "Do not claim that Markdown files were changed.",
    "Prefer existing tags as merge or rename targets.",
    "Return only valid JSON.",
    `Write all human-facing text in ${getOutputLanguageName(options.uiLanguage)}.`
  ];
  if ((options.promptProfile ?? "default") === "edge-small") {
    systemMessages.push("Keep the summary and reasons compact, and do not include any text outside the JSON object.");
  }

  return [
    {
      role: "system",
      content: systemMessages.join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Enhance a read-only Obsidian tag health report.",
        rules: {
          allowNewTags: options.allowNewTags,
          newTagStrictness: options.newTagStrictness,
          responseLanguage: getOutputLanguageName(options.uiLanguage),
          priorityOrdering:
            "Sort priorities by severity first, then confidence. Order both fields as high, medium, low. Preserve reasoning order only when both are equal.",
          outputShape: {
            summary: "string",
            priorities: [
              {
                issueType: "lowFrequency | nearDuplicates | hierarchyInconsistency | overBroad | overNarrow | namingDrift",
                tags: ["string without leading #"],
                severity: "high | medium | low",
                confidence: "high | medium | low",
                diagnosis: "short diagnosis",
                suggestedAction: "merge | rename | observe | deprecate",
                targetTag: "optional existing tag or allowed new tag",
                reason: "why this action is recommended",
                riskNote: "optional caution"
              }
            ]
          }
        },
        indexSummary: report.summary,
        healthReport: {
          generatedAt: report.generatedAt,
          indexUpdatedAt: report.indexUpdatedAt,
          riskGroups: riskGroups.map((issue) => ({
            issueType: issue.type,
            title: issue.title,
            tags: issue.tags,
            evidence: issue.evidence,
            impact: issue.impact,
            ruleSuggestion: issue.suggestion
          }))
        },
        topTags: Object.values(index.tags)
          .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
          .slice(0, limits.maxTopTags)
          .map((usage) => ({
            tag: usage.tag,
            count: usage.count,
            fileCount: usage.files.length
          })),
        tagDetails
      })
    }
  ];
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}[truncated]` : value;
}

function getTagHealthPromptLimits(promptProfile: AiPromptProfile, maxRiskGroups?: number): {
  maxRiskGroups: number;
  maxTopTags: number;
  maxFilesPerTag: number;
  maxExamplesPerTag: number;
  maxSnippetLength: number;
} {
  if (promptProfile === "edge-small") {
    return {
      maxRiskGroups: Math.min(maxRiskGroups ?? 12, 12),
      maxTopTags: 50,
      maxFilesPerTag: 1,
      maxExamplesPerTag: 1,
      maxSnippetLength: 160
    };
  }
  return {
    maxRiskGroups: maxRiskGroups ?? 20,
    maxTopTags: 100,
    maxFilesPerTag: 3,
    maxExamplesPerTag: 3,
    maxSnippetLength: 240
  };
}

function getOutputLanguageName(uiLanguage: UiLanguage): string {
  return uiLanguage === "zh-CN" ? "Simplified Chinese" : "English";
}
