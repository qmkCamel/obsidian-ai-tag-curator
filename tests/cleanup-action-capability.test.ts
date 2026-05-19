import { describe, expect, it } from "vitest";
import { resolveCleanupActionCapability } from "../src/cleanup/CleanupActionCapability";

describe("resolveCleanupActionCapability", () => {
  it("maps deterministic merge and rename suggestions to executable capabilities", () => {
    expect(resolveCleanupActionCapability("nearDuplicates", "merge")).toMatchObject({
      kind: "mergeTags",
      availability: "executable",
      requiresFilePreview: true,
      requiresTargetTag: true
    });
    expect(resolveCleanupActionCapability("namingDrift", "rename")).toMatchObject({
      kind: "renameTag",
      availability: "executable",
      requiresFilePreview: true,
      requiresTargetTag: true
    });
  });

  it("keeps observation and destructive suggestions non-executable", () => {
    expect(resolveCleanupActionCapability("lowFrequency", "observe")).toMatchObject({
      kind: "observeOnly",
      availability: "observeOnly",
      riskLevel: "low"
    });
    expect(resolveCleanupActionCapability("overNarrow", "deprecate")).toMatchObject({
      kind: "removeTag",
      availability: "manualReview",
      riskLevel: "high"
    });
    expect(resolveCleanupActionCapability("overBroad", "rename")).toMatchObject({
      kind: "splitBroadTag",
      availability: "manualReview",
      riskLevel: "high"
    });
  });

  it("does not mark observation or manual-review actions executable", () => {
    const capabilities = [resolveCleanupActionCapability("lowFrequency", "observe"), resolveCleanupActionCapability("overNarrow", "deprecate"), resolveCleanupActionCapability("overBroad", "rename")];

    expect(capabilities.map((capability) => capability.availability)).not.toContain("executable");
  });
});
