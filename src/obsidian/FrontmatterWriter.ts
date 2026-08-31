// Applies reviewed frontmatter changes with content-and-tag snapshot guards; note bodies are never edited directly.
import { App, TFile } from "obsidian";
import type { ChangePlan } from "../preview/ChangePlan";
import { normalizeTag } from "../utils/normalizeTag";
import { hashContent } from "../utils/hashContent";
import { parseFrontmatterTags } from "./TagParser";

export interface FrontmatterTagChange {
  beforeTags: string[];
  afterTags: string[];
  afterContentHash?: string;
}

export type SnapshotConflictKind = "tagsChanged" | "contentChanged";

export class SnapshotConflictError extends Error {
  constructor(readonly kind: SnapshotConflictKind) {
    super(kind === "tagsChanged" ? "Frontmatter tags changed since the preview was generated." : "Note content changed since the preview was generated.");
    this.name = "SnapshotConflictError";
  }
}

export interface FrontmatterSnapshot {
  beforeTags: string[];
  sourceContentHash: string;
}

export class FrontmatterWriter {
  constructor(private readonly app: App) {}

  async applyChangePlan(file: TFile, plan: ChangePlan): Promise<void> {
    await this.replaceTagsIfSnapshotMatches(
      file,
      { beforeTags: plan.beforeTags, sourceContentHash: plan.sourceContentHash },
      plan.afterTags
    );
  }

  /** Performs a read-only full-content and frontmatter-tag preflight for a reviewed plan. */
  async checkSnapshot(file: TFile, snapshot: FrontmatterSnapshot): Promise<void> {
    const currentTags = this.readCurrentTags(file);
    if (!sameTagSet(currentTags, snapshot.beforeTags)) {
      throw new SnapshotConflictError("tagsChanged");
    }

    const content = await this.app.vault.cachedRead(file);
    if ((await hashContent(content)) !== snapshot.sourceContentHash) {
      throw new SnapshotConflictError("contentChanged");
    }
  }

  readCurrentTags(file: TFile): string[] {
    const cache = this.app.metadataCache.getFileCache(file);
    return parseFrontmatterTags(readFrontmatterProperty(cache?.frontmatter, "tags"));
  }

  async readSnapshot(file: TFile): Promise<FrontmatterSnapshot> {
    const content = await this.app.vault.cachedRead(file);
    return {
      beforeTags: this.readCurrentTags(file),
      sourceContentHash: await hashContent(content)
    };
  }

  /** Compare-and-swaps tags only when the complete Markdown and expected tag set still match. */
  async replaceTagsIfSnapshotMatches(
    file: TFile,
    snapshot: FrontmatterSnapshot,
    nextTags: string[]
  ): Promise<FrontmatterTagChange> {
    const content = await this.app.vault.cachedRead(file);
    if ((await hashContent(content)) !== snapshot.sourceContentHash) {
      throw new SnapshotConflictError("contentChanged");
    }

    let change: FrontmatterTagChange = { beforeTags: [], afterTags: [] };
    await this.app.fileManager.processFrontMatter(file, (frontmatter: unknown) => {
      const record = requireFrontmatterRecord(frontmatter);
      const beforeTags = parseFrontmatterTags(record.tags);
      if (!sameTagSet(beforeTags, snapshot.beforeTags)) {
        throw new SnapshotConflictError("tagsChanged");
      }

      const afterTags = normalizeTagList(nextTags);
      record.tags = afterTags;
      change = { beforeTags, afterTags };
    });

    return {
      ...change,
      afterContentHash: await hashContent(await this.app.vault.cachedRead(file))
    };
  }

  async applyTagTransform(file: TFile, transform: (beforeTags: string[]) => string[]): Promise<FrontmatterTagChange> {
    let change: FrontmatterTagChange = {
      beforeTags: [],
      afterTags: []
    };

    await this.app.fileManager.processFrontMatter(file, (frontmatter: unknown) => {
      const record = requireFrontmatterRecord(frontmatter);
      const beforeTags = parseFrontmatterTags(record.tags);
      const afterTags = normalizeTagList(transform(beforeTags));
      record.tags = afterTags;
      change = { beforeTags, afterTags };
    });

    return change;
  }

  async replaceTagsIfCurrent(file: TFile, expectedTags: string[], nextTags: string[]): Promise<FrontmatterTagChange> {
    return this.applyTagTransform(file, (beforeTags) => {
      if (!sameTagSet(beforeTags, expectedTags)) {
        throw new Error("Frontmatter tags changed since this cleanup was applied.");
      }

      return nextTags;
    });
  }
}

function readFrontmatterProperty(frontmatter: unknown, key: string): unknown {
  return isRecord(frontmatter) ? frontmatter[key] : undefined;
}

function requireFrontmatterRecord(frontmatter: unknown): Record<string, unknown> {
  if (!isRecord(frontmatter)) {
    throw new Error("Obsidian frontmatter must be an object.");
  }
  return frontmatter;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function sameTagSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left.map(normalizeTag).filter(Boolean));
  const rightSet = new Set(right.map(normalizeTag).filter(Boolean));

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  for (const tag of leftSet) {
    if (!rightSet.has(tag)) {
      return false;
    }
  }

  return true;
}
