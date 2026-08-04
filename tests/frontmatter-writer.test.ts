import { describe, expect, it } from "vitest";
import { createFakeApp, TFile } from "./e2e/obsidian-harness";
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
    const sourceContentHash = await hashContent("body #inline");

    const change = await writer.replaceTagsIfSnapshotMatches(
      file as never,
      { beforeTags: ["before"], sourceContentHash },
      ["before", "after"]
    );

    expect(app.getNoteTags("a.md")).toEqual(["before", "after"]);
    expect(await app.vault.cachedRead(file)).toBe("body #inline");
    expect(app.vault.getNote("a.md").frontmatter).toEqual({ title: "Keep me", aliases: ["A"] });
    expect(change).toMatchObject({ beforeTags: ["before"], afterTags: ["before", "after"] });
    expect(change.afterContentHash).toBe(sourceContentHash);
  });

  it("rejects content and tag drift before writing", async () => {
    const app = createFakeApp([{ path: "a.md", content: "body", frontmatterTags: ["before"] }]);
    const writer = new FrontmatterWriter(app as never);
    const file = app.vault.getAbstractFileByPath("a.md") as TFile;
    const sourceContentHash = await hashContent("body");
    app.vault.getNote("a.md").content = "changed body";

    await expect(
      writer.replaceTagsIfSnapshotMatches(file as never, { beforeTags: ["before"], sourceContentHash }, ["after"])
    ).rejects.toMatchObject({ kind: "contentChanged" });
    expect(app.getNoteTags("a.md")).toEqual(["before"]);

    app.vault.getNote("a.md").content = "body";
    app.vault.getNote("a.md").frontmatterTags = ["manual"];
    await expect(
      writer.replaceTagsIfSnapshotMatches(file as never, { beforeTags: ["before"], sourceContentHash }, ["after"])
    ).rejects.toBeInstanceOf(SnapshotConflictError);
    expect(app.getNoteTags("a.md")).toEqual(["manual"]);
  });

  it("keeps the tags-only compatibility boundary for existing cleanup and undo", async () => {
    const app = createFakeApp([{ path: "a.md", content: "body", frontmatterTags: ["after"] }]);
    const writer = new FrontmatterWriter(app as never);
    const file = app.vault.getAbstractFileByPath("a.md") as TFile;
    await writer.replaceTagsIfCurrent(file as never, ["after"], ["before"]);
    expect(app.getNoteTags("a.md")).toEqual(["before"]);
    expect(await app.vault.cachedRead(file)).toBe("body");
  });
});
