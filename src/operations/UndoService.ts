// Replays a change plan in reverse to restore the previous frontmatter tag list.
import { TFile } from "obsidian";
import { FrontmatterWriter } from "../obsidian/FrontmatterWriter";
import { type ChangePlan } from "../preview/ChangePlan";
import { exactTagValuePatch, reverseTagValueFields, sameTagValue } from "../obsidian/TagValuePatch";
import { SnapshotConflictError } from "../obsidian/FrontmatterWriter";

export class UndoService {
  constructor(private readonly writer: FrontmatterWriter) {}

  async undo(file: TFile, plan: ChangePlan): Promise<void> {
    const patch = exactTagValuePatch(plan);
    if (patch) {
      const snapshot = await this.writer.readSnapshot(file);
      if (!sameTagValue(snapshot.tagValueSnapshot, patch.after)) throw new SnapshotConflictError("tagsChanged");
      await this.writer.replaceTagsIfSnapshotMatches(file, { ...snapshot, ...reverseTagValueFields(plan) }, plan.beforeTags);
      return;
    }
    await this.writer.replaceTagsIfCurrent(file, plan.afterTags, plan.beforeTags);
  }
}
