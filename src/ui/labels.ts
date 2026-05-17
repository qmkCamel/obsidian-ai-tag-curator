// Centralizes localized UI copy and resolves the active plugin language.
import type { RecommendationConfidence, RecommendationType } from "../ai/RecommendationSchema";

export type UiLanguage = "zh-CN" | "en";
export type UiLanguagePreference = "auto" | UiLanguage;

type LabelTree = {
  commands: {
    refreshTagIndex: string;
    showTagIndexSummary: string;
    analyzeTagHealth: string;
    suggestTagsForCurrentNote: string;
    undoLastChangeForCurrentNote: string;
  };
  loading: {
    refreshTitle: string;
    refreshMessage: string;
    suggestTitle: string;
    suggestMessage: string;
    minimize: string;
    expand: string;
  };
  notices: {
    indexed: (count: number) => string;
    refreshFailed: string;
    noTagIndex: string;
    tagHealthStarted: string;
    openMarkdownForSuggest: string;
    configureApiKey: string;
    suggestStarted: string;
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
    strictnessStrict: string;
    strictnessBalanced: string;
    strictnessExploratory: string;
    readInlineTagsName: string;
    readInlineTagsDesc: string;
    refreshIndexOnLoadName: string;
    refreshIndexOnLoadDesc: string;
    devModeName: string;
    devModeDesc: string;
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
    devTimingTitle: string;
    totalTiming: string;
    stageTiming: {
      readCurrentNote: string;
      prepareTagIndex: string;
      requestAiRecommendations: string;
    };
    timingRow: (startedAt: string, endedAt: string, duration: string) => string;
  };
  health: {
    title: string;
    subtitle: string;
    generatedAt: (value: string) => string;
    indexUpdatedAt: (value: string) => string;
    summary: {
      totalTags: (count: number) => string;
      totalUsages: (count: number) => string;
      totalFiles: (count: number) => string;
      riskItems: (count: number) => string;
    };
    sections: {
      lowFrequency: string;
      nearDuplicates: string;
      hierarchyInconsistency: string;
      overBroad: string;
      overNarrow: string;
      namingDrift: string;
    };
    noIssues: string;
    emptyIssueDetails: {
      lowFrequency: string;
      nearDuplicates: string;
      hierarchyInconsistency: string;
      overBroad: string;
      overNarrow: string;
      namingDrift: string;
    };
    evidence: string;
    impact: string;
    suggestion: string;
    suggestions: {
      merge: string;
      rename: string;
      observe: string;
      deprecate: string;
    };
    clickTagAction: (tag: string) => string;
    tagActionDone: (tag: string) => string;
    tagActionFailed: string;
    cleanupPlan: {
      title: string;
      subtitle: string;
      empty: string;
      copyMarkdown: string;
      markdownCopied: string;
      action: string;
      executableSuggestion: string;
      status: string;
      pendingReview: string;
      appliedStatus: string;
      applyThisSuggestion: string;
      undoThisOperation: string;
      unsupportedWriteAction: string;
      notApplyReady: string;
      frontmatterOnlyWarning: string;
      noWritableChanges: string;
      noCleanupUndoRecord: string;
      cleanupApplied: (count: number) => string;
      cleanupUndone: string;
      targetTag: string;
      affectedFiles: (count: number) => string;
      filePreview: string;
      noTarget: string;
      before: string;
      after: string;
      actions: {
        merge: string;
        rename: string;
        observe: string;
        deprecate: string;
      };
    };
    ai: {
      enhanceButton: string;
      enhancing: string;
      title: string;
      summary: string;
      priorities: string;
      severity: {
        high: string;
        medium: string;
        low: string;
      };
      confidence: {
        high: string;
        medium: string;
        low: string;
      };
      stageTiming: {
        prepareAiHealthContext: string;
        requestAiHealthAnalysis: string;
      };
      targetTag: string;
      diagnosis: string;
      reason: string;
      riskNote: string;
    };
  };
};

