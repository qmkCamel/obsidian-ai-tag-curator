// Small formatting helpers for clickable tags in the health report.
export function formatTagClipboardText(tag: string): string {
  return `#${tag}`;
}

export function formatTagSearchQuery(tag: string): string {
  return `tag:#${tag}`;
}
