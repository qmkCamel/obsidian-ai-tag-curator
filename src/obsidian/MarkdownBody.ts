// Keeps inline-text offsets stable even when Obsidian rewrites the frontmatter block.
import { getFrontMatterInfo } from "obsidian";

export interface MarkdownBodyParts {
  contentStart: number;
  prefix: string;
  body: string;
}

export function splitMarkdownBody(content: string): MarkdownBodyParts {
  const info = getFrontMatterInfo(content);
  const contentStart = info.contentStart;
  return {
    contentStart,
    prefix: content.slice(0, contentStart),
    body: content.slice(contentStart)
  };
}

export function toBodyOffset(fullOffset: number, contentStart: number): number | null {
  return fullOffset < contentStart ? null : fullOffset - contentStart;
}

export function joinMarkdownBody(parts: Pick<MarkdownBodyParts, "prefix">, body: string): string {
  return `${parts.prefix}${body}`;
}
