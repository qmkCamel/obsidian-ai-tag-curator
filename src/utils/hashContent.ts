// Produces a content-only snapshot fingerprint without persisting the source Markdown.
/** Hashes the exact UTF-8 Markdown string for stale-preview detection. */
export async function hashContent(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
