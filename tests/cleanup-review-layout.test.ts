import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cleanup review responsive layout", () => {
  it("uses Obsidian variables, scrolling, wrapping, focus, and a narrow-window boundary", () => {
    const css = readFileSync("styles.css", "utf8");
    expect(css).toContain(".tag-curator-cleanup-review-modal .modal-content");
    expect(css).toContain("overflow-y: auto;");
    expect(css).toContain("overflow-wrap: anywhere;");
    expect(css).toContain("var(--background-secondary)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (max-width: 520px)");
  });
});
