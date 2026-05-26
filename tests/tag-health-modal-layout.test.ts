// Protects the health report modal from resizing as evidence tabs change content length.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tag health report modal layout", () => {
  it("keeps the modal height stable while the report body scrolls", () => {
    const css = readFileSync("styles.css", "utf8");
    const modalRule = cssRule(css, ".tag-curator-health-modal");
    const contentRule = cssRule(css, ".tag-curator-health-modal .modal-content");

    expect(modalRule).toContain("display: flex;");
    expect(modalRule).toContain("flex-direction: column;");
    expect(modalRule).toContain("height: min(760px, calc(100vh - 80px));");
    expect(contentRule).toContain("flex: 1 1 auto;");
    expect(contentRule).toContain("min-height: 0;");
    expect(contentRule).toContain("overflow-y: auto;");
  });
});

function cssRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`));

  expect(match?.groups?.body, `Expected CSS rule for ${selector}`).toBeDefined();
  return match?.groups?.body ?? "";
}
