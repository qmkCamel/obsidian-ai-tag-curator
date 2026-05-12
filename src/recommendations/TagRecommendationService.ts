// Coordinates tag-index context, provider calls, and recommendation parsing for one note.
import { buildRecommendationMessages } from "../ai/PromptBuilder";
import { parseRecommendationResult } from "../ai/RecommendationParser";
import type { RecommendationResult } from "../ai/RecommendationSchema";
import type { AiProvider } from "../ai/AiProvider";
import { buildTagIndex } from "../index/TagIndexBuilder";
import type { TagIndex, IndexedNote } from "../index/TagIndex";
import type { TagCuratorSettings } from "../settings/PluginSettings";
import type { UiLanguage } from "../ui/labels";

export class TagRecommendationService {
  constructor(
    private readonly provider: AiProvider,
    private readonly settings: TagCuratorSettings,
    private readonly uiLanguage: UiLanguage
  ) {}

  async recommendForNote(note: IndexedNote, notesForIndex: IndexedNote[], cachedIndex?: TagIndex): Promise<RecommendationResult> {
    const index = cachedIndex ?? buildTagIndex(notesForIndex);
    const raw = await this.provider.completeJson(buildRecommendationMessages(note, index, this.settings, this.uiLanguage));
    return parseRecommendationResult(raw, {
      notePath: note.path,
      existingTags: note.frontmatterTags
    });
  }
}
