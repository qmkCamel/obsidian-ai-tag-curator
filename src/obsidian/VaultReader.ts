// Reads Markdown notes and metadata from the active Obsidian vault.
import { App, getAllTags, TFile } from "obsidian";
import { parseFrontmatterTags, parseObsidianTags } from "./TagParser";
import type { IndexedNote } from "../index/TagIndex";

export class VaultReader {
  constructor(private readonly app: App) {}

  getCurrentMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      return null;
    }

    return file;
  }

  async readCurrentNote(): Promise<IndexedNote | null> {
    const file = this.getCurrentMarkdownFile();
    if (!file) {
      return null;
    }

    return this.readNote(file);
  }

  async readAllMarkdownNotes(): Promise<IndexedNote[]> {
    const files = this.app.vault.getMarkdownFiles();
    return Promise.all(files.map((file) => this.readNote(file)));
  }

  async readNote(file: TFile): Promise<IndexedNote> {
    const content = await this.app.vault.cachedRead(file);
    const cache = this.app.metadataCache.getFileCache(file);
    const metadataTags = cache ? parseObsidianTags(getAllTags(cache)) : undefined;

    return {
      path: file.path,
      content,
      frontmatterTags: parseFrontmatterTags(cache?.frontmatter?.tags),
      metadataTags
    };
  }
}
