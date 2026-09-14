import { getFrontMatterInfo, parseYaml, stringifyYaml } from "obsidian";
import { normalizeTag } from "../utils/normalizeTag";
import { parseFrontmatterTags } from "./TagParser";

export type TagValueSnapshot =
  | { kind: "absent" }
  | { kind: "list"; values: string[] }
  | { kind: "scalar"; value: string };

export interface TagValuePatch {
  before: TagValueSnapshot;
  after: TagValueSnapshot;
}

export interface TagValueFields {
  tagValueVersion?: 1;
  tagValuePatch?: TagValuePatch;
}

export class UnsafeTagValueError extends Error {
  constructor(message = "Frontmatter cannot be safely round-tripped; this note is read-only.") {
    super(message);
    this.name = "UnsafeTagValueError";
  }
}

export function cloneTagValueSnapshot(value: TagValueSnapshot): TagValueSnapshot {
  assertTagValueSnapshot(value);
  return value.kind === "list" ? { kind: "list", values: [...value.values] } : { ...value };
}

export function cloneTagValuePatch(patch: TagValuePatch): TagValuePatch {
  return { before: cloneTagValueSnapshot(patch.before), after: cloneTagValueSnapshot(patch.after) };
}

export function sameTagValue(left: TagValueSnapshot | undefined, right: TagValueSnapshot | undefined): boolean {
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === "absent") return true;
  if (left.kind === "scalar") return right.kind === "scalar" && left.value === right.value;
  return right.kind === "list" && left.values.length === right.values.length &&
    left.values.every((value, index) => value === right.values[index]);
}

export function rawTagValues(snapshot: TagValueSnapshot): string[] {
  return snapshot.kind === "list" ? [...snapshot.values] : snapshot.kind === "scalar" ? [snapshot.value] : [];
}

export function normalizedSnapshotTags(snapshot: TagValueSnapshot): string[] {
  return parseFrontmatterTags(snapshot.kind === "absent" ? undefined : snapshot.kind === "list" ? snapshot.values : snapshot.value);
}

export function assertWritableTagValue(snapshot: TagValueSnapshot): void {
  assertTagValueSnapshot(snapshot);
  if (snapshot.kind === "scalar") throw new UnsafeTagValueError("Scalar tags are read-only for new operations.");
}

