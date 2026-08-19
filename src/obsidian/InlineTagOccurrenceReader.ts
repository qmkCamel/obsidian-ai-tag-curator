// Hydrates exact, reviewable inline-tag positions without granting regex fallbacks write authority.
import type { App, CachedMetadata, TFile } from "obsidian";
import { normalizeTag } from "../utils/normalizeTag";
import { hashContent } from "../utils/hashContent";
import { parseFrontmatterTags } from "./TagParser";
import { splitMarkdownBody, toBodyOffset } from "./MarkdownBody";

export type InlineOccurrenceAvailability = "trusted" | "cacheUnavailable" | "positionMismatch";

export interface InlineTagOccurrence {
  id: string;
  tag: string;
  normalizedTag: string;
  sourceText: string;
  bodyStart: number;
  bodyEnd: number;
  line: number;
  column: number;
  context: string;
  availability: InlineOccurrenceAvailability;
}

export interface InlineTagOccurrenceReadResult {
  notePath: string;
  content: string;
  contentStart: number;
  body: string;
  sourceContentHash: string;
  bodyHash: string;
  frontmatterTags: string[];
  occurrences: InlineTagOccurrence[];
}

interface ScannedToken {
  tag: string;
  normalizedTag: string;
  sourceText: string;
  bodyStart: number;
  bodyEnd: number;
  line: number;
  column: number;
  context: string;
}

export class InlineTagOccurrenceReader {
  constructor(private readonly app: App) {}

  async read(file: TFile, relevantTags: string[]): Promise<InlineTagOccurrenceReadResult> {
    const content = await this.app.vault.cachedRead(file);
    const cache = this.app.metadataCache.getFileCache(file);
    return buildInlineTagOccurrenceReadResult(file.path, content, cache, relevantTags);
  }
}

export async function buildInlineTagOccurrenceReadResult(
  notePath: string,
  content: string,
  cache: CachedMetadata | null,
  relevantTags: string[]
): Promise<InlineTagOccurrenceReadResult> {
  const parts = splitMarkdownBody(content);
  return {
    notePath,
    content,
    contentStart: parts.contentStart,
    body: parts.body,
    sourceContentHash: await hashContent(content),
    bodyHash: await hashContent(parts.body),
    frontmatterTags: parseFrontmatterTags(cache?.frontmatter?.tags),
    occurrences: collectOccurrences(notePath, content, parts.contentStart, parts.body, cache, relevantTags)
  };
}

function collectOccurrences(
  notePath: string,
  content: string,
  contentStart: number,
  body: string,
  cache: CachedMetadata | null,
  relevantTags: string[]
): InlineTagOccurrence[] {
  const relevant = new Set(relevantTags.map(normalizeTag).filter(Boolean));
  const scanned = scanInlineTagTokens(body).filter((token) => relevant.has(token.normalizedTag));
  if (cache?.tags === undefined) {
    return scanned.map((token) => occurrenceFromScanned(notePath, token, "cacheUnavailable"));
  }

  const cached: InlineTagOccurrence[] = [];
  for (const entry of cache.tags) {
    const tag = stripSingleHash(entry.tag);
    const normalizedTag = normalizeTag(tag);
    if (!normalizedTag || !relevant.has(normalizedTag)) {
      continue;
    }

    const fullStart = entry.position.start.offset;
    const fullEnd = entry.position.end.offset;
    const bodyStart = toBodyOffset(fullStart, contentStart);
    const bodyEnd = toBodyOffset(fullEnd, contentStart);
    const sourceText = fullStart >= 0 && fullEnd >= fullStart ? content.slice(fullStart, fullEnd) : "";
    const trusted =
      bodyStart !== null &&
      bodyEnd !== null &&
      bodyEnd <= body.length &&
      fullEnd <= content.length &&
      sourceText === entry.tag &&
      isInlineTagToken(sourceText);
    const location = trusted
      ? { line: entry.position.start.line, column: entry.position.start.col }
      : locateBodyOffset(body, clamp(bodyStart ?? 0, 0, body.length));

    cached.push({
        id: occurrenceId(notePath, bodyStart ?? -1, bodyEnd ?? -1, normalizedTag),
        tag,
        normalizedTag,
        sourceText: entry.tag,
        bodyStart: bodyStart ?? -1,
        bodyEnd: bodyEnd ?? -1,
        line: location.line,
        column: location.column,
        context: contextForBodyOffset(body, bodyStart ?? 0),
        availability: trusted ? "trusted" : "positionMismatch"
    });
  }

  downgradeOverlaps(cached);
  const trusted = cached.filter((entry) => entry.availability === "trusted");
  const trustedRanges = new Set(
    trusted.map((entry) => `${entry.bodyStart}:${entry.bodyEnd}:${entry.sourceText}`)
  );
  const results = [...trusted];
  const scannedTags = new Set(scanned.map((token) => token.normalizedTag));
  for (const token of scanned) {
    const key = `${token.bodyStart}:${token.bodyEnd}:${token.sourceText}`;
    if (!trustedRanges.has(key)) results.push(occurrenceFromScanned(notePath, token, "positionMismatch"));
  }
  for (const mismatch of cached.filter(
    (entry) => entry.availability !== "trusted" && !scannedTags.has(entry.normalizedTag)
  )) {
    if (!results.some((entry) => entry.normalizedTag === mismatch.normalizedTag && entry.availability !== "trusted")) {
      results.push(mismatch);
    }
  }

  return results.sort(compareOccurrences);
}

