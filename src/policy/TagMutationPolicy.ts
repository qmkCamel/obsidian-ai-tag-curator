import { normalizeTag } from "../utils/normalizeTag";
import { normalizeScopePath, pathInFolder } from "../management/TagScope";

export interface TagMutationPolicy {
  schemaVersion: 1;
  revision: number;
  excludedFolders: string[];
  protectedTags: Array<{ tag: string; mode: "exact" | "subtree" }>;
}

export function defaultTagPolicy(): TagMutationPolicy {
  return { schemaVersion: 1, revision: 0, excludedFolders: [], protectedTags: [] };
}

export function parsePolicy(value: unknown): TagMutationPolicy {
  if (value === undefined || value === null) return defaultTagPolicy();
  if (typeof value !== "object" || !("schemaVersion" in value) || value.schemaVersion !== 1) throw new Error("Unknown tag policy format. Writes are disabled.");
  const policy = value as TagMutationPolicy;
  if (!Number.isSafeInteger(policy.revision) || policy.revision < 0 || !Array.isArray(policy.excludedFolders) || !Array.isArray(policy.protectedTags)) {
    throw new Error("Invalid tag policy. Writes are disabled.");
  }
  const excludedFolders = [...new Set(policy.excludedFolders.map((path) => {
    if (typeof path !== "string") throw new Error("Invalid excluded folder.");
    return normalizeScopePath(path);
  }))];
  const protectedTags = policy.protectedTags.map((rule) => {
    if (!rule || typeof rule.tag !== "string" || (rule.mode !== "exact" && rule.mode !== "subtree")) throw new Error("Invalid protected tag rule.");
    const tag = rule.tag.trim().replace(/^#/, "");
    if (!tag || /[\s*#]/.test(tag) || tag.split("/").some((part) => !part)) throw new Error("Invalid protected tag. Use an exact tag or a subtree rule.");
    return { tag: normalizeTag(tag), mode: rule.mode };
  });
  return { schemaVersion: 1, revision: policy.revision, excludedFolders, protectedTags };
}

export function pathExcluded(path: string, policy: TagMutationPolicy): boolean {
  return policy.excludedFolders.some((folder) => pathInFolder(path, folder));
}

export function isProtectedTag(tag: string, policy: TagMutationPolicy): boolean {
  const key = normalizeTag(tag);
  return policy.protectedTags.some((rule) => key === rule.tag || (rule.mode === "subtree" && key.startsWith(`${rule.tag}/`)));
}

export function assertPathAllowed(path: string, policy: TagMutationPolicy): void {
  if (pathExcluded(path, policy)) throw new Error(`Excluded folder: ${path}`);
}

export function assertTagChangesAllowed(path: string, before: string[], after: string[], policy: TagMutationPolicy): void {
  assertPathAllowed(path, policy);
  const protectedBefore = before.filter((tag) => isProtectedTag(tag, policy));
  const protectedAfter = after.filter((tag) => isProtectedTag(tag, policy));
  if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)) throw new Error("Protected tags cannot be added, removed, renamed or normalized.");
}
