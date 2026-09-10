import { describe, expect, it } from "vitest";
import {
  InvalidCleanupReviewPlanError,
  applyInlineTextEdits,
  buildSelectedCleanupPlan,
  clearAllCleanupChanges,
  createInlineTextEdits,
  selectAllTrustedCleanupChanges,
  setCleanupFrontmatterSelected,
  setCleanupOccurrenceSelected,
  type CleanupReviewOccurrence,
  type CleanupReviewPlan
} from "../src/cleanup/CleanupReviewPlan";

describe("CleanupReviewPlan", () => {
  it("keeps frontmatter and each trusted occurrence independently selectable", () => {
    const plan = samplePlan();
    const deselected = setCleanupOccurrenceSelected(
      setCleanupFrontmatterSelected(plan, "one.md", false),
      "one.md:7:11:old",
      false
    );

    const selected = buildSelectedCleanupPlan(deselected);

    expect(selected.files).toEqual([
      expect.objectContaining({
        notePath: "one.md",
        beforeTags: ["old", "keep"],
        afterTags: ["old", "keep"],
        inlineEdits: [expect.objectContaining({ occurrenceId: "one.md:0:4:old" })]
      })
    ]);
    expect(selected.frontmatterChangeCount).toBe(0);
    expect(selected.inlineEditCount).toBe(1);
    expect(selected.remainingSourceCount).toBe(2);
    expect(selected.partial).toBe(true);

    const cleared = buildSelectedCleanupPlan(clearAllCleanupChanges(plan));
    expect(cleared.files).toEqual([]);
    expect(cleared.partial).toBe(true);

    const all = buildSelectedCleanupPlan(selectAllTrustedCleanupChanges(clearedPlanWithSelections(plan, false)));
    expect(all.frontmatterChangeCount).toBe(1);
    expect(all.inlineEditCount).toBe(2);
    expect(all.remainingSourceCount).toBe(1);
    expect(all.partial).toBe(true);
  });

  it("persists before and after ranges so variable-length edits reverse exactly", () => {
    const body = "#a between #long-tag end";
    const occurrences = [
      occurrence("first", "a", "#a", 0, 2, "#replacement"),
      occurrence("second", "long-tag", "#long-tag", 11, 20, "#x")
    ];

    const edits = createInlineTextEdits(occurrences);

    expect(edits).toEqual([
      expect.objectContaining({ beforeBodyStart: 0, beforeBodyEnd: 2, afterBodyStart: 0, afterBodyEnd: 12 }),
      expect.objectContaining({ beforeBodyStart: 11, beforeBodyEnd: 20, afterBodyStart: 21, afterBodyEnd: 23 })
    ]);
    const after = applyInlineTextEdits(body, edits, "forward");
    expect(after).toBe("#replacement between #x end");
    expect(applyInlineTextEdits(after, edits, "reverse")).toBe(body);
  });

  it("rejects unsafe identities, untrusted edits, overlaps, and token drift", () => {
    expect(() => buildSelectedCleanupPlan({ ...samplePlan(), action: "manual" as never })).toThrow(
      InvalidCleanupReviewPlanError
    );
    expect(() =>
      createInlineTextEdits([occurrence("bad", "old", "#old", 0, 4, "not-a-tag", "trusted")])
    ).toThrow("complete tag tokens");
    expect(() =>
      createInlineTextEdits([
        occurrence("one", "old", "#old", 0, 4, "#new"),
        occurrence("two", "old", "#old", 3, 7, "#new")
      ])
    ).toThrow("overlap");
    expect(() =>
      createInlineTextEdits([occurrence("fallback", "old", "#old", 0, 4, "#new", "cacheUnavailable")])
    ).toThrow("not trusted");
    expect(() =>
      applyInlineTextEdits("#changed", createInlineTextEdits([occurrence("one", "old", "#old", 0, 4, "#new")]))
    ).toThrow("no longer matches");
  });

  it("keeps frontmatter-only and inline-only patches independent when the target already exists", () => {
    const base = samplePlan();
    const frontmatterOnly = buildSelectedCleanupPlan({
      ...base,
      files: base.files.map((file) => ({
        ...file,
        beforeTags: ["new-name", "old", "keep"],
        proposedAfterTags: ["new-name", "keep"],
        occurrences: []
      }))
    });
    expect(frontmatterOnly.files[0]).toMatchObject({
      beforeTags: ["new-name", "old", "keep"],
      afterTags: ["new-name", "keep"],
      inlineEdits: []
    });

    const inlineOnly = buildSelectedCleanupPlan({
      ...base,
      files: base.files.map((file) => ({
        ...file,
        beforeTags: ["new-name", "keep"],
        proposedAfterTags: ["new-name", "keep"],
        frontmatterChanged: false,
        frontmatterSelected: false
      }))
    });
    expect(inlineOnly.frontmatterChangeCount).toBe(0);
    expect(inlineOnly.inlineEditCount).toBe(2);
    expect(inlineOnly.files[0].afterTags).toEqual(["new-name", "keep"]);
  });
});

function samplePlan(): CleanupReviewPlan {
  return {
    itemId: "item-1",
    title: "Rename old",
    action: "rename",
    sourceTags: ["old"],
    targetTag: "new-name",
    createdAt: "2026-08-04T00:00:00.000Z",
    cancelled: false,
    files: [
      {
        notePath: "one.md",
        status: "ready",
        sourceContentHash: "content-hash",
        beforeBodyHash: "body-hash",
        beforeTags: ["old", "keep"],
        proposedAfterTags: ["new-name", "keep"],
        frontmatterChanged: true,
        frontmatterSelected: true,
        occurrences: [
          occurrence("one.md:0:4:old", "old", "#old", 0, 4, "#new-name"),
          occurrence("one.md:7:11:old", "old", "#old", 7, 11, "#new-name"),
          occurrence("one.md:14:18:old", "old", "#old", 14, 18, "#new-name", "positionMismatch")
        ]
      }
    ]
  };
}

function occurrence(
  id: string,
  tag: string,
  sourceText: string,
  bodyStart: number,
  bodyEnd: number,
  afterText: string,
  availability: CleanupReviewOccurrence["availability"] = "trusted"
): CleanupReviewOccurrence {
  return {
    id,
    tag,
    normalizedTag: tag,
    sourceText,
    bodyStart,
    bodyEnd,
    line: 0,
    column: bodyStart,
    context: sourceText,
    availability,
    afterText,
    selected: availability === "trusted"
  };
}

function clearedPlanWithSelections(plan: CleanupReviewPlan, selected: boolean): CleanupReviewPlan {
  return {
    ...plan,
    files: plan.files.map((file) => ({
      ...file,
      frontmatterSelected: selected,
      occurrences: file.occurrences.map((item) => ({ ...item, selected }))
    }))
  };
}
