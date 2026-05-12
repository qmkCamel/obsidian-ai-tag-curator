// Verifies UI copy resolves to one language instead of persistent bilingual labels.
import { describe, expect, it } from "vitest";
import { getLabels, resolveUiLanguage } from "../src/ui/labels";

describe("resolveUiLanguage", () => {
  it("follows Obsidian language when the preference is auto", () => {
    expect(resolveUiLanguage("auto", "zh")).toBe("zh-CN");
    expect(resolveUiLanguage("auto", "zh-TW")).toBe("zh-CN");
    expect(resolveUiLanguage("auto", "en")).toBe("en");
    expect(resolveUiLanguage("auto", "fr")).toBe("en");
  });

  it("uses the explicit language preference when set", () => {
    expect(resolveUiLanguage("zh-CN", "en")).toBe("zh-CN");
    expect(resolveUiLanguage("en", "zh")).toBe("en");
  });
});

describe("getLabels", () => {
  it("returns Chinese-only command labels for zh-CN", () => {
    const labels = getLabels("zh-CN");

    expect(labels.commands.refreshTagIndex).toBe("刷新标签索引");
    expect(labels.commands.refreshTagIndex).not.toContain("/");
    expect(labels.recommendations.subtitle).toContain("相关性");
    expect(labels.recommendations.alternativesTitle).toBe("相近但未选");
    expect(labels.recommendations.typeLabel("existing")).toBe("已有标签");
    expect(labels.recommendations.confidenceLabel("high")).toBe("高置信度");
  });

  it("returns English-only command labels for en", () => {
    const labels = getLabels("en");

    expect(labels.commands.refreshTagIndex).toBe("Refresh vault tag index");
    expect(labels.commands.refreshTagIndex).not.toContain("刷新");
    expect(labels.recommendations.subtitle).toContain("relevance");
    expect(labels.recommendations.alternativesTitle).toBe("Close alternatives not selected");
    expect(labels.recommendations.typeLabel("existing")).toBe("Existing tag");
    expect(labels.recommendations.confidenceLabel("high")).toBe("High confidence");
  });
});
