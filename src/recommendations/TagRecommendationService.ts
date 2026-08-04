// Coordinates tag-index context, provider calls, and recommendation parsing for one note.
import { buildRecommendationMessages } from "../ai/PromptBuilder";
import { parseRecommendationResult } from "../ai/RecommendationParser";
import type { RecommendationResult } from "../ai/RecommendationSchema";
import type { AiProvider } from "../ai/AiProvider";
import type { TagIndex, IndexedNote } from "../index/TagIndex";
import type { TagCuratorSettings } from "../settings/PluginSettings";
import type { UiLanguage } from "../ui/labels";

export class TagRecommendationService {
  constructor(
    private readonly provider: AiProvider,
    private readonly settings: TagCuratorSettings,
    private readonly uiLanguage: UiLanguage
  ) {}

  async recommendForNote(note: IndexedNote, index: TagIndex): Promise<RecommendationResult> {
    const raw = await this.provider.completeJson(buildRecommendationMessages(note, index, this.settings, this.uiLanguage));
    return parseRecommendationResult(raw, {
      notePath: note.path,
      frontmatterTags: note.frontmatterTags,
      inlineTags: note.inlineTags,
      allTags: note.allTags,
      sourceContentHash: note.sourceContentHash
    });
  }
}
