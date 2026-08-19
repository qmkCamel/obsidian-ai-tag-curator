import { describe, expect, it } from "vitest";
import { createInlineTextEdits, type CleanupReviewOccurrence } from "../src/cleanup/CleanupReviewPlan";
import {
  InlineTagWriteError,
  InlineTagWriter,
  createReverseInlineTagWritePatch,
  type InlineTagWritePatch
} from "../src/obsidian/InlineTagWriter";
import { splitMarkdownBody } from "../src/obsidian/MarkdownBody";
import { hashContent } from "../src/utils/hashContent";
import { createFakeApp, TFile } from "./e2e/obsidian-harness";

describe("InlineTagWriter", () => {
  it("rewrites only selected tokens while preserving frontmatter, Unicode, CRLF, and punctuation byte-for-byte", async () => {
    const content = "---\r\ntitle: 中文😀\r\n---\r\n前缀 (#old), keep #old and #other.\r\n";
    const parts = splitMarkdownBody(content);
    const first = parts.body.indexOf("#old");
    const second = parts.body.indexOf("#old", first + 1);
    const edits = createInlineTextEdits([
      occurrence("first", first, first + 4, "#old", "#much-longer")
    ]);
    const app = createFakeApp([{ path: "note.md", content }]);
    const file = app.vault.getAbstractFileByPath("note.md") as TFile;
    const writer = new InlineTagWriter(app as never);

    const result = await writer.apply(file as never, await patchFor(content, edits));

    const written = app.vault.getNote("note.md").content;
    expect(written).toBe(content.slice(0, parts.contentStart + first) + "#much-longer" + content.slice(parts.contentStart + first + 4));
    expect(written.includes(`#much-longer), keep ${parts.body.slice(second, second + 4)} and #other.`)).toBe(true);
    expect(result.editCount).toBe(1);
    expect(result.afterContentHash).toBe(await hashContent(written));
    expect(app.vault.getProcessCount()).toBe(1);
  });

  it("supports multiple variable-length replacements and an exact reverse round trip", async () => {
    const content = "#a between #long-tag end";
    const edits = createInlineTextEdits([
      occurrence("first", 0, 2, "#a", "#replacement"),
      occurrence("second", 11, 20, "#long-tag", "#x")
    ]);
    const app = createFakeApp([{ path: "note.md", content }]);
    const file = app.vault.getAbstractFileByPath("note.md") as TFile;
    const writer = new InlineTagWriter(app as never);

    const applied = await writer.apply(file as never, await patchFor(content, edits));
    expect(app.vault.getNote("note.md").content).toBe("#replacement between #x end");

    const reversed = createReverseInlineTagWritePatch(edits, applied.afterContentHash, applied.afterBodyHash);
    await writer.apply(file as never, reversed);
    expect(app.vault.getNote("note.md").content).toBe(content);
  });

  it("rejects full-content, body, and token drift before Vault.process", async () => {
    const content = "prefix #old suffix";
    const edits = createInlineTextEdits([occurrence("one", 7, 11, "#old", "#new")]);

    const base = await patchFor(content, edits);
    const cases: Array<{ patch: InlineTagWritePatch; kind: "contentChanged" | "tokenChanged" }> = [
      { patch: { ...base, expectedContentHash: "wrong" }, kind: "contentChanged" },
      { patch: { ...base, expectedBodyHash: "wrong" }, kind: "contentChanged" },
      {
        patch: { ...base, edits: [{ ...base.edits[0], beforeText: "#bad", beforeBodyEnd: 11 }] },
        kind: "tokenChanged"
      }
    ];
    for (const { patch, kind } of cases) {
      const app = createFakeApp([{ path: "note.md", content }]);
      const file = app.vault.getAbstractFileByPath("note.md") as TFile;
      const writer = new InlineTagWriter(app as never);
      await expect(writer.apply(file as never, patch)).rejects.toMatchObject({ kind });
      expect(app.vault.getProcessCount()).toBe(0);
      expect(app.vault.getNote("note.md").content).toBe(content);
    }
  });

  it("closes the preflight race inside Vault.process", async () => {
    const content = "#old";
    const edits = createInlineTextEdits([occurrence("one", 0, 4, "#old", "#new")]);
    const app = createFakeApp([{ path: "note.md", content }]);
    const file = app.vault.getAbstractFileByPath("note.md") as TFile;
    app.vault.setProcessInterceptor(() => {
      app.vault.getNote("note.md").content = "#manual";
    });

    await expect(new InlineTagWriter(app as never).apply(file as never, await patchFor(content, edits))).rejects.toMatchObject({
      kind: "contentChanged"
    });
    expect(app.vault.getNote("note.md").content).toBe("#manual");
  });

  it("rejects empty, overlapping, inconsistent, and non-token patches", async () => {
    const content = "#old #old";
    const valid = await patchFor(content, createInlineTextEdits([occurrence("one", 0, 4, "#old", "#new") ]));
    const invalidPatches: InlineTagWritePatch[] = [
      { ...valid, edits: [] },
      {
        ...valid,
        edits: [valid.edits[0], { ...valid.edits[0], occurrenceId: "two", beforeBodyStart: 2, beforeBodyEnd: 6 }]
      },
      { ...valid, edits: [{ ...valid.edits[0], afterBodyStart: 1 }] },
      { ...valid, edits: [{ ...valid.edits[0], afterText: "plain" }] }
    ];

    for (const patch of invalidPatches) {
      const app = createFakeApp([{ path: "note.md", content }]);
      const file = app.vault.getAbstractFileByPath("note.md") as TFile;
      await expect(new InlineTagWriter(app as never).apply(file as never, patch)).rejects.toMatchObject({
        kind: "invalidPatch"
      });
      expect(app.vault.getProcessCount()).toBe(0);
    }
  });
});

async function patchFor(content: string, edits: InlineTagWritePatch["edits"]): Promise<InlineTagWritePatch> {
  const body = splitMarkdownBody(content).body;
  return {
    expectedContentHash: await hashContent(content),
    expectedBodyHash: await hashContent(body),
    edits
  };
}

function occurrence(
  id: string,
  bodyStart: number,
  bodyEnd: number,
  beforeText: string,
  afterText: string
): CleanupReviewOccurrence {
  return {
    id,
    tag: beforeText.slice(1),
    normalizedTag: beforeText.slice(1).toLowerCase(),
    sourceText: beforeText,
    bodyStart,
    bodyEnd,
    line: 0,
    column: bodyStart,
    context: beforeText,
    availability: "trusted",
    afterText,
    selected: true
  };
}
