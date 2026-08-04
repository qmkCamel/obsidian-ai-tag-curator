import { describe, expect, it } from "vitest";
import { hashContent } from "../src/utils/hashContent";

describe("hashContent", () => {
  it("returns stable lowercase SHA-256 for the exact UTF-8 Markdown", async () => {
    await expect(hashContent("你好\n#标签")).resolves.toBe(
      "0d85211b99146e7e1d11e3ffd77b16a19f9a1574701951d288f1be94c30c710c"
    );
    await expect(hashContent("你好\n#标签")).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when any source content changes", async () => {
    expect(await hashContent("body\n")).not.toBe(await hashContent("body"));
  });
});
