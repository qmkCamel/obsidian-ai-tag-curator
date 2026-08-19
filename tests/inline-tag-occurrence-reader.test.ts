import { describe, expect, it } from "vitest";
import {
  buildInlineTagOccurrenceReadResult,
  scanInlineTagTokens
} from "../src/obsidian/InlineTagOccurrenceReader";

describe("InlineTagOccurrenceReader", () => {
  it("preserves every trusted occurrence with body-relative positions", async () => {
    const content = "---\r\ntags:\r\n  - front\r\n---\r\n😀 中文 #Old 和 #old/nested\r\n再次 #Old";
    const tags = ["#Old", "#old/nested", "#Old"].map((tag, index) => {
      const from = nthIndexOf(content, tag, index === 2 ? 1 : 0);
      return cacheEntry(content, tag, from);
    });

    const result = await buildInlineTagOccurrenceReadResult(
      "notes/a.md",
      content,
      { frontmatter: { tags: ["front"] }, tags } as never,
      ["old", "old/nested"]
    );

    expect(result.frontmatterTags).toEqual(["front"]);
    expect(result.occurrences).toHaveLength(3);
    expect(result.occurrences.every((entry) => entry.availability === "trusted")).toBe(true);
    expect(result.occurrences.map((entry) => entry.sourceText)).toEqual(["#Old", "#old/nested", "#Old"]);
    expect(result.occurrences[0].bodyStart).toBe(result.body.indexOf("#Old"));
    expect(new Set(result.occurrences.map((entry) => entry.id)).size).toBe(3);
  });

  it("keeps parser fallbacks visible but never trusted when cache tags are unavailable", async () => {
    const content = [
      "# Heading",
      "正文 #中文/主题 and #valid",
      "`#inline-code`",
      "```ts",
      "#fenced",
      "```",
      "https://example.com/page#fragment"
    ].join("\n");

    const result = await buildInlineTagOccurrenceReadResult(
      "notes/a.md",
      content,
      { frontmatter: {} } as never,
      ["中文/主题", "valid", "inline-code", "fenced", "fragment"]
    );

    expect(result.occurrences.map((entry) => entry.normalizedTag)).toEqual(["中文/主题", "valid"]);
    expect(result.occurrences.every((entry) => entry.availability === "cacheUnavailable")).toBe(true);
  });

  it("downgrades stale, frontmatter, overlapping, and missing cache positions", async () => {
    const content = "---\ntags: [old]\n---\nbody #old and #other";
    const bodyOld = content.indexOf("#old", content.indexOf("body"));
    const other = content.indexOf("#other");
    const yamlOld = content.indexOf("old");
    const cache = {
      frontmatter: { tags: ["old"] },
      tags: [
        cacheEntry(content, "#old", bodyOld + 1),
        cacheEntry(content, "#old", yamlOld - 1),
        cacheEntry(content, "#other", other),
        cacheEntry(content, "#other", other)
      ]
    };

    const result = await buildInlineTagOccurrenceReadResult(
      "notes/a.md",
      content,
      cache as never,
      ["old", "other"]
    );

    expect(result.occurrences.some((entry) => entry.normalizedTag === "old" && entry.availability === "positionMismatch")).toBe(true);
    expect(result.occurrences.some((entry) => entry.bodyStart === result.body.indexOf("#old") && entry.availability === "positionMismatch")).toBe(true);
    expect(result.occurrences.filter((entry) => entry.normalizedTag === "other").every((entry) => entry.availability === "positionMismatch")).toBe(true);
  });
});

describe("scanInlineTagTokens", () => {
  it("keeps duplicate tokens and exact JavaScript offsets", () => {
    const body = "😀 #a #a\r\nnext #b/c";
    const tokens = scanInlineTagTokens(body);
    expect(tokens.map((entry) => entry.sourceText)).toEqual(["#a", "#a", "#b/c"]);
    expect(tokens.map((entry) => body.slice(entry.bodyStart, entry.bodyEnd))).toEqual(["#a", "#a", "#b/c"]);
  });
});

function cacheEntry(content: string, tag: string, startOffset: number) {
  const endOffset = startOffset + tag.length;
  return {
    tag,
    position: {
      start: { ...locate(content, startOffset), offset: startOffset },
      end: { ...locate(content, endOffset), offset: endOffset }
    }
  };
}

function locate(content: string, offset: number): { line: number; col: number } {
  const lines = content.slice(0, offset).split("\n");
  return { line: lines.length - 1, col: lines[lines.length - 1].replace(/\r$/, "").length };
}

function nthIndexOf(content: string, value: string, occurrence: number): number {
  let from = 0;
  let index = -1;
  for (let count = 0; count <= occurrence; count += 1) {
    index = content.indexOf(value, from);
    from = index + value.length;
  }
  return index;
}
