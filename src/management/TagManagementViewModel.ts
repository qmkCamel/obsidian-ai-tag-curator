import type { TagIndex, TagSource } from "../index/TagIndex";
import { normalizeTag } from "../utils/normalizeTag";

export const TAG_MANAGEMENT_PAGE_SIZE = 100;
export const TAG_MANAGEMENT_FILE_PAGE_SIZE = 50;

/** Structurally compatible with TagScope; omitted scope means the entire vault. */
export interface TagManagementScope {
  include: ReadonlyArray<{ path: string; recursive: boolean }>;
}

export interface TagManagementPathFilter {
  scope?: TagManagementScope;
  excludedFolders?: readonly string[];
  /** Exact optional file allowlist, intersected with scope and exclusions. */
  paths?: readonly string[];
}

export type TagManagementSort = "fileCount" | "tag" | "frontmatterFileCount" | "inlineFileCount";

export interface TagManagementQuery extends TagManagementPathFilter {
  search?: string;
  source?: "all" | TagSource;
  sort?: TagManagementSort;
  direction?: "asc" | "desc";
  /** One-based; out-of-range pages clamp to the last page. */
  page?: number;
  pageSize?: number;
}

export interface TagManagementFile {
  path: string;
  sources: TagSource[];
}

export interface TagManagementRow {
  tagKey: string;
  tagText: string;
  fileCount: number;
  frontmatterFileCount: number;
  inlineFileCount: number;
  metadataFileCount: number;
  hasChildren: boolean;
}

export interface TagManagementPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface TagManagementProjection extends TagManagementPage<TagManagementRow> {
  /** Distinguishes no cache from an empty cache or an empty filtered result. */
  hasIndex: boolean;
  totalTags: number;
}

interface ScopedTag extends TagManagementRow {
  files: TagManagementFile[];
}

/** Pure entry point; callers doing repeated queries should retain a view model. */
export function buildTagManagementViewModel(index: TagIndex | null | undefined, query: TagManagementQuery = {}): TagManagementProjection {
  return new TagManagementViewModel(index).query(query);
}

/** Read-only projection. Cache lifetime is the immutable index plus explicit revision.
 * This is browsing evidence, never a source selection or mutation authorization.
 */
export class TagManagementViewModel {
  private index: TagIndex | null;
  private revision: number;
  private scopeKey: string | null = null;
  private scoped: ScopedTag[] = [];
  private sorted = new Map<string, ScopedTag[]>();

  constructor(index: TagIndex | null | undefined = null, revision = 0) {
    this.index = index ?? null;
    this.revision = revision;
  }

  setIndex(index: TagIndex | null | undefined, revision = 0): void {
    index ??= null;
    if (this.index === index && this.revision === revision) return;
    this.index = index;
    this.revision = revision;
    this.scopeKey = null;
    this.sorted.clear();
  }

  query(query: TagManagementQuery = {}): TagManagementProjection {
    this.ensureScope(query);
    const sort = query.sort ?? "fileCount";
    const direction = query.direction ?? (sort === "tag" ? "asc" : "desc");
    const sortKey = `${sort}:${direction}`;
    let rows = this.sorted.get(sortKey);
    if (!rows) {
      rows = [...this.scoped].sort((a, b) => {
        const primary = sort === "tag" ? compareText(a.tagKey, b.tagKey) : a[sort] - b[sort];
        return (direction === "asc" ? primary : -primary) || compareText(a.tagKey, b.tagKey);
      });
      this.sorted.set(sortKey, rows);
    }
    // Do not normalizeTag(search): spaces/slashes/punctuation remain literal substrings.
    const search = (query.search ?? "").trim().toLowerCase();
    const filtered = rows.filter((row) => (!search || row.tagKey.includes(search) || row.tagText.toLowerCase().includes(search))
      && (!query.source || query.source === "all" || row.files.some((file) => file.sources.includes(query.source as TagSource))));
    const page = paginate(filtered, query.page, query.pageSize, TAG_MANAGEMENT_PAGE_SIZE);
    return { ...page, items: page.items.map(({ files: _files, ...row }) => row), hasIndex: this.index !== null, totalTags: this.scoped.length };
  }

