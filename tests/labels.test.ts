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
    expect(labels.commands.analyzeTagHealth).toBe("分析标签健康度");
    expect(labels.commands.refreshTagIndex).not.toContain("/");
    expect(labels.recommendations.subtitle).toContain("相关性");
    expect(labels.recommendations.alternativesTitle).toBe("相近但未选");
    expect(labels.recommendations.typeLabel("existing")).toBe("已有标签");
    expect(labels.recommendations.confidenceLabel("high")).toBe("高置信度");
    expect(labels.settings.strictnessStrict).toBe("严格");
    expect(labels.settings.strictnessBalanced).toBe("平衡");
    expect(labels.settings.strictnessExploratory).toBe("探索");
    expect(labels.loading.suggestMessage).not.toContain("provider");
    expect(labels.loading.refreshMessage).not.toContain("vault");
    expect(labels.loading.suggestMessage).not.toContain("vault");
    expect(labels.settings.allowNewTagsDesc).not.toContain("vault");
    expect(labels.settings.refreshIndexOnLoadDesc).not.toContain("vault");
    expect(labels.loading.minimize).toBe("最小化");
    expect(labels.loading.expand).toBe("展开");
    expect(labels.notices.suggestStarted).toBe("正在后台生成标签推荐，完成后会弹出结果。");
    expect(labels.health.title).toBe("标签健康报告");
    expect(labels.health.sections.lowFrequency).toBe("低频标签");
    expect(labels.health.clickTagAction("经济基础")).toBe("复制 #经济基础 并搜索");
    expect(labels.health.tagActionDone("经济基础")).toBe("已复制 #经济基础 并打开搜索。");
    expect(labels.health.ai.enhanceButton).toBe("AI 增强分析");
    expect(labels.health.ai.severity.high).toBe("高优先级");
    expect(labels.health.ai.stageTiming.prepareAiHealthContext).toBe("准备 AI 健康分析上下文");
    expect(labels.health.ai.stageTiming.requestAiHealthAnalysis).toBe("请求 AI 健康分析");
    expect(labels.health.emptyIssueDetails.nearDuplicates).toContain("#AI");
  });

  it("returns English-only command labels for en", () => {
    const labels = getLabels("en");

    expect(labels.commands.refreshTagIndex).toBe("Refresh vault tag index");
    expect(labels.commands.analyzeTagHealth).toBe("Analyze tag health");
    expect(labels.commands.refreshTagIndex).not.toContain("刷新");
    expect(labels.recommendations.subtitle).toContain("relevance");
    expect(labels.recommendations.alternativesTitle).toBe("Close alternatives not selected");
    expect(labels.recommendations.typeLabel("existing")).toBe("Existing tag");
    expect(labels.recommendations.confidenceLabel("high")).toBe("High confidence");
    expect(labels.settings.strictnessStrict).toBe("Strict");
    expect(labels.settings.strictnessBalanced).toBe("Balanced");
    expect(labels.settings.strictnessExploratory).toBe("Exploratory");
    expect(labels.loading.minimize).toBe("Minimize");
    expect(labels.loading.expand).toBe("Expand");
    expect(labels.notices.suggestStarted).toBe("Generating tag recommendations in the background. Results will open when ready.");
    expect(labels.health.title).toBe("Tag health report");
    expect(labels.health.sections.lowFrequency).toBe("Low-frequency tags");
    expect(labels.health.clickTagAction("economics")).toBe("Copy and search #economics");
    expect(labels.health.tagActionDone("economics")).toBe("Copied #economics and opened search.");
    expect(labels.health.ai.enhanceButton).toBe("Enhance with AI");
    expect(labels.health.ai.severity.high).toBe("High priority");
    expect(labels.health.ai.stageTiming.prepareAiHealthContext).toBe("Prepare AI health context");
    expect(labels.health.ai.stageTiming.requestAiHealthAnalysis).toBe("Request AI health analysis");
    expect(labels.health.emptyIssueDetails.nearDuplicates).toContain("#AI");
  });
});