export function validateTagLiteral(value: string): string {
  const literal = value.trim().replace(/^#/, "");
  if (!/^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(literal) || !/[^\p{N}/]/u.test(literal)) {
    throw new UnsafeTagValueError("A supported, non-numeric tag literal is required.");
  }
  return literal;
}

export function createAdditiveTagValuePatch(before: TagValueSnapshot, selectedTags: string[]): TagValuePatch {
  assertWritableTagValue(before);
  const values = rawTagValues(before);
  const keys = new Set(values.map(rawTagKey));
  for (const selected of selectedTags) {
    const literal = validateTagLiteral(selected);
    const key = normalizeTag(literal);
    if (!keys.has(key)) {
      values.push(literal);
      keys.add(key);
    }
  }
  return {
    before: cloneTagValueSnapshot(before),
    after: values.length === rawTagValues(before).length ? cloneTagValueSnapshot(before) : { kind: "list", values }
  };
}

export function createCleanupTagValuePatch(before: TagValueSnapshot, sourceTags: string[], targetTag: string): TagValuePatch {
  assertWritableTagValue(before);
  const target = validateTagLiteral(targetTag);
  const targetKey = normalizeTag(target);
  const sources = new Set(sourceTags.map(normalizeTag).filter(Boolean));
  sources.delete(targetKey);
  const original = rawTagValues(before);
  const hasTarget = original.some((tag) => rawTagKey(tag) === targetKey);
  let inserted = hasTarget;
  const values: string[] = [];
  for (const value of original) {
    if (!sources.has(rawTagKey(value))) {
      values.push(value);
    } else if (!inserted) {
      values.push(target);
      inserted = true;
    }
  }
  return { before: cloneTagValueSnapshot(before), after: before.kind === "absent" ? { kind: "absent" } : { kind: "list", values } };
}

function rawTagKey(value: string): string {
  try {
    return normalizeTag(validateTagLiteral(value));
  } catch {
    // Invalid existing literals must not become a different, writable identity via normalization.
    return "";
  }
}

/** Missing fields are legacy, never evidence from which to manufacture a raw snapshot. */
export function exactTagValuePatch(fields: object): TagValuePatch | undefined {
  const value = fields as TagValueFields;
  if (value.tagValueVersion === undefined && value.tagValuePatch === undefined) return undefined;
  if (value.tagValueVersion !== 1 || !value.tagValuePatch) throw new UnsafeTagValueError("Invalid exact tag value metadata.");
  assertTagValueSnapshot(value.tagValuePatch.before);
  assertTagValueSnapshot(value.tagValuePatch.after);
  return value.tagValuePatch;
}

export function tagValueFields(patch: TagValuePatch | undefined): TagValueFields {
  return patch ? { tagValueVersion: 1, tagValuePatch: cloneTagValuePatch(patch) } : {};
}

export function reverseTagValueFields(fields: object): TagValueFields {
  const patch = exactTagValuePatch(fields);
  return tagValueFields(patch && { before: patch.after, after: patch.before });
}

/** Reads Markdown, not metadataCache, and proves that non-tag YAML values survive the host codec. */
export function captureTagValueSnapshot(content: string): TagValueSnapshot {
  return snapshotFromRecord(readSafeFrontmatter(content).record);
}

export function applyTagValuePatch(content: string, patch: TagValuePatch): string {
  assertTagValueSnapshot(patch.before);
  assertTagValueSnapshot(patch.after);
  const { record, body, prefix, hasFrontmatter } = readSafeFrontmatter(content);
  if (!sameTagValue(snapshotFromRecord(record), patch.before)) throw new UnsafeTagValueError("Raw tags changed since review.");
  if (sameTagValue(patch.before, patch.after)) return content;
  const next = { ...record };
  if (patch.after.kind === "absent") delete next.tags;
  else next.tags = patch.after.kind === "list" ? [...patch.after.values] : patch.after.value;
  const yaml = stringifyYaml(next);
  const decoded: unknown = parseYaml(yaml);
  assertPlainData(decoded);
  if (!semanticEqual(next, decoded)) throw new UnsafeTagValueError();
  const withoutTags = ({ tags: _tags, ...rest }: Record<string, unknown>) => rest;
  if (!semanticEqual(withoutTags(record), withoutTags(decoded as Record<string, unknown>))) throw new UnsafeTagValueError();
  const newline = hasFrontmatter && prefix.includes("\r\n") ? "\r\n" : "\n";
  const serialized = yaml.replace(/\r?\n/g, newline);
  const bom = content.startsWith("\uFEFF") ? "\uFEFF" : "";
  const output = `${bom}---${newline}${serialized}${serialized.endsWith(newline) ? "" : newline}---${newline}${body}`;
  const outputInfo = getFrontMatterInfo(output);
  if (!outputInfo.exists || output.slice(outputInfo.contentStart) !== body ||
      !sameTagValue(captureTagValueSnapshot(output), patch.after)) throw new UnsafeTagValueError();
  return output;
}

function readSafeFrontmatter(content: string): { record: Record<string, unknown>; body: string; prefix: string; hasFrontmatter: boolean } {
  const info = getFrontMatterInfo(content);
  if (!info.exists) {
    const firstLine = content.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
    if (firstLine === "---") throw new UnsafeTagValueError("Unterminated frontmatter is read-only.");
    return { record: {}, body: content.startsWith("\uFEFF") ? content.slice(1) : content, prefix: "", hasFrontmatter: false };
  }
  const parsed: unknown = parseYaml(info.frontmatter);
  const record = parsed == null && !info.frontmatter.trim() ? {} : parsed;
  assertPlainData(record);
  if (!isPlainRecord(record)) throw new UnsafeTagValueError();
  const roundTrip: unknown = parseYaml(stringifyYaml(record));
  assertPlainData(roundTrip);
  if (!semanticEqual(record, roundTrip)) throw new UnsafeTagValueError();
  return { record, body: content.slice(info.contentStart), prefix: content.slice(0, info.contentStart), hasFrontmatter: true };
}

function snapshotFromRecord(record: Record<string, unknown>): TagValueSnapshot {
  if (!Object.prototype.hasOwnProperty.call(record, "tags")) return { kind: "absent" };
  if (typeof record.tags === "string") return { kind: "scalar", value: record.tags };
  if (Array.isArray(record.tags) && record.tags.every((tag) => typeof tag === "string")) return { kind: "list", values: [...record.tags] };
  throw new UnsafeTagValueError("Mixed or non-string tags are read-only for new operations.");
}

function assertTagValueSnapshot(value: TagValueSnapshot): void {
  if (!value || !(value.kind === "absent" || (value.kind === "scalar" && typeof value.value === "string") ||
      (value.kind === "list" && Array.isArray(value.values) && value.values.every((tag) => typeof tag === "string")))) {
    throw new UnsafeTagValueError("Invalid raw tag snapshot.");
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertPlainData(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return;
  if (!(Array.isArray(value) || isPlainRecord(value)) || ancestors.has(value)) throw new UnsafeTagValueError();
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype") throw new UnsafeTagValueError();
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !("value" in descriptor)) throw new UnsafeTagValueError();
    assertPlainData(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}

function semanticEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, index) => semanticEqual(value, right[index]));
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && semanticEqual(left[key], right[key]));
}
