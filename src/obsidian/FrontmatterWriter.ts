// Applies reviewed tag change plans through Obsidian's frontmatter API.
import { App, TFile } from "obsidian";
import type { ChangePlan } from "../preview/ChangePlan";

export class FrontmatterWriter {
  constructor(private readonly app: App) {}

  async applyChangePlan(file: TFile, plan: ChangePlan): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.tags = plan.afterTags;
    });
  }
}
