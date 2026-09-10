// Applies only reviewed, exact inline-token replacements through Vault.process with full-content CAS.
import type { App, TFile } from "obsidian";
import type { InlineTextEdit } from "../cleanup/CleanupReviewPlan";
import { hashContent } from "../utils/hashContent";
import { isInlineTagToken } from "./InlineTagOccurrenceReader";
import { joinMarkdownBody, splitMarkdownBody } from "./MarkdownBody";

export type InlineTagWriteConflictKind = "contentChanged" | "tokenChanged" | "invalidPatch";

export class InlineTagWriteError extends Error {
  constructor(readonly kind: InlineTagWriteConflictKind, message: string) {
    super(message);
    this.name = "InlineTagWriteError";
  }
}

export interface InlineTagWritePatch {
  expectedContentHash: string;
  expectedBodyHash: string;
  edits: InlineTextEdit[];
}

export interface InlineTagWriteResult {
  beforeContentHash: string;
  beforeBodyHash: string;
  afterContentHash: string;
  afterBodyHash: string;
  editCount: number;
}

export interface InlineTagSnapshot {
  contentHash: string;
  bodyHash: string;
}

interface PreparedInlineTagWrite {
  content: string;
  body: string;
  beforeContentHash: string;
  beforeBodyHash: string;
  afterContent: string;
  afterBody: string;
  afterContentHash: string;
  afterBodyHash: string;
}

export class InlineTagWriter {
  constructor(private readonly app: App) {}

  async checkPatch(file: TFile, patch: InlineTagWritePatch): Promise<InlineTagWriteResult> {
    const prepared = await this.prepare(file, patch);
    return resultFromPrepared(prepared, patch.edits.length);
  }

  async readSnapshot(file: TFile): Promise<InlineTagSnapshot> {
    const content = await this.app.vault.read(file);
    return {
      contentHash: await hashContent(content),
      bodyHash: await hashContent(splitMarkdownBody(content).body)
    };
  }

  async apply(file: TFile, patch: InlineTagWritePatch): Promise<InlineTagWriteResult> {
    const prepared = await this.prepare(file, patch);
    const written = await this.app.vault.process(file, (data) => {
      if (data !== prepared.content) {
        throw new InlineTagWriteError(
          "contentChanged",
          "Note content changed after inline-tag preflight and before the atomic write."
        );
      }
      return prepared.afterContent;
    });

    if (written !== prepared.afterContent) {
      throw new InlineTagWriteError("contentChanged", "Vault.process returned content different from the reviewed patch.");
    }
    return resultFromPrepared(prepared, patch.edits.length);
  }

  private async prepare(file: TFile, patch: InlineTagWritePatch): Promise<PreparedInlineTagWrite> {
    validatePatchShape(patch.edits);
    const content = await this.app.vault.read(file);
    const beforeContentHash = await hashContent(content);
    if (beforeContentHash !== patch.expectedContentHash) {
      throw new InlineTagWriteError("contentChanged", "Note content changed since the inline-tag patch was reviewed.");
    }

    const parts = splitMarkdownBody(content);
    const beforeBodyHash = await hashContent(parts.body);
    if (beforeBodyHash !== patch.expectedBodyHash) {
      throw new InlineTagWriteError("contentChanged", "Note body changed since the inline-tag patch was reviewed.");
    }
    validateReviewedSlices(parts.body, patch.edits);
    const afterBody = replaceReviewedSlices(parts.body, patch.edits);
    const afterContent = joinMarkdownBody(parts, afterBody);
    return {
      content,
      body: parts.body,
      beforeContentHash,
      beforeBodyHash,
      afterContent,
      afterBody,
      afterContentHash: await hashContent(afterContent),
      afterBodyHash: await hashContent(afterBody)
    };
  }
}

export function createReverseInlineTagWritePatch(
  edits: InlineTextEdit[],
  expectedAfterContentHash: string,
  expectedAfterBodyHash: string
): InlineTagWritePatch {
  return {
    expectedContentHash: expectedAfterContentHash,
    expectedBodyHash: expectedAfterBodyHash,
    edits: edits.map((edit) => ({
      occurrenceId: edit.occurrenceId,
      beforeBodyStart: edit.afterBodyStart,
      beforeBodyEnd: edit.afterBodyEnd,
      afterBodyStart: edit.beforeBodyStart,
      afterBodyEnd: edit.beforeBodyEnd,
      beforeText: edit.afterText,
      afterText: edit.beforeText
    }))
  };
}

function validatePatchShape(edits: InlineTextEdit[]): void {
  if (edits.length === 0) {
    throw new InlineTagWriteError("invalidPatch", "An inline-tag patch must contain at least one edit.");
  }

  const sorted = [...edits].sort((left, right) => left.beforeBodyStart - right.beforeBodyStart);
  let previousBeforeEnd = -1;
  let delta = 0;
  for (const edit of sorted) {
    if (
      edit.beforeBodyStart < 0 ||
      edit.beforeBodyEnd <= edit.beforeBodyStart ||
      edit.beforeBodyStart < previousBeforeEnd ||
      edit.afterBodyStart !== edit.beforeBodyStart + delta ||
      edit.afterBodyEnd !== edit.afterBodyStart + edit.afterText.length ||
      edit.beforeBodyEnd - edit.beforeBodyStart !== edit.beforeText.length
    ) {
      throw new InlineTagWriteError("invalidPatch", "Inline-tag patch ranges are invalid, overlapping, or inconsistent.");
    }
    if (!isInlineTagToken(edit.beforeText) || !isInlineTagToken(edit.afterText)) {
      throw new InlineTagWriteError("invalidPatch", "Inline-tag patches must replace complete tag tokens.");
    }
    previousBeforeEnd = edit.beforeBodyEnd;
    delta += edit.afterText.length - edit.beforeText.length;
  }
}

function validateReviewedSlices(body: string, edits: InlineTextEdit[]): void {
  for (const edit of edits) {
    if (edit.beforeBodyEnd > body.length || body.slice(edit.beforeBodyStart, edit.beforeBodyEnd) !== edit.beforeText) {
      throw new InlineTagWriteError("tokenChanged", "An inline tag no longer matches the reviewed token and position.");
    }
  }
}

function replaceReviewedSlices(body: string, edits: InlineTextEdit[]): string {
  let result = body;
  const descending = [...edits].sort((left, right) => right.beforeBodyStart - left.beforeBodyStart);
  for (const edit of descending) {
    result = `${result.slice(0, edit.beforeBodyStart)}${edit.afterText}${result.slice(edit.beforeBodyEnd)}`;
  }
  return result;
}

function resultFromPrepared(prepared: PreparedInlineTagWrite, editCount: number): InlineTagWriteResult {
  return {
    beforeContentHash: prepared.beforeContentHash,
    beforeBodyHash: prepared.beforeBodyHash,
    afterContentHash: prepared.afterContentHash,
    afterBodyHash: prepared.afterBodyHash,
    editCount
  };
}
