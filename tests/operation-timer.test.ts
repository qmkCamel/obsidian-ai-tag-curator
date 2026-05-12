// Verifies dev timing reports include total and per-stage durations.
import { describe, expect, it } from "vitest";
import { OperationTimer } from "../src/utils/OperationTimer";

describe("OperationTimer", () => {
  it("records total timing and each stage timing", () => {
    const dates = [
      new Date("2026-05-12T00:00:00.000Z"),
      new Date("2026-05-12T00:00:01.000Z"),
      new Date("2026-05-12T00:00:03.500Z"),
      new Date("2026-05-12T00:00:05.000Z")
    ];
    const timer = new OperationTimer(() => dates.shift() ?? new Date("2026-05-12T00:00:05.000Z"));

    timer.startStage("read-current-note");
    timer.endStage("read-current-note");
    const report = timer.finish();

    expect(report.startedAt).toBe("2026-05-12T00:00:00.000Z");
    expect(report.endedAt).toBe("2026-05-12T00:00:05.000Z");
    expect(report.durationMs).toBe(5000);
    expect(report.stages).toEqual([
      {
        name: "read-current-note",
        startedAt: "2026-05-12T00:00:01.000Z",
        endedAt: "2026-05-12T00:00:03.500Z",
        durationMs: 2500
      }
    ]);
  });
});
