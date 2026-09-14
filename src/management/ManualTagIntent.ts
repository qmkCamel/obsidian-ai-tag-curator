import { normalizeTag } from "../utils/normalizeTag";
import { normalizeScope, type TagScope } from "./TagScope";

export type ManualTagIntent =
  | { kind: "rename"; source: string; target: string; scope: TagScope }
  | { kind: "merge"; sources: string[]; target: string; scope: TagScope };

export interface ReviewContext {
  origin: "manual" | "health";
  indexRevision: number;
  vaultRevision: number;
  policyRevision: number;
  scope: TagScope;
  candidatePaths: string[];
}

export type TagSkipReason = "scopeExcluded" | "protected" | "untrusted" | "readFailed" | "unselected";

export function validateTagText(value: string): string {
  const text = value.trim().replace(/^#/, "");
  if (!text || !/^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(text) || !/[^\p{N}/]/u.test(text)) {
    throw new Error("Unsupported tag: use letters, numbers, _ or -, with nonempty / segments; a tag cannot be numeric only.");
  }
  return text;
}

export function validateManualIntent(intent: ManualTagIntent): { action: "rename" | "merge"; sourceTags: string[]; targetTag: string; scope: TagScope } {
  if (intent.kind !== "rename" && intent.kind !== "merge") throw new Error("Only rename and merge are supported.");
  const targetTag = validateTagText(intent.target);
  const sourceTags = [...new Set((intent.kind === "rename" ? [intent.source] : intent.sources).map(validateTagText).map(normalizeTag))]
    .filter((tag) => tag !== normalizeTag(targetTag));
  if (!sourceTags.length) throw new Error("Choose a target with a different tag identity. Case-only renaming is not supported.");
  return { action: intent.kind, sourceTags, targetTag, scope: normalizeScope(intent.scope) };
}
