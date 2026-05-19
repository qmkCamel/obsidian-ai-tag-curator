import { describe, expect, it } from "vitest";
import { applyCleanupPreviewToFrontmatterTags } from "../src/cleanup/CleanupTagTransform";

describe("applyCleanupPreviewToFrontmatterTags", () => {
  it("replaces cleanup preview tags while preserving unrelated frontmatter tags", () => {
    const afterTags = applyCleanupPreviewToFrontmatterTags(["AI", "notes", "ai"], {
      path: "notes/a.md",
      beforeTags: ["AI", "ai"],
      afterTags: ["AI"]
    });

    expect(afterTags).toEqual(["ai", "notes"]);
  });

  it("leaves frontmatter unchanged when preview tags only came from inline sources", () => {
    const afterTags = applyCleanupPreviewToFrontmatterTags(["notes"], {
      path: "notes/a.md",
      beforeTags: ["inline-only"],
      afterTags: ["target"]
    });

    expect(afterTags).toEqual(["notes"]);
  });
});
