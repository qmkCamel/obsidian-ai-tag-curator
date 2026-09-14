export interface TagScope {
  include: Array<{ path: string; recursive: boolean }>;
}

export function defaultTagScope(): TagScope {
  return { include: [{ path: "", recursive: true }] };
}

export function normalizeScopePath(value: string): string {
  const trimmed = value.trim();
  const path = trimmed.replace(/\/+$/, "");
  if (trimmed.startsWith("/") || /[\\\u0000-\u001f]/.test(path) || /^[a-z]:/i.test(path) || path.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Invalid vault-relative folder path.");
  }
  if (path.includes("//")) throw new Error("Invalid folder path.");
  return path;
}

export function normalizeScope(value: unknown): TagScope {
  if (value === undefined || value === null) return defaultTagScope();
  if (typeof value !== "object" || !("include" in value) || !Array.isArray(value.include) || value.include.length === 0) {
    throw new Error("At least one included folder is required.");
  }
  const include: TagScope["include"] = [];
  for (const entry of value.include) {
    if (!entry || typeof entry.path !== "string" || typeof entry.recursive !== "boolean") throw new Error("Invalid folder scope.");
    const path = normalizeScopePath(entry.path);
    if (!include.some((item) => item.path === path && item.recursive === entry.recursive)) include.push({ path, recursive: entry.recursive });
  }
  return { include };
}

export function pathInFolder(path: string, folder: string, recursive = true): boolean {
  const slash = path.lastIndexOf("/");
  const parent = slash === -1 ? "" : path.slice(0, slash);
  return parent === folder || (recursive && (folder === "" || parent.startsWith(`${folder}/`)));
}

export function pathInScope(path: string, scope: TagScope): boolean {
  return scope.include.some((entry) => pathInFolder(path, entry.path, entry.recursive));
}
