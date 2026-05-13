// Locks AI health status badges to the same visual foundation as recommendation badges.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatHealthAiBadgeClass } from "../src/preview/HealthAiBadgeClasses";

describe("formatHealthAiBadgeClass", () => {
  it("uses the shared recommendation badge base style", () => {
    expect(formatHealthAiBadgeClass("priority", "medium")).toBe(
      "tag-curator-recommendation__badge tag-curator-health-ai__badge tag-curator-health-ai__badge--priority-medium"
    );
    expect(formatHealthAiBadgeClass("confidence", "high")).toBe(
      "tag-curator-recommendation__badge tag-curator-recommendation__badge--high tag-curator-health-ai__badge tag-curator-health-ai__badge--confidence-high"
    );
  });

  it("stacks status badges above health tags", () => {
    const css = readFileSync("styles.css", "utf8");
    const source = readFileSync("src/preview/TagHealthReportModal.ts", "utf8");

    expect(source).toContain('item.createDiv({ cls: "tag-curator-health-ai__status-row" })');
    expect(source).toContain('item.createDiv({ cls: "tag-curator-health-ai__tag-row" })');
    expect(source.indexOf("tag-curator-health-ai__status-row")).toBeLessThan(
      source.indexOf("tag-curator-health-ai__tag-row")
    );
    expect(css).toContain(".tag-curator-health-ai__status-row,");
    expect(css).toContain(".tag-curator-health-ai__tag-row");
  });
});
