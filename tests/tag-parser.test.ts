// Verifies tag normalization plus frontmatter and inline tag extraction.
import { describe, expect, it } from "vitest";
import { normalizeTag } from "../src/utils/normalizeTag";
import { parseFrontmatterTags, parseInlineTags, parseObsidianTags } from "../src/obsidian/TagParser";

describe("normalizeTag", () => {
  it("removes hash prefixes and normalizes whitespace while preserving hierarchy", () => {
    expect(normalizeTag("  #Project AI/LLM Notes  ")).toBe("project-ai/llm-notes");
  });
});

describe("parseFrontmatterTags", () => {
  it("supports array, comma separated, and whitespace separated tag values", () => {
    expect(parseFrontmatterTags(["project/ai", "#research notes", "writing, draft"])).toEqual([
      "project/ai",
      "research",
      "notes",
      "writing",
      "draft"
    ]);
  });
});

describe("parseInlineTags", () => {
  it("extracts inline markdown tags without capturing headings or URL fragments", () => {
    const content = [
      "# Heading",
      "Use #project/ai and #reading-notes here.",
      "Ignore https://example.com/#anchor and code `#not-a-tag`."
    ].join("\n");

    expect(parseInlineTags(content)).toEqual(["project/ai", "reading-notes"]);
  });
});

describe("parseObsidianTags", () => {
  it("normalizes tags returned by Obsidian metadata cache", () => {
    expect(parseObsidianTags(["#AI生成", "#数据结构/单调队列", " #wip "])).toEqual([
      "AI生成",
      "数据结构/单调队列",
      "wip"
    ]);
  });
});
