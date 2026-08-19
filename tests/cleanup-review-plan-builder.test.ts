import { describe, expect, it } from "vitest";
import type { CleanupPlanItem } from "../src/cleanup/CleanupPlan";
import { CleanupReviewPlanBuilder } from "../src/cleanup/CleanupReviewPlanBuilder";
import type { InlineTagOccurrenceReadResult } from "../src/obsidian/InlineTagOccurrenceReader";

describe("CleanupReviewPlanBuilder", () => {
  it("hydrates unique files with at most four concurrent reads and isolates failures", async () => {
    let active = 0;
    let maxActive = 0;
    const progress: number[] = [];
    const builder = new CleanupReviewPlanBuilder({
      async readOccurrences(notePath, relevantTags) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        expect(relevantTags).toEqual(["old", "legacy"]);
        if (notePath === "c.md") throw new Error("read failed");
        return readResult(notePath, notePath === "b.md" ? "cacheUnavailable" : "trusted");
      }
    });

    const plan = await builder.build(item(["d.md", "c.md", "b.md", "a.md", "a.md"]), (snapshot) => {
      progress.push(snapshot.completed);
    });

    expect(maxActive).toBe(4);
    expect(plan.files.map((file) => file.notePath)).toEqual(["a.md", "b.md", "c.md", "d.md"]);
    expect(plan.files.map((file) => file.status)).toEqual(["ready", "ready", "failed", "ready"]);
    expect(plan.files[0]).toMatchObject({
      beforeTags: ["old", "keep", "target", "legacy"],
      proposedAfterTags: ["target", "keep"],
      frontmatterSelected: true
    });
    expect(plan.files[1].occurrences[0]).toMatchObject({ selected: false, availability: "cacheUnavailable" });
    expect(plan.files[2].error).toBe("read failed");
    expect(progress.at(-1)).toBe(4);
  });

  it("cancels a stale build and does not publish late read results", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const builder = new CleanupReviewPlanBuilder({
      async readOccurrences(notePath) {
        await gate;
        return readResult(notePath, "trusted");
      }
    });

    const pending = builder.build(item(["a.md", "b.md", "c.md", "d.md", "e.md"]));
    builder.cancel();
    release?.();
    const plan = await pending;

    expect(plan.cancelled).toBe(true);
    expect(plan.files.every((file) => file.status === "cancelled")).toBe(true);
  });

  it("rejects unsupported or incomplete cleanup items before reading", async () => {
    let reads = 0;
    const builder = new CleanupReviewPlanBuilder({
      async readOccurrences(notePath) {
        reads += 1;
        return readResult(notePath, "trusted");
      }
    });

    await expect(builder.build({ ...item(["a.md"]), action: "manual" as never, targetTag: undefined })).rejects.toThrow(
      "Only deterministic"
    );
    expect(reads).toBe(0);
  });
});

function item(paths: string[]): CleanupPlanItem {
  return {
    id: "cleanup-1",
    issueType: "nearDuplicates",
    title: "Merge old tags",
    action: "merge",
    capability: {
      kind: "mergeTags",
      availability: "executable",
      riskLevel: "medium",
      requiresTargetTag: true,
      requiresFilePreview: true,
      supportsBatch: false,
      defaultSelected: true
    },
    tags: ["#old", "legacy", "target"],
    targetTag: "target",
    rationale: "test",
    affectedFileCount: paths.length,
    files: paths.map((path) => ({ path, beforeTags: ["old"], afterTags: ["target"] }))
  };
}

function readResult(
  notePath: string,
  availability: "trusted" | "cacheUnavailable"
): InlineTagOccurrenceReadResult {
  return {
    notePath,
    content: "#old",
    contentStart: 0,
    body: "#old",
    sourceContentHash: `content:${notePath}`,
    bodyHash: `body:${notePath}`,
    frontmatterTags: ["old", "keep", "target", "legacy"],
    occurrences: [
      {
        id: `${notePath}:0:4:old`,
        tag: "old",
        normalizedTag: "old",
        sourceText: "#old",
        bodyStart: 0,
        bodyEnd: 4,
        line: 0,
        column: 0,
        context: "#old",
        availability
      }
    ]
  };
}
