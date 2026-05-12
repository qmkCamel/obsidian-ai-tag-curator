// Normalizes tag strings for comparison while keeping write decisions explicit elsewhere.
export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#+/, "")
    .split("/")
    .map((part) => part.trim().replace(/\s+/g, "-").toLowerCase())
    .filter(Boolean)
    .join("/");
}

export function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
