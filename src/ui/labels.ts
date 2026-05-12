// Centralizes localized UI copy and resolves the active plugin language.
import type { RecommendationConfidence, RecommendationType } from "../ai/RecommendationSchema";

export type UiLanguage = "zh-CN" | "en";
export type UiLanguagePreference = "auto" | UiLanguage;

type LabelTree = {
  commands: {
    refreshTagIndex: string;
    showTagIndexSummary: string;
    suggestTagsForCurrentNote: string;
    undoLastChangeForCurrentNote: string;
  };
  loading: {
    refreshTitle: string;
    refreshMessage: string;
    suggestTitle: string;
    suggestMessage: string;
  };
  notices: {
    indexed: (count: number) => string;
    refreshFailed: string;
    noTagIndex: string;
    openMarkdownForSuggest: string;
    configureApiKey: string;
    noRecommendations: string;
    suggestFailed: string;
    openMarkdownForUndo: string;
    noUndoRecord: string;
    noteMissing: string;
    undoComplete: string;
    undoFailed: string;
    tagsUpdated: string;
    updateFailed: string;
    languageChanged: string;
  };
  settings: {
    heading: string;
    languageName: string;
    languageDesc: string;
    languageAuto: string;
    languageZh: string;
    languageEn: string;
    apiBaseUrlName: string;
    apiBaseUrlDesc: string;
    apiKeyName: string;
    apiKeyDesc: string;
    modelName: string;
    modelDesc: string;
    maxRecommendationsName: string;
    maxRecommendationsDesc: string;
    allowNewTagsName: string;
    allowNewTagsDesc: string;
    newTagStrictnessName: string;
    newTagStrictnessDesc: string;
    readInlineTagsName: string;
    readInlineTagsDesc: string;
    refreshIndexOnLoadName: string;
    refreshIndexOnLoadDesc: string;
  };
  summary: {
    title: string;
    lastRefreshed: (value: string) => string;
    tags: (count: number) => string;
    usages: (count: number) => string;
    files: (count: number) => string;
    hierarchical: (count: number) => string;
    topTags: string;
    topTagItem: (tag: string, count: number, fileCount: number) => string;
  };
  recommendations: {
    title: string;
    subtitle: string;
    candidateLabel: (index: number) => string;
    reasonTitle: string;
    alternativesTitle: string;
    typeLabel: (type: RecommendationType) => string;
    confidenceLabel: (confidence: RecommendationConfidence) => string;
    apply: string;
    alternative: (tag: string, reason: string) => string;
  };
};

const ZH_LABELS: LabelTree = {
  commands: {
    refreshTagIndex: "刷新标签索引",
    showTagIndexSummary: "查看标签索引摘要",
    suggestTagsForCurrentNote: "为当前笔记推荐标签",
    undoLastChangeForCurrentNote: "撤销当前笔记最近标签修改"
  },
  loading: {
    refreshTitle: "正在刷新标签索引",
    refreshMessage: "正在扫描 Markdown 笔记并统计 vault 标签用法。",
    suggestTitle: "正在生成标签推荐",
    suggestMessage: "正在读取 vault 上下文并请求 AI provider 返回结构化建议。"
  },
  notices: {
    indexed: (count) => `已索引 ${count} 个标签。`,
    refreshFailed: "刷新标签索引失败。",
    noTagIndex: "还没有标签索引，请先运行“刷新标签索引”。",
    openMarkdownForSuggest: "请先打开一篇 Markdown 笔记再请求标签推荐。",
    configureApiKey: "请先在 AI Tag Curator 设置中配置 API key。",
    noRecommendations: "没有返回标签推荐。",
    suggestFailed: "标签推荐失败。",
    openMarkdownForUndo: "请先打开一篇 Markdown 笔记再撤销标签修改。",
    noUndoRecord: "当前笔记没有可撤销的标签修改。",
    noteMissing: "该操作对应的笔记已不存在。",
    undoComplete: "已撤销最近一次标签修改。",
    undoFailed: "撤销标签修改失败。",
    tagsUpdated: "标签已更新。",
    updateFailed: "更新标签失败。",
    languageChanged: "语言设置已保存。命令面板名称会在重载插件后更新。"
  },
  settings: {
    heading: "AI Tag Curator 设置",
    languageName: "界面语言",
    languageDesc: "选择插件 UI 语言。Auto 会跟随 Obsidian 当前语言。",
    languageAuto: "Auto（跟随 Obsidian）",
    languageZh: "简体中文",
    languageEn: "English",
    apiBaseUrlName: "API base URL",
    apiBaseUrlDesc: "OpenAI-compatible endpoint，例如 https://api.deepseek.com 或 https://api.openai.com/v1。",
    apiKeyName: "API key",
    apiKeyDesc: "保存在本地 Obsidian 插件数据中。",
    modelName: "Model",
    modelDesc: "OpenAI-compatible provider 的模型名，例如 deepseek-v4-flash。",
    maxRecommendationsName: "推荐数量上限",
    maxRecommendationsDesc: "预览中最多展示多少个标签。",
    allowNewTagsName: "允许新标签",
    allowNewTagsDesc: "关闭时，推荐必须复用已有 vault 标签。",
    newTagStrictnessName: "新标签严格程度",
    newTagStrictnessDesc: "控制模型建议新标签时应有多保守。",
    readInlineTagsName: "读取 inline tags",
    readInlineTagsDesc: "构建索引时包含正文里的标签。",
    refreshIndexOnLoadName: "启动时刷新索引",
    refreshIndexOnLoadDesc: "默认关闭，避免大 vault 启动时扫描过慢。"
  },
  summary: {
    title: "标签索引摘要",
    lastRefreshed: (value) => `最近刷新：${value}`,
    tags: (count) => `标签数：${count}`,
    usages: (count) => `标签使用次数：${count}`,
    files: (count) => `有标签的文件数：${count}`,
    hierarchical: (count) => `层级标签数：${count}`,
    topTags: "高频标签",
    topTagItem: (tag, count, fileCount) => `#${tag} · ${count} 次使用 · ${fileCount} 个文件`
  },
  recommendations: {
    title: "标签推荐",
    subtitle: "以下是按相关性排序的候选标签。每一项都是独立建议，“相近但未选”只是说明为什么没有选择另一个相似标签。",
    candidateLabel: (index) => `候选 ${index}`,
    reasonTitle: "推荐理由",
    alternativesTitle: "相近但未选",
    typeLabel: (type) => (type === "existing" ? "已有标签" : "新标签"),
    confidenceLabel: (confidence) =>
      ({
        high: "高置信度",
        medium: "中置信度",
        low: "低置信度"
      })[confidence],
    apply: "应用选中标签",
    alternative: (tag, reason) => `#${tag}：${reason}`
  }
};

