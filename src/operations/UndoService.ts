// Replays a change plan in reverse to restore the previous frontmatter tag list.
import { TFile } from "obsidian";
import { FrontmatterWriter } from "../obsidian/FrontmatterWriter";
import { type ChangePlan } from "../preview/ChangePlan";

export class UndoService {
  constructor(private readonly writer: FrontmatterWriter) {}

  async undo(file: TFile, plan: ChangePlan): Promise<void> {
    await this.writer.replaceTagsIfCurrent(file, plan.afterTags, plan.beforeTags);
  }
}
