import { describe, expect, it } from "vitest";
import { createFakeApp, TFile, withFrontmatter } from "./e2e/obsidian-harness";
import { FrontmatterWriter, SnapshotConflictError } from "../src/obsidian/FrontmatterWriter";
import { hashContent } from "../src/utils/hashContent";

describe("FrontmatterWriter", () => {
  it("writes only tags when content hash and tag snapshot both match", async () => {
    const app = createFakeApp([
      {
        path: "a.md",
        content: "body #inline",
        frontmatterTags: ["before"],
        frontmatter: { title: "Keep me", aliases: ["A"] }
      }
    ]);
    const writer = new FrontmatterWriter(app as never);
    const file = app.vault.getAbstractFileByPath("a.md") as TFile;
    const sourceContentHash = await hashContent(await app.vault.cachedRead(file));

    const change = await writer.replaceTagsIfSnapshotMatches(
      file as never,
      { beforeTags: ["before"], sourceContentHash },
      ["before", "after"]
    );

    expect(app.getNoteTags("a.md")).toEqual(["before", "after"]);
    const expectedContent = withFrontmatter("body #inline", { title: "Keep me", aliases: ["A"], tags: ["before", "after"] });
    expect(await app.vault.cachedRead(file)).toBe(expectedContent);
    expect(app.vault.getNote("a.md").frontmatter).toEqual({ title: "Keep me", aliases: ["A"] });
    expect(change).toMatchObject({ beforeTags: ["before"], afterTags: ["before", "after"] });
    expect(change.afterContentHash).toBe(await hashContent(expectedContent));
    expect(change.afterContentHash).not.toBe(sourceContentHash);
  });

  it("rejects content and tag drift before writing", async () => {
    const app = createFakeApp([{ path: "a.md", content: "body", frontmatterTags: ["before"] }]);
    const writer = new FrontmatterWriter(app as never);
    const file = app.vault.getAbstractFileByPath("a.md") as TFile;
    const sourceContent = await app.vault.cachedRead(file);
    const sourceContentHash = await hashContent(sourceContent);
    app.vault.getNote("a.md").content = withFrontmatter("changed body", { tags: ["before"] });

    await expect(
      writer.replaceTagsIfSnapshotMatches(file as never, { beforeTags: ["before"], sourceContentHash }, ["after"])
    ).rejects.toMatchObject({ kind: "contentChanged" });
    expect(app.getNoteTags("a.md")).toEqual(["before"]);

    expect(app.fileManager.getWriteCount()).toBe(0);
    app.vault.getNote("a.md").content = sourceContent;
    app.vault.getNote("a.md").frontmatterTags = ["manual"];
    await expect(
      writer.replaceTagsIfSnapshotMatches(file as never, { beforeTags: ["before"], sourceContentHash }, ["after"])
    ).rejects.toMatchObject({ kind: "contentChanged" });
    expect(app.fileManager.getWriteCount()).toBe(0);

    // Match the full Markdown hash to exercise the independent stale-tag guard.
    const driftedContentHash = await hashContent(await app.vault.cachedRead(file));
    await expect(
      writer.replaceTagsIfSnapshotMatches(file as never, { beforeTags: ["before"], sourceContentHash: driftedContentHash }, ["after"])
    ).rejects.toBeInstanceOf(SnapshotConflictError);
    await expect(
      writer.checkSnapshot(file as never, { beforeTags: ["before"], sourceContentHash: driftedContentHash })
    ).rejects.toMatchObject({ kind: "tagsChanged" });
    expect(app.getNoteTags("a.md")).toEqual(["manual"]);
  });

  it("keeps the tags-only compatibility boundary for existing cleanup and undo", async () => {
    const app = createFakeApp([{ path: "a.md", content: "body", frontmatterTags: ["after"] }]);
    const writer = new FrontmatterWriter(app as never);
    const file = app.vault.getAbstractFileByPath("a.md") as TFile;
    await writer.replaceTagsIfCurrent(file as never, ["after"], ["before"]);
    expect(app.getNoteTags("a.md")).toEqual(["before"]);
    expect(await app.vault.cachedRead(file)).toBe(withFrontmatter("body", { tags: ["before"] }));
  });
});
