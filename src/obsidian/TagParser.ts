// Extracts tags from frontmatter values and Markdown body text.
import { normalizeTag, uniqueTags } from "../utils/normalizeTag";

export type FrontmatterTagValue = string | string[] | null | undefined;

export function parseFrontmatterTags(value: FrontmatterTagValue): string[] {
  if (!value) {
    return [];
  }

  const rawValues = Array.isArray(value) ? value : [value];
  const tags = rawValues.flatMap((rawValue) =>
    rawValue
      .split(/[\s,]+/)
      .map((tag) => normalizeTag(tag))
      .filter(Boolean)
  );

  return uniqueTags(tags);
}

export function parseObsidianTags(value: string[] | null | undefined): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const rawTag of value) {
    const tag = rawTag.trim().replace(/^#+/, "");
    const normalized = normalizeTag(tag);
    if (!tag || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    tags.push(tag);
  }

  return tags;
}

export function parseInlineTags(content: string): string[] {
  const withoutCode = stripInlineCodeAndFences(content);
  const tags: string[] = [];
  const tagPattern = /(^|[\s([>{])#([A-Za-z0-9_\-/]+)(?=$|[\s.,;:!?()[\]{}<>])/g;

  for (const line of withoutCode.split("\n")) {
    if (/^\s*#(\s|$)/.test(line)) {
      continue;
    }

    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(line)) !== null) {
      tags.push(match[2]);
    }
  }

  return uniqueTags(tags);
}

function stripInlineCodeAndFences(content: string): string {
  const withoutFences = content.replace(/```[\s\S]*?```/g, "");
  return withoutFences.replace(/`[^`]*`/g, "");
}
