// Builds a compact usage index from frontmatter and optional inline note tags.
import { parseInlineTags } from "../obsidian/TagParser";
import { normalizeTag } from "../utils/normalizeTag";
import type { IndexedNote, TagFileUsage, TagIndex, TagSource, TagUsage } from "./TagIndex";

export interface BuildTagIndexOptions {
  includeInlineTags?: boolean;
}

export function buildTagIndex(
  notes: IndexedNote[],
  now: Date = new Date(),
  options: BuildTagIndexOptions = {}
): TagIndex {
  const index: TagIndex = {
    updatedAt: now.toISOString(),
    tags: {}
  };

  for (const note of notes) {
    const hasMetadataTags = note.metadataTags !== undefined;
    const frontmatterTags = hasMetadataTags ? [] : note.frontmatterTags.map(normalizeTag).filter(Boolean);
    const inlineTags = hasMetadataTags || options.includeInlineTags === false ? [] : parseInlineTags(note.content);
    const metadataTags = note.metadataTags?.map((tag) => tag.trim().replace(/^#+/, "")).filter(Boolean) ?? [];
    const noteSources = new Map<string, TagSource[]>();

    for (const tag of metadataTags) {
      addSource(noteSources, tag, "metadata");
    }

    for (const tag of frontmatterTags) {
      addSource(noteSources, tag, "frontmatter");
    }

    for (const tag of inlineTags) {
      addSource(noteSources, tag, "inline");
    }

    for (const [tag, sources] of noteSources.entries()) {
      const usage = getOrCreateUsage(index, tag);
      usage.count += sources.length;
      usage.files.push(createFileUsage(note.path, sources));

      if (usage.examples.length < 3) {
        usage.examples.push({
          path: note.path,
          snippet: extractSnippet(note.content, tag)
        });
      }
    }
  }

  return index;
}

function addSource(noteSources: Map<string, TagSource[]>, tag: string, source: TagSource): void {
  const sources = noteSources.get(tag) ?? [];
  sources.push(source);
  noteSources.set(tag, sources);
}

function getOrCreateUsage(index: TagIndex, tag: string): TagUsage {
  const existing = index.tags[tag];
  if (existing) {
    return existing;
  }

  const depth = tag.split("/").filter(Boolean).length;
  const usage: TagUsage = {
    tag,
    normalized: normalizeTag(tag),
    count: 0,
    files: [],
    examples: [],
    namingSignals: {
      hasHierarchy: depth > 1,
      depth
    }
  };

  index.tags[tag] = usage;
  return usage;
}

function createFileUsage(path: string, sources: TagSource[]): TagFileUsage {
  return {
    path,
    count: sources.length,
    sources: Array.from(new Set(sources))
  };
}

function extractSnippet(content: string, tag: string): string {
  const plainTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`.{0,80}#?${plainTag}.{0,80}`, "i"));
  const snippet = match?.[0] ?? content.slice(0, 160);
  return snippet.replace(/\s+/g, " ").trim();
}