  /** Exact identity only; a source browse filter never strips other source evidence. */
  getRelatedFiles(tag: string, query: TagManagementPathFilter & { page?: number; pageSize?: number } = {}): TagManagementPage<TagManagementFile> {
    this.ensureScope(query);
    const files = this.scoped.find((row) => row.tagKey === normalizeTag(tag))?.files ?? [];
    const page = paginate(files, query.page, query.pageSize, TAG_MANAGEMENT_FILE_PAGE_SIZE);
    return { ...page, items: page.items.map((file) => ({ ...file, sources: [...file.sources] })) };
  }

  private ensureScope(filter: TagManagementPathFilter): void {
    const key = JSON.stringify([filter.scope?.include ?? null, filter.excludedFolders ?? [], filter.paths ?? null]);
    if (key === this.scopeKey) return;
    const matches = pathMatcher(filter);
    const tags = new Map<string, { tagText: string; files: Map<string, Set<TagSource>> }>();
    for (const usage of Object.values(this.index?.tags ?? {})) {
      const tagKey = normalizeTag(usage.normalized || usage.tag);
      if (!tagKey) continue;
      for (const file of usage.files) {
        if (!matches(file.path)) continue;
        let tag = tags.get(tagKey);
        if (!tag) { tag = { tagText: usage.tag, files: new Map() }; tags.set(tagKey, tag); }
        if (compareText(usage.tag, tag.tagText) < 0) tag.tagText = usage.tag;
        let sources = tag.files.get(file.path);
        if (!sources) { sources = new Set(); tag.files.set(file.path, sources); }
        for (const source of file.sources) sources.add(source);
      }
    }
    const parents = new Set<string>();
    for (const tagKey of tags.keys()) {
      const parts = tagKey.split("/");
      for (let depth = 1; depth < parts.length; depth += 1) parents.add(parts.slice(0, depth).join("/"));
    }
    this.scoped = [...tags].map(([tagKey, tag]) => {
      const files = [...tag.files].map(([path, sources]) => ({ path, sources: SOURCE_ORDER.filter((source) => sources.has(source)) }))
        .sort((a, b) => compareText(a.path, b.path));
      return { tagKey, tagText: tag.tagText, files, fileCount: files.length,
        frontmatterFileCount: files.filter((file) => file.sources.includes("frontmatter")).length,
        inlineFileCount: files.filter((file) => file.sources.includes("inline")).length,
        metadataFileCount: files.filter((file) => file.sources.includes("metadata")).length,
        hasChildren: parents.has(tagKey) };
    });
    this.scopeKey = key;
    this.sorted.clear();
  }
}

const SOURCE_ORDER: TagSource[] = ["frontmatter", "inline", "metadata"];

function pathMatcher(filter: TagManagementPathFilter): (path: string) => boolean {
  const include = filter.scope?.include;
  const excluded = filter.excludedFolders ?? [];
  for (const entry of include ?? []) validatePath(entry.path, true);
  for (const folder of excluded) validatePath(folder, true);
  for (const path of filter.paths ?? []) validatePath(path, false);
  const paths = filter.paths === undefined ? null : new Set(filter.paths);
  return (path) => {
    const separator = path.lastIndexOf("/");
    const parent = separator < 0 ? "" : path.slice(0, separator);
    return (!paths || paths.has(path)) && !excluded.some((folder) => folder === "" || parent === folder || parent.startsWith(`${folder}/`))
      && (include === undefined || include.some((folder) => parent === folder.path
        || (folder.recursive && (folder.path === "" || parent.startsWith(`${folder.path}/`)))));
  };
}

function validatePath(path: string, rootAllowed: boolean): void {
  if (rootAllowed && path === "") return;
  if (!path || /[\\\u0000]/.test(path) || /^[A-Za-z]:/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Expected a normalized vault-relative path");
  }
}

function paginate<T>(items: T[], requestedPage: number | undefined, requestedSize: number | undefined, limit: number): TagManagementPage<T> {
  const pageSize = Math.min(limit, positiveInteger(requestedSize, limit));
  const pageCount = Math.ceil(items.length / pageSize);
  const page = Math.min(Math.max(1, pageCount), positiveInteger(requestedPage, 1));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, pageCount };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
