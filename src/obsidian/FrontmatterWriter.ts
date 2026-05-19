// Applies reviewed tag change plans through Obsidian's frontmatter API.
import { App, TFile } from "obsidian";
import type { ChangePlan } from "../preview/ChangePlan";
import { normalizeTag } from "../utils/normalizeTag";
import { parseFrontmatterTags } from "./TagParser";

export interface FrontmatterTagChange {
  beforeTags: string[];
  afterTags: string[];
}

export class FrontmatterWriter {
  constructor(private readonly app: App) {}

  async applyChangePlan(file: TFile, plan: ChangePlan): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.tags = plan.afterTags;
    });
  }

  async applyTagTransform(file: TFile, transform: (beforeTags: string[]) => string[]): Promise<FrontmatterTagChange> {
    let change: FrontmatterTagChange = {
      beforeTags: [],
      afterTags: []
    };

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const beforeTags = parseFrontmatterTags(frontmatter.tags);
      const afterTags = normalizeTagList(transform(beforeTags));
      frontmatter.tags = afterTags;
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
