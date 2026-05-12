// Formats short diagnostics without losing millisecond precision for fast stages.
export function formatDuration(durationMs: number): string {
  if (durationMs <= 1000) {
    return `${durationMs}ms`;
  }

  const seconds = durationMs / 1000;
  return `${Number(seconds.toFixed(2))}s`;
}
