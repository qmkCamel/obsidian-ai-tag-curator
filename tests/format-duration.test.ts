import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/utils/formatDuration";

describe("formatDuration", () => {
  it("uses milliseconds up to one second and seconds above one second", () => {
    expect(formatDuration(999)).toBe("999ms");
    expect(formatDuration(1000)).toBe("1000ms");
    expect(formatDuration(1001)).toBe("1s");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(12345)).toBe("12.35s");
  });
});
