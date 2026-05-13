import { describe, expect, it } from "vitest";
import { formatTagClipboardText, formatTagSearchQuery } from "../src/preview/TagHealthTagActions";

describe("tag health tag actions", () => {
  it("formats clicked tags for clipboard and Obsidian search", () => {
    expect(formatTagClipboardText("经济基础")).toBe("#经济基础");
    expect(formatTagSearchQuery("经济基础")).toBe("tag:#经济基础");
  });
});
