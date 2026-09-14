// Applies reviewed frontmatter changes with content-and-tag snapshot guards; note bodies are never edited directly.
import { App, TFile } from "obsidian";
import type { ChangePlan } from "../preview/ChangePlan";
import { normalizeTag } from "../utils/normalizeTag";
import { hashContent } from "../utils/hashContent";
import { parseFrontmatterTags } from "./TagParser";
import { applyTagValuePatch, captureTagValueSnapshot, cloneTagValuePatch, exactTagValuePatch, normalizedSnapshotTags, rawTagValues, sameTagValue, tagValueFields, type TagValueFields, type TagValueSnapshot } from "./TagValuePatch";

export interface FrontmatterTagChange extends TagValueFields {
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

export interface FrontmatterSnapshot extends TagValueFields {
  beforeTags: string[];
  sourceContentHash: string;
  tagValueSnapshot?: TagValueSnapshot;
}

export type FrontmatterWriteGuard = (filePath: string, beforeRawTags: string[], afterRawTags: string[]) => void;

export class FrontmatterWriter {
  constructor(private readonly app: App, private readonly guard?: FrontmatterWriteGuard) {}

  async applyChangePlan(file: TFile, plan: ChangePlan): Promise<void> {
    await this.replaceTagsIfSnapshotMatches(
      file,
      { beforeTags: plan.beforeTags, sourceContentHash: plan.sourceContentHash, ...tagValueFields(exactTagValuePatch(plan)) },
      plan.afterTags
    );
  }

  /** Performs a read-only full-content and frontmatter-tag preflight for a reviewed plan. */
  async checkSnapshot(file: TFile, snapshot: FrontmatterSnapshot): Promise<FrontmatterTagChange | void> {
    const suppliedPatch = exactTagValuePatch(snapshot);
    const patch = suppliedPatch && cloneTagValuePatch(suppliedPatch);
    if (patch || snapshot.tagValueSnapshot) {
      const content = await this.app.vault.cachedRead(file);
      if ((await hashContent(content)) !== snapshot.sourceContentHash) throw new SnapshotConflictError("contentChanged");
      if (!sameTagValue(captureTagValueSnapshot(content), patch?.before ?? snapshot.tagValueSnapshot)) throw new SnapshotConflictError("tagsChanged");
      if (patch) return {
        beforeTags: normalizedSnapshotTags(patch.before), afterTags: normalizedSnapshotTags(patch.after),
        afterContentHash: await hashContent(applyTagValuePatch(content, patch)), ...tagValueFields(patch)
      };
      return;
    }
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
    const tagValueSnapshot = captureTagValueSnapshot(content);
    return {
      beforeTags: this.readCurrentTags(file),
      tagValueSnapshot,
      sourceContentHash: await hashContent(content)
    };
  }

  async readTagValueSnapshot(file: TFile): Promise<TagValueSnapshot> {
    return captureTagValueSnapshot(await this.app.vault.cachedRead(file));
  }

  /** Compare-and-swaps tags only when the complete Markdown and expected tag set still match. */
  async replaceTagsIfSnapshotMatches(
    file: TFile,
    snapshot: FrontmatterSnapshot,
    nextTags: string[]
  ): Promise<FrontmatterTagChange> {
    const suppliedPatch = exactTagValuePatch(snapshot);
    const patch = suppliedPatch && cloneTagValuePatch(suppliedPatch);
    const content = await this.app.vault.cachedRead(file);
    if ((await hashContent(content)) !== snapshot.sourceContentHash) {
      throw new SnapshotConflictError("contentChanged");
    }

    if (patch) {
      if (!sameTagValue(captureTagValueSnapshot(content), patch.before)) throw new SnapshotConflictError("tagsChanged");
      const expected = applyTagValuePatch(content, patch);
      const written = await this.app.vault.process(file, (data) => {
        if (data !== content) throw new SnapshotConflictError("contentChanged");
        if (!sameTagValue(captureTagValueSnapshot(data), patch.before)) throw new SnapshotConflictError("tagsChanged");
        const next = applyTagValuePatch(data, patch);
        if (next !== expected) throw new SnapshotConflictError("contentChanged");
        this.guard?.(file.path, rawTagValues(patch.before), rawTagValues(patch.after));
        return next;
      });
      if (written !== expected) throw new SnapshotConflictError("contentChanged");
      return { beforeTags: normalizedSnapshotTags(patch.before), afterTags: normalizedSnapshotTags(patch.after),
        afterContentHash: await hashContent(written), ...tagValueFields(patch) };
    }

    let change: FrontmatterTagChange = { beforeTags: [], afterTags: [] };
    await this.app.fileManager.processFrontMatter(file, (frontmatter: unknown) => {
      const record = requireFrontmatterRecord(frontmatter);
      const beforeTags = parseFrontmatterTags(record.tags);
      if (!sameTagSet(beforeTags, snapshot.beforeTags)) {
        throw new SnapshotConflictError("tagsChanged");
      }

      const afterTags = normalizeTagList(nextTags);
      this.guard?.(file.path, legacyRawTags(record.tags), afterTags);
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
      this.guard?.(file.path, legacyRawTags(record.tags), afterTags);
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

function legacyRawTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((tag) => typeof tag === "string")) return [...value];
  throw new Error("Unsupported frontmatter tag value.");
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
