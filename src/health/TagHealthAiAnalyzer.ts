// Coordinates optional AI interpretation for the rule-based tag health report.
import type { AiProvider } from "../ai/AiProvider";
import type { TagIndex } from "../index/TagIndex";
import type { UiLanguage } from "../ui/labels";
import type { TagHealthAiAnalysis } from "./TagHealthAiAnalysis";
import { parseTagHealthAiAnalysis } from "./TagHealthAiAnalysisParser";
import { buildTagHealthAiMessages } from "./TagHealthAiPromptBuilder";
import type { TagHealthReport } from "./TagHealthReport";

interface TagHealthAiAnalyzerOptions {
  allowNewTags: boolean;
  newTagStrictness: "strict" | "balanced" | "exploratory";
  uiLanguage: UiLanguage;
}

export class TagHealthAiAnalyzer {
  constructor(
    private readonly provider: AiProvider,
    private readonly options: TagHealthAiAnalyzerOptions
  ) {}

  async analyze(report: TagHealthReport, index: TagIndex): Promise<TagHealthAiAnalysis> {
    const raw = await this.provider.completeJson(
      buildTagHealthAiMessages(report, index, {
        allowNewTags: this.options.allowNewTags,
        newTagStrictness: this.options.newTagStrictness,
        uiLanguage: this.options.uiLanguage
      })
    );
    return parseTagHealthAiAnalysis(raw);
  }
}
