import { describe, expect, it } from "vitest";
import { buildCleanupReviewViewModel } from "../src/cleanup/CleanupReviewViewModel";
import type { CleanupReviewPlan } from "../src/cleanup/CleanupReviewPlan";

describe("CleanupReviewViewModel", () => {
  it("groups sources and derives partial, empty, and disabled occurrence state", () => {
    const plan = samplePlan();
    const view = buildCleanupReviewViewModel(plan);
    expect(view.canApply).toBe(true);
    expect(view.partial).toBe(true);
    expect(view.hasUnavailable).toBe(true);
    expect(view.files[0]).toMatchObject({
      frontmatterSelected: true,
      selectedOccurrenceCount: 1,
      unavailableOccurrenceCount: 1
    });
    expect(view.selected).toMatchObject({
      fileCount: 1,
      frontmatterChangeCount: 1,
      inlineEditCount: 1,
      remainingSourceCount: 1
    });

    const empty = buildCleanupReviewViewModel({
      ...plan,
      files: plan.files.map((file) => ({
        ...file,
        frontmatterSelected: false,
        occurrences: file.occurrences.map((occurrence) => ({ ...occurrence, selected: false }))
      }))
    });
    expect(empty.canApply).toBe(false);
    expect(empty.selected.files).toEqual([]);
  });
});

export function samplePlan(): CleanupReviewPlan {
  return {
    itemId: "rename",
    title: "Rename",
    action: "rename",
    sourceTags: ["old"],
    targetTag: "new",
    createdAt: "2026-08-04T00:00:00.000Z",
    cancelled: false,
    files: [
      {
        notePath: "very/long/path/包含中文/note.md",
        status: "ready",
        sourceContentHash: "content",
        beforeBodyHash: "body",
        beforeTags: ["old", "keep"],
        proposedAfterTags: ["new", "keep"],
        frontmatterChanged: true,
        frontmatterSelected: true,
        occurrences: [
          {
            id: "trusted",
            tag: "old",
            normalizedTag: "old",
            sourceText: "#old",
            bodyStart: 0,
            bodyEnd: 4,
            line: 2,
            column: 0,
            context: "long 中文 context #old that must wrap in a narrow modal",
            availability: "trusted",
            afterText: "#new",
            selected: true
          },
          {
            id: "unavailable",
            tag: "old",
            normalizedTag: "old",
            sourceText: "#old",
            bodyStart: 10,
            bodyEnd: 14,
            line: 4,
            column: 3,
            context: "stale #old",
            availability: "positionMismatch",
            afterText: "#new",
            selected: false
          }
        ]
      }
    ]
  };
}