const ZH_LABELS: LabelTree = {
  commands: {
    refreshTagIndex: "刷新标签索引",
    showTagIndexSummary: "查看标签索引摘要",
    analyzeTagHealth: "分析标签健康度",
    suggestTagsForCurrentNote: "为当前笔记推荐标签",
    undoLastChangeForCurrentNote: "撤销当前笔记最近标签修改"
  },
  loading: {
    refreshTitle: "正在刷新标签索引",
    refreshMessage: "正在扫描 Markdown 笔记并统计当前库的标签用法。",
    suggestTitle: "正在生成标签推荐",
    suggestMessage: "正在读取当前库上下文并请求 AI 服务返回结构化建议。",
    minimize: "最小化",
    expand: "展开"
  },
  notices: {
    indexed: (count) => `已索引 ${count} 个标签。`,
    refreshFailed: "刷新标签索引失败。",
    noTagIndex: "还没有标签索引，请先运行“刷新标签索引”。",
    tagHealthStarted: "正在分析标签健康度，完成后会弹出报告。",
    openMarkdownForSuggest: "请先打开一篇 Markdown 笔记再请求标签推荐。",
    configureApiKey: "请先在 AI Tag Curator 设置中配置 API key。",
    suggestStarted: "正在后台生成标签推荐，完成后会弹出结果。",
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
    allowNewTagsDesc: "关闭时，推荐必须复用当前库已有标签。",
    newTagStrictnessName: "新标签严格程度",
    newTagStrictnessDesc: "控制模型建议新标签时应有多保守。",
    strictnessStrict: "严格",
    strictnessBalanced: "平衡",
    strictnessExploratory: "探索",
    readInlineTagsName: "读取 inline tags",
    readInlineTagsDesc: "构建索引时包含正文里的标签。",
    refreshIndexOnLoadName: "启动时刷新索引",
    refreshIndexOnLoadDesc: "默认关闭，避免大型库启动时扫描过慢。",
    devModeName: "开发模式",
    devModeDesc: "开启后，推荐结果底部会显示开始时间、结束时间和各阶段耗时。"
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
    alternative: (tag, reason) => `#${tag}：${reason}`,
    devTimingTitle: "耗时详情",
    totalTiming: "总耗时",
    stageTiming: {
      readCurrentNote: "读取当前笔记",
      prepareTagIndex: "准备标签索引",
      requestAiRecommendations: "请求 AI 推荐"
    },
    timingRow: (startedAt, endedAt, duration) => `开始：${startedAt} · 结束：${endedAt} · 耗时：${duration}`
  },
  health: {
    title: "标签健康报告",
    subtitle: "以下是基于当前库标签索引生成的只读诊断，不会修改任何 Markdown 文件。",
    generatedAt: (value) => `生成时间：${value}`,
    indexUpdatedAt: (value) => `索引时间：${value}`,
    summary: {
      totalTags: (count) => `标签数：${count}`,
      totalUsages: (count) => `标签使用次数：${count}`,
      totalFiles: (count) => `有标签的文件数：${count}`,
      riskItems: (count) => `风险分组：${count}`
    },
    sections: {
      lowFrequency: "低频标签",
      nearDuplicates: "近似重复标签",
      hierarchyInconsistency: "层级不一致",
      overBroad: "过宽标签",
      overNarrow: "过细标签",
      namingDrift: "命名风格不一致"
    },
    noIssues: "暂未发现明显问题。",
    emptyIssueDetails: {
      lowFrequency: "规则：检查只出现 1 次的标签。例如：#临时想法 只在一篇笔记中出现时会被列入观察。",
      nearDuplicates: "规则：检查大小写、分隔符或单复数归一化后很接近的标签。例如：#AI 与 #ai。",
      hierarchyInconsistency: "规则：检查同一主题是否同时存在平铺标签和层级标签。例如：#AI 与 #AI/工具。",
      overBroad: "规则：检查覆盖大量文件、区分度可能下降的高频标签。例如：#记录 覆盖了大部分笔记。",
      overNarrow: "规则：检查只出现一次且像一次性标题或过长描述的标签。例如：#某篇文章完整标题。",
      namingDrift: "规则：检查语义相近但分隔符或命名风格不一致的标签。例如：#project-ai 与 #project_ai。"
    },
    evidence: "证据",
    impact: "影响",
    suggestion: "建议动作",
    suggestions: {
      merge: "建议合并",
      rename: "建议重命名",
      observe: "建议保留观察",
      deprecate: "建议废弃"
    },
    clickTagAction: (tag) => `复制 #${tag} 并搜索`,
    tagActionDone: (tag) => `已复制 #${tag} 并打开搜索。`,
    tagActionFailed: "复制或搜索标签失败。",
    cleanupPlan: {
      title: "清理审查计划",
      subtitle: "根据健康报告生成的只读清理预览，用来辅助人工审查；当前不会写入任何 Markdown 文件。",
      empty: "当前健康报告没有生成可预览的清理项。",
      copyMarkdown: "复制 Markdown 计划",
      markdownCopied: "已复制 Markdown 清理计划。",
      action: "动作",
      executableSuggestion: "可执行建议",
      status: "状态",
      pendingReview: "待审查",
      appliedStatus: "已应用",
      applyThisSuggestion: "应用",
      undoThisOperation: "回退",
      unsupportedWriteAction: "该动作需要人工确认目标，当前仅生成审查预览。",
      notApplyReady: "该清理建议暂未开放直接写入。",
      frontmatterOnlyWarning: "当前只写入 frontmatter tags；正文 inline tags 仍需人工处理。",
      noWritableChanges: "没有找到可写入的 frontmatter 标签变更。",
      noCleanupUndoRecord: "没有可回退的清理操作。",
      cleanupApplied: (count) => `已应用清理，更新 ${count} 个文件。`,
      cleanupUndone: "已回退最近一次清理。",
      targetTag: "候选目标标签",
      affectedFiles: (count) => `影响文件：${count}`,
      filePreview: "文件预览",
      noTarget: "需要人工选择目标标签",
      before: "当前",
      after: "建议后",
      actions: {
        merge: "合并",
        rename: "重命名",
        observe: "保留观察",
        deprecate: "废弃"
      }
    },
    ai: {
      enhanceButton: "AI 增强分析",
      enhancing: "正在后台生成 AI 增强分析...",
      title: "AI 增强分析",
      summary: "总体判断",
      priorities: "优先处理项",
      severity: {
        high: "高优先级",
        medium: "中优先级",
        low: "低优先级"
      },
      confidence: {
        high: "高置信度",
        medium: "中置信度",
        low: "低置信度"
      },
      stageTiming: {
        prepareAiHealthContext: "准备 AI 健康分析上下文",
        requestAiHealthAnalysis: "请求 AI 健康分析"
      },
      targetTag: "目标标签",
      diagnosis: "诊断",
      reason: "理由",
      riskNote: "注意"
    }
  }
};