function downgradeOverlaps(occurrences: InlineTagOccurrence[]): void {
  const trusted = occurrences.filter((entry) => entry.availability === "trusted").sort(compareOccurrences);
  for (let index = 1; index < trusted.length; index += 1) {
    const previous = trusted[index - 1];
    const current = trusted[index];
    if (current.bodyStart < previous.bodyEnd) {
      previous.availability = "positionMismatch";
      current.availability = "positionMismatch";
    }
  }
}

function occurrenceFromScanned(
  notePath: string,
  token: ScannedToken,
  availability: Exclude<InlineOccurrenceAvailability, "trusted">
): InlineTagOccurrence {
  return {
    id: occurrenceId(notePath, token.bodyStart, token.bodyEnd, token.normalizedTag),
    tag: token.tag,
    normalizedTag: token.normalizedTag,
    sourceText: token.sourceText,
    bodyStart: token.bodyStart,
    bodyEnd: token.bodyEnd,
    line: token.line,
    column: token.column,
    context: token.context,
    availability
  };
}

export function scanInlineTagTokens(body: string): ScannedToken[] {
  const results: ScannedToken[] = [];
  let offset = 0;
  let lineNumber = 0;
  let fence: { marker: "`" | "~"; length: number } | null = null;

  while (offset <= body.length) {
    const newline = body.indexOf("\n", offset);
    const lineEnd = newline === -1 ? body.length : newline;
    const rawLine = body.slice(offset, lineEnd);
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~";
      const length = fenceMatch[1].length;
      if (!fence) {
        fence = { marker, length };
      } else if (fence.marker === marker && length >= fence.length) {
        fence = null;
      }
    } else if (!fence && !/^\s*#(?:\s|$)/.test(line)) {
      const masked = maskInlineCode(line);
      const pattern = /(^|[\s([>{])#([\p{L}\p{N}_\-/]+)(?=$|[\s.,;:!?()[\]{}<>])/gu;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(masked)) !== null) {
        const column = match.index + match[1].length;
        const sourceText = line.slice(column, column + match[2].length + 1);
        const tag = sourceText.slice(1);
        const normalizedTag = normalizeTag(tag);
        if (!normalizedTag || !isInlineTagToken(sourceText)) {
          continue;
        }
        results.push({
          tag,
          normalizedTag,
          sourceText,
          bodyStart: offset + column,
          bodyEnd: offset + column + sourceText.length,
          line: lineNumber,
          column,
          context: truncateContext(line, column)
        });
      }
    }

    if (newline === -1) {
      break;
    }
    offset = newline + 1;
    lineNumber += 1;
  }

  return results;
}

function maskInlineCode(line: string): string {
  const chars = [...line];
  let index = 0;
  while (index < chars.length) {
    if (chars[index] !== "`") {
      index += 1;
      continue;
    }
    let runLength = 1;
    while (chars[index + runLength] === "`") runLength += 1;
    const delimiter = "`".repeat(runLength);
    const remainder = chars.slice(index + runLength).join("");
    const closing = remainder.indexOf(delimiter);
    if (closing === -1) {
      index += runLength;
      continue;
    }
    const end = index + runLength + closing + runLength;
    for (let cursor = index; cursor < end; cursor += 1) chars[cursor] = " ";
    index = end;
  }
  return chars.join("");
}

function locateBodyOffset(body: string, bodyOffset: number): { line: number; column: number } {
  const before = body.slice(0, bodyOffset);
  const lines = before.split("\n");
  return { line: lines.length - 1, column: lines[lines.length - 1].replace(/\r$/, "").length };
}

function contextForBodyOffset(body: string, bodyOffset: number): string {
  const lineStart = body.lastIndexOf("\n", Math.max(0, bodyOffset - 1)) + 1;
  const nextNewline = body.indexOf("\n", bodyOffset);
  const lineEnd = nextNewline === -1 ? body.length : nextNewline;
  return truncateContext(body.slice(lineStart, lineEnd).replace(/\r$/, ""), bodyOffset - lineStart);
}

function truncateContext(line: string, column: number): string {
  if (line.length <= 160) return line;
  const start = clamp(column - 70, 0, Math.max(0, line.length - 160));
  const slice = line.slice(start, start + 160);
  return `${start > 0 ? "…" : ""}${slice}${start + 160 < line.length ? "…" : ""}`;
}

function occurrenceId(notePath: string, bodyStart: number, bodyEnd: number, normalizedTag: string): string {
  return `${notePath}:${bodyStart}:${bodyEnd}:${normalizedTag}`;
}

function stripSingleHash(value: string): string {
  return value.startsWith("#") ? value.slice(1) : value;
}

export function isInlineTagToken(value: string): boolean {
  return /^#[\p{L}\p{N}_\-/]+$/u.test(value) && Boolean(normalizeTag(value.slice(1)));
}

function compareOccurrences(left: InlineTagOccurrence, right: InlineTagOccurrence): number {
  if (left.bodyStart !== right.bodyStart) return left.bodyStart - right.bodyStart;
  if (left.bodyEnd !== right.bodyEnd) return left.bodyEnd - right.bodyEnd;
  return left.normalizedTag.localeCompare(right.normalizedTag);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
