// Keeps AI health priority and confidence badges aligned with recommendation badge styling.
type BadgeKind = "priority" | "confidence";
type BadgeLevel = "high" | "medium" | "low";

export function formatHealthAiBadgeClass(kind: BadgeKind, level: BadgeLevel): string {
  const classes = ["tag-curator-recommendation__badge", "tag-curator-health-ai__badge"];

  if (kind === "confidence" && level === "high") {
    classes.splice(1, 0, "tag-curator-recommendation__badge--high");
  }

  classes.push(`tag-curator-health-ai__badge--${kind}-${level}`);
  return classes.join(" ");
}