const EN_LABELS: LabelTree = {
  commands: {
    refreshTagIndex: "Refresh vault tag index",
    showTagIndexSummary: "Show tag index summary",
    analyzeTagHealth: "Analyze tag health",
    suggestTagsForCurrentNote: "Suggest tags for current note",
    undoLastChangeForCurrentNote: "Undo last tag curator change"
  },
  loading: {
    refreshTitle: "Refreshing tag index",
    refreshMessage: "Scanning Markdown notes and collecting vault tag usage.",
    suggestTitle: "Generating tag recommendations",
    suggestMessage: "Scanning vault context and asking the AI provider for structured suggestions.",
    minimize: "Minimize",
    expand: "Expand"
  },
  notices: {
    indexed: (count) => `Indexed ${count} tags.`,
    refreshFailed: "Failed to refresh tag index.",
    noTagIndex: "No tag index yet. Run Refresh vault tag index first.",
    tagHealthStarted: "Analyzing tag health in the background. The report will open when ready.",
    openMarkdownForSuggest: "Open a Markdown note before requesting tag suggestions.",
    configureApiKey: "Configure an API key in AI Tag Curator settings first.",
    suggestStarted: "Generating tag recommendations in the background. Results will open when ready.",
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
    strictnessStrict: "Strict",
    strictnessBalanced: "Balanced",
    strictnessExploratory: "Exploratory",
    readInlineTagsName: "Read inline tags",
    readInlineTagsDesc: "Include tags from note bodies when building the vault tag index.",
    refreshIndexOnLoadName: "Refresh index on load",
    refreshIndexOnLoadDesc: "Off by default to avoid scanning large vaults during startup.",
    devModeName: "Dev mode",
    devModeDesc: "When enabled, recommendation results show start time, end time, and per-stage durations."
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
    alternative: (tag, reason) => `#${tag}: ${reason}`,
    devTimingTitle: "Dev timing",
    totalTiming: "Total",
    stageTiming: {
      readCurrentNote: "Read current note",
      prepareTagIndex: "Prepare tag index",
      requestAiRecommendations: "Request AI recommendations"
    },
    timingRow: (startedAt, endedAt, duration) => `Start: ${startedAt} · End: ${endedAt} · Duration: ${duration}`
  },
  health: {
    title: "Tag health report",
    subtitle: "This read-only diagnosis is based on the current vault tag index and will not modify Markdown files.",
    generatedAt: (value) => `Generated: ${value}`,
    indexUpdatedAt: (value) => `Index updated: ${value}`,
    summary: {
      totalTags: (count) => `Tags: ${count}`,
      totalUsages: (count) => `Tag usages: ${count}`,
      totalFiles: (count) => `Files with tags: ${count}`,
      riskItems: (count) => `Risk groups: ${count}`
    },
    sections: {
      lowFrequency: "Low-frequency tags",
      nearDuplicates: "Near-duplicate tags",
      hierarchyInconsistency: "Hierarchy inconsistencies",
      overBroad: "Over-broad tags",
      overNarrow: "Over-narrow tags",
      namingDrift: "Naming drift"
    },
    noIssues: "No obvious issues found.",
    emptyIssueDetails: {
      lowFrequency: "Rule: checks tags used only once. Example: #temporary-idea appears in one note only.",
      nearDuplicates: "Rule: checks tags that normalize to similar spelling, separators, or plurals. Example: #AI and #ai.",
      hierarchyInconsistency: "Rule: checks mixed flat and hierarchical tags for the same topic. Example: #AI and #AI/tools.",
      overBroad: "Rule: checks high-frequency tags that may cover too many files. Example: #notes appears on most notes.",
      overNarrow: "Rule: checks one-off tags that look like long titles or descriptions. Example: #full-article-title.",
      namingDrift: "Rule: checks similar tags with inconsistent separators or style. Example: #project-ai and #project_ai."
    },
    evidence: "Evidence",
    impact: "Impact",
    suggestion: "Suggested action",
    suggestions: {
      merge: "Merge",
      rename: "Rename",
      observe: "Keep under review",
      deprecate: "Deprecate"
    },
    clickTagAction: (tag) => `Copy and search #${tag}`,
    tagActionDone: (tag) => `Copied #${tag} and opened search.`,
    tagActionFailed: "Failed to copy or search the tag.",
    cleanupPlan: {
      title: "Cleanup review plan",
      subtitle: "A read-only cleanup preview generated from the health report for manual review. It will not write Markdown files.",
      empty: "This health report did not produce cleanup items to preview.",
      copyMarkdown: "Copy Markdown plan",
      markdownCopied: "Markdown cleanup plan copied.",
      action: "Action",
      executableSuggestion: "Executable suggestion",
      status: "Status",
      pendingReview: "Pending review",
      appliedStatus: "Applied",
      applyThisSuggestion: "Apply",
      undoThisOperation: "Undo",
      unsupportedWriteAction: "This action needs a confirmed target, so it is preview-only for now.",
      notApplyReady: "This cleanup suggestion is not ready for direct writes yet.",
      frontmatterOnlyWarning: "Only frontmatter tags are written for now; inline body tags still need manual review.",
      noWritableChanges: "No writable frontmatter tag changes were found.",
      noCleanupUndoRecord: "No cleanup operation is available to undo.",
      cleanupApplied: (count) => `Cleanup applied to ${count} files.`,
      cleanupUndone: "Latest cleanup undone.",
      targetTag: "Candidate target tag",
      affectedFiles: (count) => `Affected files: ${count}`,
      filePreview: "File preview",
      noTarget: "Choose target tag manually",
      before: "Current",
      after: "Suggested",
      actions: {
        merge: "Merge",
        rename: "Rename",
        observe: "Keep under review",
        deprecate: "Deprecate"
      }
    },
    ai: {
      enhanceButton: "Enhance with AI",
      enhancing: "Generating AI-enhanced analysis in the background...",
      title: "AI-enhanced analysis",
      summary: "Summary",
      priorities: "Priorities",
      severity: {
        high: "High priority",
        medium: "Medium priority",
        low: "Low priority"
      },
      confidence: {
        high: "High confidence",
        medium: "Medium confidence",
        low: "Low confidence"
      },
      stageTiming: {
        prepareAiHealthContext: "Prepare AI health context",
        requestAiHealthAnalysis: "Request AI health analysis"
      },
      targetTag: "Target tag",
      diagnosis: "Diagnosis",
      reason: "Reason",
      riskNote: "Note"
    }
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
