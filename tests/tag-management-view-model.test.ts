import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import type { TagFileUsage, TagIndex, TagSource, TagUsage } from "../src/index/TagIndex";
import { buildTagManagementViewModel, TagManagementViewModel } from "../src/management/TagManagementViewModel";

function file(path: string, sources: TagSource[] = ["inline"]): TagFileUsage { return { path, sources, count: 900 }; }
function usage(tag: string, files: TagFileUsage[], normalized = tag.toLowerCase()): TagUsage {
  return { tag, normalized, files, count: 99999, examples: [], namingSignals: { depth: 1, hasHierarchy: false } };
}
function index(...usages: TagUsage[]): TagIndex {
  return { updatedAt: "2026-09-10", tags: Object.fromEntries(usages.map((value) => [value.tag, value])) };
}

describe("TagManagementViewModel", () => {
  it("merges normalized identities and deduplicates files and source evidence independently", () => {
    const model = new TagManagementViewModel(index(
      usage("Topic", [file("a.md", ["frontmatter", "inline", "inline"]), file("a.md"), file("b.md", ["metadata"])]),
      usage("TOPIC", [file("a.md", ["frontmatter"]), file("c.md", ["inline"])])
    ));
    expect(model.query().items).toEqual([{ tagKey: "topic", tagText: "TOPIC", fileCount: 3,
      frontmatterFileCount: 1, inlineFileCount: 2, metadataFileCount: 1, hasChildren: false }]);
    expect(model.getRelatedFiles("#Topic").items).toEqual([
      { path: "a.md", sources: ["frontmatter", "inline"] }, { path: "b.md", sources: ["metadata"] }, { path: "c.md", sources: ["inline"] }
    ]);
    expect(model.query().items[0]).not.toHaveProperty("count");
  });

  it("uses normalized keys instead of object keys and ignores empty identities", () => {
    const value = index(usage("Display", [file("a.md")], "#Canonical"), usage("", [file("ignored.md")]));
    expect(buildTagManagementViewModel(value).items[0].tagKey).toBe("canonical");
    expect(buildTagManagementViewModel(value).total).toBe(1);
  });

  it("counts files within scope, with exact folder segments, union, exclusion, and allowlists", () => {
    const model = new TagManagementViewModel(index(usage("tag", [
      file("Project/a.md"), file("Project/Sub/b.md"), file("Project/Archive/c.md"), file("Project-Old/d.md"), file("root.md")
    ])));
    const scope = { include: [{ path: "Project", recursive: true }, { path: "Project/Sub", recursive: true }] };
    expect(model.query({ scope, excludedFolders: ["Project/Archive"] }).items[0].fileCount).toBe(2);
    expect(model.getRelatedFiles("tag", { scope, paths: ["Project/Sub/b.md", "Project-Old/d.md"] }).items.map((entry) => entry.path)).toEqual(["Project/Sub/b.md"]);
    expect(model.query({ scope: { include: [{ path: "Project", recursive: false }] } }).items[0].fileCount).toBe(1);
    expect(model.query({ scope: { include: [{ path: "", recursive: false }] } }).items[0].fileCount).toBe(1);
    expect(model.query({ scope: { include: [{ path: "", recursive: true }] } }).items[0].fileCount).toBe(5);
    expect(model.query({ scope: { include: [] } }).total).toBe(0);
    expect(model.query({ paths: [] }).total).toBe(0);
    expect(model.query({ excludedFolders: [""] }).total).toBe(0);
  });

  it("preserves host path case semantics and rejects unnormalized filter inputs", () => {
    const model = new TagManagementViewModel(index(usage("tag", [file("Project/a.md")])));
    expect(model.query({ scope: { include: [{ path: "project", recursive: true }] } }).total).toBe(0);
    for (const path of ["/Project", "../Project", "Project//Sub", "C:/Project", "Project\\Sub", "Project/."]) {
      expect(() => model.query({ scope: { include: [{ path, recursive: true }] } })).toThrow("vault-relative");
    }
  });

  it("filters by literal case-insensitive substring, not regex or normalized input", () => {
    const model = new TagManagementViewModel(index(
      usage("Tag[1]", [file("a.md")]), usage("tag/child", [file("b.md")]), usage("tag-one", [file("c.md")])
    ));
    expect(model.query({ search: "[1]" }).items.map((row) => row.tagKey)).toEqual(["tag[1]"]);
    expect(model.query({ search: ".*" }).total).toBe(0);
    expect(model.query({ search: "TAG/" }).total).toBe(1);
    expect(model.query({ search: "tag one" }).total).toBe(0);
  });

  it("source browse filters select rows without stripping counts or exact detail evidence", () => {
    const model = new TagManagementViewModel(index(usage("mixed", [file("a.md", ["frontmatter", "inline"]), file("b.md", ["frontmatter"])]),
      usage("property", [file("c.md", ["frontmatter"])]), usage("legacy", [file("d.md", ["metadata"])])));
    const rows = model.query({ source: "inline" }).items;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fileCount: 2, frontmatterFileCount: 2, inlineFileCount: 1 });
    expect(model.getRelatedFiles("mixed").total).toBe(2);
    expect(model.query({ source: "metadata" }).items[0].tagKey).toBe("legacy");
    expect(model.query({ source: "frontmatter" }).total).toBe(2);
  });

  it("sorts by deduplicated file count descending and stable ascending identity for ties", () => {
    const model = new TagManagementViewModel(index(usage("z", [file("a.md")]), usage("a", [file("b.md")]),
      usage("m", [file("a.md", ["frontmatter"]), file("b.md", ["frontmatter"])])
    ));
    expect(model.query().items.map((row) => row.tagKey)).toEqual(["m", "a", "z"]);
    expect(model.query({ sort: "fileCount", direction: "asc" }).items.map((row) => row.tagKey)).toEqual(["a", "z", "m"]);
    expect(model.query({ sort: "tag" }).items.map((row) => row.tagKey)).toEqual(["a", "m", "z"]);
    expect(model.query({ sort: "tag", direction: "desc" }).items.map((row) => row.tagKey)).toEqual(["z", "m", "a"]);
    expect(model.query({ sort: "frontmatterFileCount" }).items[0].tagKey).toBe("m");
  });

  it("never mixes descendants into exact related files and signals children separately", () => {
    const model = new TagManagementViewModel(index(usage("project", [file("parent.md")]), usage("project/active/deep", [file("child.md")]),
      usage("project-old", [file("other.md")])));
    expect(model.getRelatedFiles("PROJECT").items.map((entry) => entry.path)).toEqual(["parent.md"]);
    expect(model.query({ search: "project" }).items.find((entry) => entry.tagKey === "project")?.hasChildren).toBe(true);
    expect(model.getRelatedFiles("absent").total).toBe(0);
    expect(model.query({ paths: ["parent.md"] }).items[0].hasChildren).toBe(false);
  });

  it("caps tag pages at 100 and related files at 50 with deterministic clamping", () => {
    const model = new TagManagementViewModel(index(...Array.from({ length: 205 }, (_, i) => usage(`tag-${String(i).padStart(3, "0")}`,
      Array.from({ length: 121 }, (_, j) => file(`${String(j).padStart(3, "0")}.md`))))));
    expect(model.query({ pageSize: 1000 })).toMatchObject({ total: 205, page: 1, pageSize: 100, pageCount: 3 });
    expect(model.query().items).toHaveLength(100);
    expect(model.query({ page: 100 }).items).toHaveLength(5);
    expect(model.query({ page: 2 }).items[0].tagKey).toBe("tag-100");
    expect(model.getRelatedFiles("tag-000", { pageSize: 1000 })).toMatchObject({ total: 121, pageSize: 50, pageCount: 3 });
    expect(model.getRelatedFiles("tag-000", { page: 3 }).items).toHaveLength(21);
    expect(model.query({ page: NaN, pageSize: Infinity })).toMatchObject({ page: 1, pageSize: 100 });
    expect(model.query({ page: -1, pageSize: 0 })).toMatchObject({ page: 1, pageSize: 100 });
  });

  it("distinguishes missing cache, empty cache, and no matching tags", () => {
    expect(buildTagManagementViewModel(null)).toMatchObject({ hasIndex: false, total: 0, totalTags: 0, pageCount: 0, page: 1 });
    expect(buildTagManagementViewModel(index())).toMatchObject({ hasIndex: true, total: 0, totalTags: 0 });
    expect(buildTagManagementViewModel(index(usage("a", [file("a.md")])), { search: "absent" })).toMatchObject({ hasIndex: true, total: 0, totalTags: 1 });
  });

  it("invalidates cached scope/sort on a new index or explicit revision", () => {
    const value = index(usage("a", [file("a.md")]));
    const model = new TagManagementViewModel(value, 1);
    expect(model.query().total).toBe(1);
    value.tags.b = usage("b", [file("b.md")]);
    model.setIndex(value, 2);
    expect(model.query().total).toBe(2);
    model.setIndex(index(usage("c", [file("c.md")])));
    expect(model.query().items[0].tagKey).toBe("c");
    model.setIndex(null);
    expect(model.query().hasIndex).toBe(false);
  });

  it("does not mutate the index or let callers mutate cached row/source projections", () => {
    const value = index(usage("a", [file("a.md", ["frontmatter", "inline"])]));
    const before = JSON.stringify(value);
    const model = new TagManagementViewModel(value);
    model.query().items[0].fileCount = 500;
    model.getRelatedFiles("a").items[0].sources.length = 0;
    expect(model.query().items[0].fileCount).toBe(1);
    expect(model.getRelatedFiles("a").items[0].sources).toEqual(["frontmatter", "inline"]);
    expect(JSON.stringify(value)).toBe(before);
  });

  it.each([1000, 10000])("measures warm filter p95 with a fixed %i-tag fixture", (size) => {
    const model = new TagManagementViewModel(index(...Array.from({ length: size }, (_, i) =>
      usage(`tag-${String(i).padStart(5, "0")}`, [file(`notes/${i}.md`)]))));
    for (let i = 0; i < 5; i += 1) model.query({ search: "tag-0" });
    const durations = Array.from({ length: 30 }, () => {
      const start = performance.now();
      const result = model.query({ search: "tag-0" });
      const duration = performance.now() - start;
      expect(result.items.length).toBeLessThanOrEqual(100);
      return duration;
    }).sort((a, b) => a - b);
    const p95Ms = durations[Math.ceil(durations.length * 0.95) - 1];
    console.info(JSON.stringify({ fixtureTags: size, filesPerTag: 1, warmups: 5, samples: 30, p95Ms,
      minMs: durations[0], maxMs: durations[durations.length - 1],
      cpu: cpus()[0]?.model, platform: platform(), arch: arch(), node: process.version,
      host: "Node/Vitest; Obsidian and DOM not exercised", maxProjectedRows: 100 }));
    expect(p95Ms).toBeLessThan(size === 1000 ? 150 : 300);
  });
});