const EN_LABELS: LabelTree = {
  commands: {
    refreshTagIndex: "Refresh vault tag index",
    showTagIndexSummary: "Show tag index summary",
    suggestTagsForCurrentNote: "Suggest tags for current note",
    undoLastChangeForCurrentNote: "Undo last tag curator change"
  },
  loading: {
    refreshTitle: "Refreshing tag index",
    refreshMessage: "Scanning Markdown notes and collecting vault tag usage.",
    suggestTitle: "Generating tag recommendations",
    suggestMessage: "Scanning vault context and asking the AI provider for structured suggestions."
  },
  notices: {
    indexed: (count) => `Indexed ${count} tags.`,
    refreshFailed: "Failed to refresh tag index.",
    noTagIndex: "No tag index yet. Run Refresh vault tag index first.",
    openMarkdownForSuggest: "Open a Markdown note before requesting tag suggestions.",
    configureApiKey: "Configure an API key in AI Tag Curator settings first.",
    noRecommendations: "No tag recommendations returned.",
    suggestFailed: "Failed to suggest tags.",
    openMarkdownForUndo: "Open a Markdown note before undoing a tag change.",
    noUndoRecord: "No tag curator change found for this note.",
    noteMissing: "The note for this operation no longer exists.",
    undoComplete: "Last tag curator change undone.",
    undoFailed: "Failed to undo tag change.",
    tagsUpdated: "Tags updated.",
    updateFailed: "Failed to update tags.",
    languageChanged: "Language setting saved. Command palette names update after reloading the plugin."
  },
  settings: {
    heading: "AI Tag Curator Settings",
    languageName: "Interface language",
    languageDesc: "Choose the plugin UI language. Auto follows the current Obsidian language.",
    languageAuto: "Auto (follow Obsidian)",
    languageZh: "简体中文",
    languageEn: "English",
    apiBaseUrlName: "API base URL",
    apiBaseUrlDesc: "OpenAI-compatible endpoint, for example https://api.deepseek.com or https://api.openai.com/v1.",
    apiKeyName: "API key",
    apiKeyDesc: "Stored locally in Obsidian plugin data.",
    modelName: "Model",
    modelDesc: "Model name for your OpenAI-compatible provider, for example deepseek-v4-flash.",
    maxRecommendationsName: "Maximum recommendations",
    maxRecommendationsDesc: "Upper bound for tags shown in the preview.",
    allowNewTagsName: "Allow new tags",
    allowNewTagsDesc: "When off, recommendations must reuse existing vault tags.",
    newTagStrictnessName: "New tag strictness",
    newTagStrictnessDesc: "Controls how reluctant the model should be when suggesting new tags.",
    readInlineTagsName: "Read inline tags",
    readInlineTagsDesc: "Include tags from note bodies when building the vault tag index.",
    refreshIndexOnLoadName: "Refresh index on load",
    refreshIndexOnLoadDesc: "Off by default to avoid scanning large vaults during startup."
  },
  summary: {
    title: "Tag index summary",
    lastRefreshed: (value) => `Last refreshed: ${value}`,
    tags: (count) => `Tags: ${count}`,
    usages: (count) => `Tag usages: ${count}`,
    files: (count) => `Files with tags: ${count}`,
    hierarchical: (count) => `Hierarchical tags: ${count}`,
    topTags: "Top tags",
    topTagItem: (tag, count, fileCount) => `#${tag} · ${count} usages · ${fileCount} files`
  },
  recommendations: {
    title: "Tag recommendations",
    subtitle:
      "These candidates are ordered by relevance. Each item is an independent suggestion; close alternatives explain why a similar tag was not selected.",
    candidateLabel: (index) => `Candidate ${index}`,
    reasonTitle: "Why this tag",
    alternativesTitle: "Close alternatives not selected",
    typeLabel: (type) => (type === "existing" ? "Existing tag" : "New tag"),
    confidenceLabel: (confidence) =>
      ({
        high: "High confidence",
        medium: "Medium confidence",
        low: "Low confidence"
      })[confidence],
    apply: "Apply selected tags",
    alternative: (tag, reason) => `#${tag}: ${reason}`
  }
};

export function resolveUiLanguage(preference: UiLanguagePreference, appLanguage: string): UiLanguage {
  if (preference !== "auto") {
    return preference;
  }

  return appLanguage.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function getLabels(language: UiLanguage): LabelTree {
  return language === "zh-CN" ? ZH_LABELS : EN_LABELS;
}
