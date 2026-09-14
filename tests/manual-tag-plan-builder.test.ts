import { describe, expect, it } from "vitest";
import { ManualTagPlanBuilder } from "../src/management/ManualTagPlanBuilder";
import { defaultTagScope } from "../src/management/TagScope";
import { defaultTagPolicy } from "../src/policy/TagMutationPolicy";
import type { TagIndexSnapshot } from "../src/index/TagIndexService";

function snapshot(entries: Record<string, string[]>): TagIndexSnapshot {
  return { state: "ready", revision: 2, vaultRevision: 3, policyRevision: 0, generation: 1,
    progress: { completed: 0, total: 0 }, failedPaths: [], error: null,
    index: { updatedAt: "2026-09-14T00:00:00Z", tags: Object.fromEntries(Object.entries(entries).map(([tag, paths]) => [tag, {
      tag, normalized: tag.toLowerCase(), count: paths.length, examples: [], namingSignals: { depth: 1, hasHierarchy: false },
      files: paths.map(path => ({ path, count: 1, sources: ["inline"] }))
    }])) }
  };
}

describe("manual candidate plan", () => {
  it("keeps exact sources, removes target-only files, deduplicates and preserves target spelling", () => {
    const builder = new ManualTagPlanBuilder(snapshot({ old: ["P/b.md", "P/a.md"], "old/child": ["P/child.md"], other: ["P/b.md"], target: ["target.md"] }), defaultTagPolicy());
    const result = builder.prepare({ kind: "merge", sources: ["old", "other", "Target"], target: "Target", scope: defaultTagScope() });
    expect(result.input).toMatchObject({ sourceTags: ["old", "other"], targetTag: "Target", candidatePaths: ["P/a.md", "P/b.md"] });
    expect(result.context).toMatchObject({ origin: "manual", indexRevision: 2, vaultRevision: 3 });
  });

  it("applies exclusion after unioned includes without reading excluded notes", () => {
    const policy = { ...defaultTagPolicy(), excludedFolders: ["P/Archive"] };
    const builder = new ManualTagPlanBuilder(snapshot({ old: ["P/a.md", "P/Archive/a.md", "P-Old/a.md"] }), policy);
    const result = builder.prepare({ kind: "rename", source: "old", target: "New", scope: { include: [{ path: "P", recursive: true }] } });
    expect(result.context.candidatePaths).toEqual(["P/a.md"]);
    expect(result.outsideFiles).toBe(2);
  });

  it.each([0, 201])("rejects %i candidates rather than silently truncating", count => {
    const builder = new ManualTagPlanBuilder(snapshot({ old: Array.from({ length: count }, (_, i) => `${i}.md`) }), defaultTagPolicy());
    expect(() => builder.prepare({ kind: "rename", source: "old", target: "new", scope: defaultTagScope() })).toThrow("1 and 200");
  });

  it("allows exactly 200 candidates and snapshots the input scope", () => {
    const scope = defaultTagScope();
    const builder = new ManualTagPlanBuilder(snapshot({ old: Array.from({ length: 200 }, (_, i) => `${i}.md`) }), defaultTagPolicy());
    const result = builder.prepare({ kind: "rename", source: "old", target: "new", scope });
    scope.include[0].path = "changed";
    expect(result.context.candidatePaths).toHaveLength(200);
    expect(result.context.scope).toEqual(defaultTagScope());
  });

  it.each(["stale", "error", "missing", "refreshing"] as const)("rejects %s indexes", state => {
    const builder = new ManualTagPlanBuilder({ ...snapshot({ old: ["a.md"] }), state }, defaultTagPolicy());
    expect(() => builder.prepare({ kind: "rename", source: "old", target: "new", scope: defaultTagScope() })).toThrow("Refresh");
  });

  it("rejects protected sources, protected targets and mismatched policy revisions", () => {
    for (const tag of ["old", "new"]) {
      const policy = { ...defaultTagPolicy(), protectedTags: [{ tag, mode: "exact" as const }] };
      expect(() => new ManualTagPlanBuilder(snapshot({ old: ["a.md"] }), policy).prepare({ kind: "rename", source: "old", target: "new", scope: defaultTagScope() })).toThrow("Protected");
    }
    expect(() => new ManualTagPlanBuilder(snapshot({ old: ["a.md"] }), { ...defaultTagPolicy(), revision: 1 })
      .prepare({ kind: "rename", source: "old", target: "new", scope: defaultTagScope() })).toThrow("Refresh");
  });
});
