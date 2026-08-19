// Reads source-aware note snapshots and exact folder scopes from the active Obsidian vault.
import { App, TFile, TFolder } from "obsidian";
import { parseFrontmatterTags, parseInlineTags, parseObsidianTags } from "./TagParser";
import type { IndexedNote } from "../index/TagIndex";
import { createNoteTagInventory } from "../tags/NoteTagInventory";
import { hashContent } from "../utils/hashContent";
import { InlineTagOccurrenceReader, type InlineTagOccurrenceReadResult } from "./InlineTagOccurrenceReader";

export class VaultReader {
  constructor(private readonly app: App) {}

  getCurrentMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      return null;
    }

    return file;
  }

  getCurrentFolderPath(): string | null {
    const file = this.getCurrentMarkdownFile();
    return file ? parentFolderPath(file.path) : null;
  }

  listVaultFolders(): TFolder[] {
    const root = this.app.vault.getRoot();
    const folders = this.app.vault
      .getAllLoadedFiles()
      .filter((entry): entry is TFolder => entry instanceof TFolder)
      .sort((left, right) => normalizeFolderPath(left.path).localeCompare(normalizeFolderPath(right.path)));

    return [root, ...folders.filter((folder) => folder !== root)];
  }

  /** Lists the complete confirmed scope by path segment, never by ambiguous string prefix or truncation. */
  listMarkdownFilesInFolder(folderPath: string, includeSubfolders: boolean): TFile[] {
    const allMarkdownFiles = this.app.vault.getMarkdownFiles();
    const matchingPaths = new Set(
      filterMarkdownPathsByFolder(
        allMarkdownFiles.map((file) => file.path),
        folderPath,
        includeSubfolders
      )
    );
    return allMarkdownFiles
      .filter((file) => matchingPaths.has(file.path))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  async readCurrentNote(): Promise<IndexedNote | null> {
    const file = this.getCurrentMarkdownFile();
    if (!file) {
      return null;
    }

    return this.readNote(file);
  }

  getMarkdownFileByPath(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile && file.extension === "md" ? file : null;
  }

  async readNoteByPath(path: string): Promise<IndexedNote> {
    const file = this.getMarkdownFileByPath(path);
    if (!file) {
      throw new Error(`Markdown note not found: ${path}`);
    }
    return this.readNote(file);
  }

  async readAllMarkdownNotes(): Promise<IndexedNote[]> {
    const files = this.app.vault.getMarkdownFiles();
    return Promise.all(files.map((file) => this.readNote(file)));
  }

  /** Captures content, source-separated tags, and a hash from the same cached Markdown read. */
  async readNote(file: TFile): Promise<IndexedNote> {
    const content = await this.app.vault.cachedRead(file);
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatterTags = parseFrontmatterTags(cache?.frontmatter?.tags);
    const inlineTags =
      cache?.tags === undefined ? parseInlineTags(content) : parseObsidianTags(cache.tags.map((entry) => entry.tag));
    const inventory = createNoteTagInventory(frontmatterTags, inlineTags);

    return {
      path: file.path,
      content,
      ...inventory,
      sourceContentHash: await hashContent(content)
    };
  }

  async readInlineTagOccurrences(file: TFile, relevantTags: string[]): Promise<InlineTagOccurrenceReadResult> {
    return new InlineTagOccurrenceReader(this.app).read(file, relevantTags);
  }
}

/** Pure path filter shared with tests to make root, recursion, and same-prefix boundaries explicit. */
export function filterMarkdownPathsByFolder(
  filePaths: string[],
  folderPath: string,
  includeSubfolders: boolean
): string[] {
  const folder = normalizeFolderPath(folderPath);
  return Array.from(new Set(filePaths))
    .filter((path) => path.toLowerCase().endsWith(".md"))
    .filter((path) => {
      const parent = parentFolderPath(path);
      if (!folder) {
        return includeSubfolders || parent === "";
      }
      return includeSubfolders ? parent === folder || parent.startsWith(`${folder}/`) : parent === folder;
    })
    .sort((left, right) => left.localeCompare(right));
}

export function parentFolderPath(filePath: string): string {
  const normalized = filePath.replace(/^\/+|\/+$/g, "");
  const separator = normalized.lastIndexOf("/");
  return separator === -1 ? "" : normalized.slice(0, separator);
}

export function normalizeFolderPath(path: string): string {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  return normalized === "." ? "" : normalized;
}
