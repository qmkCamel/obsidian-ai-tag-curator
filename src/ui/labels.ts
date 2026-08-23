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
    suggestTagsForFolder: string;
    undoLastChangeForCurrentNote: string;
    undoLastFolderBatch: string;
  };
  loading: {
    refreshTitle: string;
    refreshMessage: string;
    suggestTitle: string;
    suggestMessage: string;
    suggestReadCurrentNote: string;
    suggestPrepareTagIndex: string;
    suggestRequestProvider: string;
    suggestCancelled: string;
    suggestModel: (model: string) => string;
    suggestElapsed: (elapsed: string) => string;
    suggestCancel: string;
    suggestCancelBoundary: string;
    minimize: string;
    expand: string;
  };
  notices: {
    indexed: (count: number) => string;
    refreshFailed: string;
    noTagIndex: string;
    openMarkdownForSuggest: string;
    configureApiKey: string;
    configureProviderBaseUrl: string;
    configureProviderInvalidBaseUrl: string;
    configureProviderModel: string;
    providerTestSucceeded: (model: string, jsonMode: string) => string;
    providerTestFailed: (message: string) => string;
    suggestStarted: string;
    suggestAlreadyRunning: string;
    suggestCancelAccepted: string;
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
    openMarkdownForFolderBatch: string;
    folderBatchApplied: (fileCount: number, tagCount: number) => string;
    folderBatchFailed: string;
    noFolderBatchUndo: string;
    folderBatchUndone: string;
    unresolvedBatchBlocked: string;
    indexRefreshFailed: (message: string) => string;
  };
  settings: {
    heading: string;
    languageName: string;
    languageDesc: string;
    languageAuto: string;
    languageZh: string;
    languageEn: string;
    providerTypeName: string;
    providerTypeDesc: string;
    providerTypeRemote: string;
    providerTypeLocal: string;
    providerPresetName: string;
    providerPresetDesc: string;
    providerPresetOpenAI: string;
    providerPresetDeepSeek: string;
    providerPresetLiteRT: string;
    providerPresetOllama: string;
    providerPresetLMStudio: string;
    providerPresetCustom: string;
    apiBaseUrlName: string;
    apiBaseUrlDesc: string;
    apiKeyName: string;
    apiKeyDesc: string;
    modelName: string;
    modelDesc: string;
    supportsJsonModeName: string;
    supportsJsonModeDesc: string;
    providerConcurrencyName: string;
    providerConcurrencyDesc: string;
    promptProfileName: string;
    promptProfileDesc: string;
    promptProfileDefault: string;
    promptProfileEdgeSmall: string;
    providerPrivacyName: string;
    providerPrivacyDesc: string;
    providerBoundaryLoopback: (host: string) => string;
    providerBoundaryCustom: (host: string) => string;
    providerBoundaryRemote: (host: string) => string;
    providerTestName: string;
    providerTestDesc: string;
    providerTestButton: string;
    providerTestRunning: string;
    maxRecommendationsName: string;
    maxRecommendationsDesc: string;
    maxFolderBatchFilesName: string;
    maxFolderBatchFilesDesc: string;
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
    feedbackName: string;
    feedbackDesc: string;
    feedbackButton: string;
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
    topTagStats: (count: number, fileCount: number) => string;
  };
  recommendations: {
    title: string;
    subtitle: string;
    frontmatterSource: string;
    inlineSource: string;
    aiSource: string;
    inlineSyncReason: string;
    emptySource: string;
    aiFailed: (message: string) => string;
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
  folderBatch: {
    rootFolder: string;
    scopeTitle: string;
    scopeSubtitle: string;
    folderName: string;
    chooseFolder: string;
    includeSubfolders: string;
    includeSubfoldersDesc: string;
    fileCount: (count: number) => string;
    requestCount: (count: number) => string;
    providerNotice: string;
    providerNoticeLoopback: (host: string) => string;
    providerNoticeCustom: (host: string) => string;
    providerNoticeRemote: (host: string) => string;
    maxLimit: (limit: number) => string;
    emptyScope: string;
    overLimit: (count: number, limit: number) => string;
    start: string;
    cancel: string;
    progressTitle: string;
    progressSummary: (completed: number, total: number) => string;
    sourceProgress: (ready: number, failed: number) => string;
    aiProgress: (ready: number, failed: number) => string;
    planProgress: (ready: number, noChange: number) => string;
    cancelledCount: (count: number) => string;
    cancelBillingNotice: string;
    minimize: string;
    previewTitle: string;
    previewSubtitle: string;
    summaryFiles: (count: number) => string;
    summaryTags: (count: number) => string;
    summaryRisk: (low: number, medium: number, high: number) => string;
    filterRisk: string;
    filterAll: string;
    riskLow: string;
    riskMedium: string;
    riskHigh: string;
    selectAllLow: string;
    clearAll: string;
    retryFailed: string;
    apply: string;
    frontmatterSource: string;
    inlineSource: string;
    aiSource: string;
    beforeTags: string;
    afterTags: string;
    noTags: string;
    sourceFailed: string;
    sourceCancelled: string;
    aiFailed: (message: string) => string;
    aiCancelled: string;
    noChange: string;
    confirmTitle: string;
    confirmMessage: (fileCount: number, tagCount: number) => string;
    confirmApply: string;
    resultTitle: string;
    appliedResult: string;
    removedResult: string;
    noResult: string;
    rolledBackResult: string;
    conflictResult: string;
    recoveryResult: (target: "before" | "after") => string;
    conflictMissing: string;
    conflictTagsChanged: string;
    conflictContentChanged: string;
    undo: string;
    retryRecovery: string;
    close: string;
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
      executableItems: (count: number) => string;
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
    workflow: {
      layerNote: string;
      actionTitle: string;
      actionSubtitle: string;
      lastAnalyzedAt: (value: string) => string;
      generateAiButton: string;
      aiRunningButton: string;
      initialTitle: string;
      initialDescription: string;
      initialBullets: string[];
      loadingTitle: string;
      loadingDescription: string;
      loadingStages: {
        rules: string;
        merge: string;
        suggest: string;
      };
      loadingHint: string;
      noActionItems: string;
      ruleEvidence: string;
      relatedTags: string;
      evidenceTitle: string;
      evidenceDescription: string;
      evidenceFileExamples: string;
      evidenceFileExamplesDescription: string;
    };
    cleanupPlan: {
      title: string;
      subtitle: string;
      empty: string;
      copyMarkdown: string;
      markdownCopied: string;
      action: string;
      actionCapability: string;
      actionKind: string;
      availabilityLabel: string;
      riskLabel: string;
      requiresTargetTag: string;
      requiresFilePreview: string;
      supportsBatch: string;
      booleanYes: string;
      booleanNo: string;
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
      previewOnlyNote: string;
      observeOnlyNote: string;
      manualReviewNote: string;
      aiAssistance: string;
      aiPriorityHint: string;
      aiTargetTagCandidate: string;
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
      kind: {
        mergeTags: string;
        renameTag: string;
        removeTag: string;
        observeOnly: string;
        splitBroadTag: string;
        manualReview: string;
      };
      availability: {
        executable: string;
        previewOnly: string;
        observeOnly: string;
        manualReview: string;
      };
      risk: {
        high: string;
        medium: string;
        low: string;
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
    suggestTagsForFolder: "为文件夹批量生成标签建议",
    undoLastChangeForCurrentNote: "撤销当前笔记最近标签修改",
    undoLastFolderBatch: "撤销最近一次文件夹批量标签操作"
  },
  loading: {
    refreshTitle: "正在刷新标签索引",
    refreshMessage: "正在扫描 Markdown 笔记并统计当前库的标签用法。",
    suggestTitle: "正在生成标签推荐",
    suggestMessage: "正在读取当前库上下文并请求 AI 服务返回结构化建议。",
    suggestReadCurrentNote: "正在读取启动任务时的笔记",
    suggestPrepareTagIndex: "正在准备标签索引上下文",
    suggestRequestProvider: "正在等待 AI provider 返回结构化建议",
    suggestCancelled: "已取消；正在等待并丢弃晚到结果",
    suggestModel: (model) => `模型：${model}`,
    suggestElapsed: (elapsed) => `已用时间：${elapsed}`,
    suggestCancel: "取消推荐",
    suggestCancelBoundary: "取消会丢弃晚到结果；已经发出的 provider 请求仍可能继续运行。",
    minimize: "最小化",
    expand: "展开"
  },
  notices: {
    indexed: (count) => `已索引 ${count} 个标签。`,
    refreshFailed: "刷新标签索引失败。",
    noTagIndex: "还没有标签索引，请先运行“刷新标签索引”。",
    openMarkdownForSuggest: "请先打开一篇 Markdown 笔记再请求标签推荐。",
    configureApiKey: "请先在 AI Tag Curator 设置中配置 API key。",
    configureProviderBaseUrl: "请先在 AI Tag Curator 设置中配置 AI provider base URL。",
    configureProviderInvalidBaseUrl: "AI provider base URL 必须是 http 或 https URL。",
    configureProviderModel: "请先在 AI Tag Curator 设置中配置模型名。",
    providerTestSucceeded: (model, jsonMode) => `Provider 测试通过：模型 ${model}，JSON mode ${jsonMode}。`,
    providerTestFailed: (message) => `Provider 测试失败：${message}`,
    suggestStarted: "正在后台生成标签推荐，完成后会弹出结果。",
    suggestAlreadyRunning: "已有当前笔记推荐正在运行，已显示其进度面板。",
    suggestCancelAccepted: "已取消当前笔记推荐；晚到结果将被丢弃。",
    noRecommendations: "没有返回标签推荐。",
    suggestFailed: "标签推荐失败。",
    openMarkdownForUndo: "请先打开一篇 Markdown 笔记再撤销标签修改。",
    noUndoRecord: "当前笔记没有可撤销的标签修改。",
    noteMissing: "该操作对应的笔记已不存在。",
    undoComplete: "已撤销最近一次标签修改。",
    undoFailed: "撤销标签修改失败。",
    tagsUpdated: "标签已更新。",
    updateFailed: "更新标签失败。",
    languageChanged: "语言设置已保存。命令面板名称会在重载插件后更新。",
    openMarkdownForFolderBatch: "请先打开一篇 Markdown 笔记，以确定默认文件夹范围。",
    folderBatchApplied: (fileCount, tagCount) => `文件夹批次已应用：更新 ${fileCount} 篇笔记，新增 ${tagCount} 个标签。`,
    folderBatchFailed: "文件夹批次执行失败。",
    noFolderBatchUndo: "没有可撤销的文件夹批量标签操作。",
    folderBatchUndone: "最近一次文件夹批量标签操作已撤销。",
    unresolvedBatchBlocked: "存在尚未恢复的文件夹批次，请先完成固定目标恢复。",
    indexRefreshFailed: (message) => `文件已稳定，但标签索引刷新失败：${message}`
  },
  settings: {
    heading: "AI Tag Curator 设置",
    languageName: "界面语言",
    languageDesc: "选择插件 UI 语言。Auto 会跟随 Obsidian 当前语言。",
    languageAuto: "Auto（跟随 Obsidian）",
    languageZh: "简体中文",
    languageEn: "English",
    providerTypeName: "Provider 类型",
    providerTypeDesc: "远端 provider 需要 API key；本地 OpenAI-compatible endpoint 可留空 API key。",
    providerTypeRemote: "远端 OpenAI-compatible",
    providerTypeLocal: "本地 OpenAI-compatible",
    providerPresetName: "Provider preset",
    providerPresetDesc: "选择常见 provider 默认值。插件不会安装、启动或下载任何模型。",
    providerPresetOpenAI: "OpenAI",
    providerPresetDeepSeek: "DeepSeek",
    providerPresetLiteRT: "LiteRT-LM CLI",
    providerPresetOllama: "Ollama",
    providerPresetLMStudio: "LM Studio",
    providerPresetCustom: "自定义",
    apiBaseUrlName: "API base URL",
    apiBaseUrlDesc: "OpenAI-compatible endpoint，例如 https://api.deepseek.com 或 https://api.openai.com/v1。",
    apiKeyName: "API key",
    apiKeyDesc: "保存在本地 Obsidian 插件数据中。",
    modelName: "Model",
    modelDesc: "OpenAI-compatible provider 的模型名，例如 deepseek-v4-flash。",
    supportsJsonModeName: "JSON mode",
    supportsJsonModeDesc: "开启后请求会包含 response_format=json_object；若本地 provider 不支持，请关闭。",
    providerConcurrencyName: "Provider 并发",
    providerConcurrencyDesc: "文件夹批次同时请求 provider 的数量。远端默认 2，本地默认 1，可在 1–2 间调整。",
    promptProfileName: "Prompt profile",
    promptProfileDesc: "default 保持完整上下文；edge-small 为端上小模型收窄正文、标签和健康报告上下文。",
    promptProfileDefault: "default",
    promptProfileEdgeSmall: "edge-small",
    providerPrivacyName: "Provider 隐私边界",
    providerPrivacyDesc:
      "当前笔记推荐会发送笔记内容片段、已有标签和标签索引摘要；标签健康 AI 会发送本地规则证据、标签统计和有限示例；文件夹批次会按每篇笔记发送内容片段和标签索引摘要。API key 只保存在本地插件数据中，不进入批次快照或操作日志。",
    providerBoundaryLoopback: (host) => `当前 endpoint 是本机地址 ${host}。`,
    providerBoundaryCustom: (host) => `当前 endpoint 是 ${host}，内容会发送到该地址，不能视为只留在当前设备。`,
    providerBoundaryRemote: (host) => `当前 endpoint 是远端 provider ${host}，请自行确认其服务条款和数据处理方式。`,
    providerTestName: "测试 provider",
    providerTestDesc: "手动发送模型列表探测和最小 JSON chat completion；打开设置页不会自动请求。",
    providerTestButton: "测试连接",
    providerTestRunning: "测试中...",
    maxRecommendationsName: "推荐数量上限",
    maxRecommendationsDesc: "预览中最多展示多少个标签。",
    maxFolderBatchFilesName: "单批最多文件数",
    maxFolderBatchFilesDesc: "文件夹批次必须完整落在该上限内，不会静默截断。可设置为 1–200，默认 50。",
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
    devModeDesc: "开启后，推荐结果底部会显示开始时间、结束时间和各阶段耗时。",
    feedbackName: "反馈与建议",
    feedbackDesc: "报告问题或分享使用体验。点击后会在浏览器中打开 GitHub Issues。",
    feedbackButton: "提供反馈"
  },
  summary: {
    title: "标签索引摘要",
    lastRefreshed: (value) => `最近刷新：${value}`,
    tags: (count) => `标签数：${count}`,
    usages: (count) => `标签使用次数：${count}`,
    files: (count) => `有标签的文件数：${count}`,
    hierarchical: (count) => `层级标签数：${count}`,
    topTags: "高频标签",
    topTagItem: (tag, count, fileCount) => `#${tag} · ${count} 次使用 · ${fileCount} 个文件`,
    topTagStats: (count, fileCount) => `${count} 次使用 · ${fileCount} 个文件`
  },
  recommendations: {
    title: "标签推荐",
    subtitle: "以下是按相关性排序的候选标签。每一项都是独立建议，“相近但未选”只是说明为什么没有选择另一个相似标签。",
    frontmatterSource: "当前 frontmatter 标签",
    inlineSource: "正文 inline 标签",
    aiSource: "AI 建议",
    inlineSyncReason: "同步正文已有标签到 frontmatter；正文原位置不会改变。",
    emptySource: "无",
    aiFailed: (message) => `AI 建议失败：${message}。仍可审查本地确定的正文标签同步项。`,
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
  folderBatch: {
    rootFolder: "库根目录",
    scopeTitle: "确认文件夹批次范围",
    scopeSubtitle: "范围确认阶段只枚举 Markdown 文件，不读取正文、不构建索引、也不发起 AI 请求。",
    folderName: "文件夹",
    chooseFolder: "选择文件夹",
    includeSubfolders: "包含子文件夹",
    includeSubfoldersDesc: "默认开启；关闭后只处理该文件夹的直接 Markdown 子文件。",
    fileCount: (count) => `Markdown 文件：${count}`,
    requestCount: (count) => `预计 AI 请求：${count}`,
    providerNotice: "每篇笔记单独请求当前配置的 provider；已发出的请求在取消后仍可能计费。",
    providerNoticeLoopback: (host) =>
      `每篇笔记会单独请求本机 endpoint ${host}，发送内容片段和标签索引摘要；取消后晚到结果会被丢弃。`,
    providerNoticeCustom: (host) =>
      `每篇笔记会单独请求 ${host}，内容会发送到该地址；取消后晚到结果会被丢弃。`,
    providerNoticeRemote: (host) =>
      `每篇笔记会单独请求远端 provider ${host}；已发出的请求在取消后仍可能计费。`,
    maxLimit: (limit) => `当前单批上限：${limit}`,
    emptyScope: "当前范围没有 Markdown 文件，无法开始。",
    overLimit: (count, limit) => `当前范围有 ${count} 篇，超过上限 ${limit}；不会静默截断。请缩小范围或调整设置。`,
    start: "开始生成",
    cancel: "立即取消",
    progressTitle: "正在生成文件夹标签建议",
    progressSummary: (completed, total) => `总体进度：${completed}/${total}`,
    sourceProgress: (ready, failed) => `读取：成功 ${ready} · 失败 ${failed}`,
    aiProgress: (ready, failed) => `AI：完成 ${ready} · 失败 ${failed}`,
    planProgress: (ready, noChange) => `计划：可审查 ${ready} · 无需变更 ${noChange}`,
    cancelledCount: (count) => `已取消：${count}`,
    cancelBillingNotice: "取消会立即停止领取新任务并丢弃晚到结果；取消前已经发出的 provider 请求仍可能计费。",
    minimize: "最小化",
    previewTitle: "审查文件夹标签批次",
    previewSubtitle: "审查期间不会写文件。低风险项默认选中；新标签为中风险，必须逐项选择；高风险项不可执行。",
    summaryFiles: (count) => `将修改文件：${count}`,
    summaryTags: (count) => `选中新增标签：${count}`,
    summaryRisk: (low, medium, high) => `风险项：低 ${low} · 中 ${medium} · 高 ${high}`,
    filterRisk: "风险筛选",
    filterAll: "全部",
    riskLow: "低风险",
    riskMedium: "中风险",
    riskHigh: "高风险（不可执行）",
    selectAllLow: "选择全部低风险",
    clearAll: "清除全部",
    retryFailed: "仅重试失败项",
    apply: "应用选中计划",
    frontmatterSource: "frontmatter",
    inlineSource: "inline 正文",
    aiSource: "AI",
    beforeTags: "应用前",
    afterTags: "应用后",
    noTags: "无",
    sourceFailed: "笔记读取失败，不能生成本地项或 AI 建议。",
    sourceCancelled: "笔记读取已取消，没有生成可审查内容。",
    aiFailed: (message) => `AI 建议失败：${message}；仍保留本地 inline 同步项。`,
    aiCancelled: "AI 建议已取消；本地已读取的同步项仍可审查。",
    noChange: "读取和 AI 均成功，没有可写候选项。",
    confirmTitle: "确认应用文件夹批次",
    confirmMessage: (fileCount, tagCount) => `将修改 ${fileCount} 篇笔记并向 frontmatter 新增 ${tagCount} 个标签。正文不会改写。`,
    confirmApply: "确认应用",
    resultTitle: "文件夹批次结果",
    appliedResult: "批次已完整应用，并保留一条可整体回退的操作记录。",
    removedResult: "文件已完整回到应用前快照，批次操作记录已移除。",
    noResult: "没有可执行的文件夹批次操作。",
    rolledBackResult: "应用中途失败；已完整补偿，所有文件恢复到应用前状态。",
    conflictResult: "预检发现冲突，本批次保持零写入。",
    recoveryResult: (target) => `补偿未完整完成；新批次已阻断。固定恢复目标：${target === "before" ? "应用前" : "应用后"}。`,
    conflictMissing: "文件缺失",
    conflictTagsChanged: "frontmatter tags 已变化，请重新生成预览",
    conflictContentChanged: "完整 Markdown 内容已变化，请重新生成预览",
    undo: "整体回退批次",
    retryRecovery: "重试固定目标恢复",
    close: "关闭"
  },
  health: {
    title: "标签健康报告",
    subtitle: "规则分析负责生成事实证据，AI 辅助分析负责合并、解释和排序，不直接决定可执行性。",
    generatedAt: (value) => `生成时间：${value}`,
    indexUpdatedAt: (value) => `索引时间：${value}`,
    summary: {
      totalTags: (count) => `标签数：${count}`,
      totalUsages: (count) => `标签使用次数：${count}`,
      totalFiles: (count) => `有标签的文件数：${count}`,
      riskItems: (count) => `风险分组：${count}`,
      executableItems: (count) => `可执行建议：${count}`
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
    workflow: {
      layerNote: "规则是证据层，AI 是行动建议层；动作是否可执行始终由本地规则决定。",
      actionTitle: "AI 行动建议",
      actionSubtitle: "AI 会把跨规则的同一主题问题合并为更少的行动建议。",
      lastAnalyzedAt: (value) => `上次分析：${value}`,
      generateAiButton: "生成 AI 辅助分析",
      aiRunningButton: "正在分析...",
      initialTitle: "尚未生成 AI 辅助分析",
      initialDescription: "当前只展示规则检测到的证据。运行 AI 后，会把低频、重复、过宽、过细、层级和命名问题合并为更少的行动建议。",
      initialBullets: ["合并跨规则的同一主题问题", "判断哪些应优先处理，哪些继续观察", "补充目标标签与风险提示"],
      loadingTitle: "正在生成 AI 辅助分析",
      loadingDescription: "正在合并同一主题下的规则问题，并判断哪些建议应优先处理。",
      loadingStages: {
        rules: "已完成：整理规则证据",
        merge: "进行中：合并相关标签问题",
        suggest: "等待中：生成行动建议与风险提示"
      },
      loadingHint: "你可以继续查看下方规则证据明细。",
      noActionItems: "AI 没有返回可展示的行动建议。",
      ruleEvidence: "规则证据",
      relatedTags: "相关标签",
      evidenceTitle: "规则证据明细",
      evidenceDescription: "规则明细只说明发现了什么，不直接代表必须处理。",
      evidenceFileExamples: "相关文件示例",
      evidenceFileExamplesDescription: "最多展示前 4 个相关文件示例；点击文件名可打开笔记。"
    },
    cleanupPlan: {
      title: "清理审查计划",
      subtitle: "根据健康报告生成的清理预览；只有标记为可执行的项目可手动应用，并会记录操作用于回退。",
      empty: "当前健康报告没有生成可预览的清理项。",
      copyMarkdown: "复制 Markdown 计划",
      markdownCopied: "已复制 Markdown 清理计划。",
      action: "动作",
      actionCapability: "动作能力",
      actionKind: "动作类型",
      availabilityLabel: "可用性",
      riskLabel: "风险等级",
      requiresTargetTag: "需要目标标签",
      requiresFilePreview: "需要文件预览",
      supportsBatch: "支持批量",
      booleanYes: "是",
      booleanNo: "否",
      executableSuggestion: "可执行建议",
      status: "状态",
      pendingReview: "待审查",
      appliedStatus: "已应用",
      applyThisSuggestion: "应用",
      undoThisOperation: "回退",
      unsupportedWriteAction: "该动作需要人工确认目标，当前仅生成审查预览。",
      notApplyReady: "该清理建议暂未开放直接写入。",
      frontmatterOnlyWarning: "应用前请确认文件预览。当前只写入 frontmatter tags；正文 inline tags 仍需人工处理，操作会记录用于回退。",
      noWritableChanges: "没有找到可写入的 frontmatter 标签变更。",
      noCleanupUndoRecord: "没有可回退的清理操作。",
      cleanupApplied: (count) => `已应用清理，更新 ${count} 个文件。`,
      cleanupUndone: "已回退最近一次清理。",
      previewOnlyNote: "该动作当前仅提供预览和导出，不会写入 Markdown。",
      observeOnlyNote: "该问题当前仅建议继续观察，低频本身不足以证明应该修改。",
      manualReviewNote: "该问题需要人工判断，当前不会提供一键处理能力。",
      aiAssistance: "AI 辅助建议",
      aiPriorityHint: "AI 优先级提示",
      aiTargetTagCandidate: "AI 候选目标标签",
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
      },
      kind: {
        mergeTags: "合并标签",
        renameTag: "重命名标签",
        removeTag: "移除标签",
        observeOnly: "仅观察",
        splitBroadTag: "拆分过宽标签",
        manualReview: "人工判断"
      },
      availability: {
        executable: "可执行",
        previewOnly: "仅预览",
        observeOnly: "仅观察",
        manualReview: "需人工判断"
      },
      risk: {
        high: "高风险",
        medium: "中风险",
        low: "低风险"
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
    suggestTagsForFolder: "Generate tag suggestions for folder",
    undoLastChangeForCurrentNote: "Undo last tag curator change",
    undoLastFolderBatch: "Undo latest folder batch tag operation"
  },
  loading: {
    refreshTitle: "Refreshing tag index",
    refreshMessage: "Scanning Markdown notes and collecting vault tag usage.",
    suggestTitle: "Generating tag recommendations",
    suggestMessage: "Scanning vault context and asking the AI provider for structured suggestions.",
    suggestReadCurrentNote: "Reading the note captured when this task started",
    suggestPrepareTagIndex: "Preparing tag-index context",
    suggestRequestProvider: "Waiting for the AI provider to return structured suggestions",
    suggestCancelled: "Cancelled; waiting to discard the late result",
    suggestModel: (model) => `Model: ${model}`,
    suggestElapsed: (elapsed) => `Elapsed: ${elapsed}`,
    suggestCancel: "Cancel recommendation",
    suggestCancelBoundary: "Cancellation discards late results. A provider request already sent may keep running.",
    minimize: "Minimize",
    expand: "Expand"
  },
  notices: {
    indexed: (count) => `Indexed ${count} tags.`,
    refreshFailed: "Failed to refresh tag index.",
    noTagIndex: "No tag index yet. Run Refresh vault tag index first.",
    openMarkdownForSuggest: "Open a Markdown note before requesting tag suggestions.",
    configureApiKey: "Configure an API key in AI Tag Curator settings first.",
    configureProviderBaseUrl: "Configure an AI provider base URL in AI Tag Curator settings first.",
    configureProviderInvalidBaseUrl: "AI provider base URL must be an http or https URL.",
    configureProviderModel: "Configure an AI provider model in AI Tag Curator settings first.",
    providerTestSucceeded: (model, jsonMode) => `Provider test passed: model ${model}, JSON mode ${jsonMode}.`,
    providerTestFailed: (message) => `Provider test failed: ${message}`,
    suggestStarted: "Generating tag recommendations in the background. Results will open when ready.",
    suggestAlreadyRunning: "A current-note recommendation is already running. Its progress panel is now visible.",
    suggestCancelAccepted: "Current-note recommendation cancelled. Any late result will be discarded.",
    noRecommendations: "No tag recommendations returned.",
    suggestFailed: "Failed to suggest tags.",
    openMarkdownForUndo: "Open a Markdown note before undoing a tag change.",
    noUndoRecord: "No tag curator change found for this note.",
    noteMissing: "The note for this operation no longer exists.",
    undoComplete: "Last tag curator change undone.",
    undoFailed: "Failed to undo tag change.",
    tagsUpdated: "Tags updated.",
    updateFailed: "Failed to update tags.",
    languageChanged: "Language setting saved. Command palette names update after reloading the plugin.",
    openMarkdownForFolderBatch: "Open a Markdown note first so the default folder scope can be determined.",
    folderBatchApplied: (fileCount, tagCount) => `Folder batch applied: ${fileCount} notes updated and ${tagCount} tags added.`,
    folderBatchFailed: "Folder batch failed.",
    noFolderBatchUndo: "No folder batch tag operation is available to undo.",
    folderBatchUndone: "The latest folder batch tag operation was undone.",
    unresolvedBatchBlocked: "An unresolved folder batch must reach its fixed recovery target before another batch can write.",
    indexRefreshFailed: (message) => `Files are stable, but the tag index refresh failed: ${message}`
  },
  settings: {
    heading: "AI Tag Curator Settings",
    languageName: "Interface language",
    languageDesc: "Choose the plugin UI language. Auto follows the current Obsidian language.",
    languageAuto: "Auto (follow Obsidian)",
    languageZh: "简体中文",
    languageEn: "English",
    providerTypeName: "Provider type",
    providerTypeDesc: "Remote providers require an API key. Local OpenAI-compatible endpoints may leave it blank.",
    providerTypeRemote: "Remote OpenAI-compatible",
    providerTypeLocal: "Local OpenAI-compatible",
    providerPresetName: "Provider preset",
    providerPresetDesc: "Choose defaults for common providers. The plugin does not install, start, or download models.",
    providerPresetOpenAI: "OpenAI",
    providerPresetDeepSeek: "DeepSeek",
    providerPresetLiteRT: "LiteRT-LM CLI",
    providerPresetOllama: "Ollama",
    providerPresetLMStudio: "LM Studio",
    providerPresetCustom: "Custom",
    apiBaseUrlName: "API base URL",
    apiBaseUrlDesc: "OpenAI-compatible endpoint, for example https://api.deepseek.com or https://api.openai.com/v1.",
    apiKeyName: "API key",
    apiKeyDesc: "Stored locally in Obsidian plugin data.",
    modelName: "Model",
    modelDesc: "Model name for your OpenAI-compatible provider, for example deepseek-v4-flash.",
    supportsJsonModeName: "JSON mode",
    supportsJsonModeDesc:
      "When enabled, requests include response_format=json_object. Turn it off if your local provider does not support it.",
    providerConcurrencyName: "Provider concurrency",
    providerConcurrencyDesc:
      "Number of simultaneous provider requests in folder batches. Remote defaults to 2, local defaults to 1; allowed range is 1-2.",
    promptProfileName: "Prompt profile",
    promptProfileDesc:
      "default keeps the full context; edge-small narrows note text, tags, and health-report context for small on-device models.",
    promptProfileDefault: "default",
    promptProfileEdgeSmall: "edge-small",
    providerPrivacyName: "Provider privacy boundary",
    providerPrivacyDesc:
      "Current-note recommendations send note excerpts, existing tags, and a tag-index summary. Tag-health AI sends local rule evidence, tag statistics, and limited examples. Folder batches send note excerpts and tag-index summaries per note. API keys stay in local plugin data and are not stored in batch snapshots or operation logs.",
    providerBoundaryLoopback: (host) => `Current endpoint is local loopback ${host}.`,
    providerBoundaryCustom: (host) =>
      `Current endpoint is ${host}; content is sent to that address and should not be treated as staying on this device.`,
    providerBoundaryRemote: (host) =>
      `Current endpoint is remote provider ${host}; review its terms and data handling yourself.`,
    providerTestName: "Test provider",
    providerTestDesc:
      "Manually sends a model-list probe and a minimal JSON chat completion. Opening settings never sends requests automatically.",
    providerTestButton: "Test connection",
    providerTestRunning: "Testing...",
    maxRecommendationsName: "Maximum recommendations",
    maxRecommendationsDesc: "Upper bound for tags shown in the preview.",
    maxFolderBatchFilesName: "Maximum files per batch",
    maxFolderBatchFilesDesc:
      "A folder batch must fit completely within this 1–200 limit and is never silently truncated. Default: 50.",
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
    devModeDesc: "When enabled, recommendation results show start time, end time, and per-stage durations.",
    feedbackName: "Feedback and suggestions",
    feedbackDesc: "Report an issue or share your experience. Opens GitHub Issues in your browser.",
    feedbackButton: "Send feedback"
  },
  summary: {
    title: "Tag index summary",
    lastRefreshed: (value) => `Last refreshed: ${value}`,
    tags: (count) => `Tags: ${count}`,
    usages: (count) => `Tag usages: ${count}`,
    files: (count) => `Files with tags: ${count}`,
    hierarchical: (count) => `Hierarchical tags: ${count}`,
    topTags: "Top tags",
    topTagItem: (tag, count, fileCount) => `#${tag} · ${count} usages · ${fileCount} files`,
    topTagStats: (count, fileCount) => `${count} usages · ${fileCount} files`
  },
  recommendations: {
    title: "Tag recommendations",
    subtitle:
      "These candidates are ordered by relevance. Each item is an independent suggestion; close alternatives explain why a similar tag was not selected.",
    frontmatterSource: "Current frontmatter tags",
    inlineSource: "Inline body tags",
    aiSource: "AI suggestions",
    inlineSyncReason: "Sync an existing inline tag to frontmatter; its body position will not change.",
    emptySource: "None",
    aiFailed: (message) => `AI suggestions failed: ${message}. Locally derived inline sync items remain available for review.`,
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
  folderBatch: {
    rootFolder: "Vault root",
    scopeTitle: "Confirm folder batch scope",
    scopeSubtitle: "Scope confirmation only enumerates Markdown files; it does not read note content, build the index, or send AI requests.",
    folderName: "Folder",
    chooseFolder: "Choose folder",
    includeSubfolders: "Include subfolders",
    includeSubfoldersDesc: "On by default. Turn off to process only direct Markdown children.",
    fileCount: (count) => `Markdown files: ${count}`,
    requestCount: (count) => `Estimated AI requests: ${count}`,
    providerNotice: "Each note uses one request to the configured provider. Requests already sent may still be billed after cancellation.",
    providerNoticeLoopback: (host) =>
      `Each note requests local endpoint ${host} with a content excerpt and tag-index summary. Late results after cancellation are discarded.`,
    providerNoticeCustom: (host) =>
      `Each note requests ${host}; content is sent to that address. Late results after cancellation are discarded.`,
    providerNoticeRemote: (host) =>
      `Each note requests remote provider ${host}. Requests already sent may still be billed after cancellation.`,
    maxLimit: (limit) => `Current per-batch limit: ${limit}`,
    emptyScope: "This scope contains no Markdown files and cannot start.",
    overLimit: (count, limit) => `This scope has ${count} notes, above the ${limit} limit. Nothing will be silently truncated; narrow the scope or change settings.`,
    start: "Start generation",
    cancel: "Cancel immediately",
    progressTitle: "Generating folder tag suggestions",
    progressSummary: (completed, total) => `Overall progress: ${completed}/${total}`,
    sourceProgress: (ready, failed) => `Read: ${ready} ready · ${failed} failed`,
    aiProgress: (ready, failed) => `AI: ${ready} ready · ${failed} failed`,
    planProgress: (ready, noChange) => `Plans: ${ready} reviewable · ${noChange} no change`,
    cancelledCount: (count) => `Cancelled: ${count}`,
    cancelBillingNotice: "Cancellation stops new work immediately and discards late results. Provider requests sent before cancellation may still be billed.",
    minimize: "Minimize",
    previewTitle: "Review folder tag batch",
    previewSubtitle: "Reviewing does not write files. Low-risk items start selected; new tags are medium risk and require individual selection; high-risk items are not executable.",
    summaryFiles: (count) => `Files to modify: ${count}`,
    summaryTags: (count) => `Selected tag additions: ${count}`,
    summaryRisk: (low, medium, high) => `Risk items: ${low} low · ${medium} medium · ${high} high`,
    filterRisk: "Risk filter",
    filterAll: "All",
    riskLow: "Low risk",
    riskMedium: "Medium risk",
    riskHigh: "High risk (not executable)",
    selectAllLow: "Select all low risk",
    clearAll: "Clear all",
    retryFailed: "Retry failed items only",
    apply: "Apply selected plans",
    frontmatterSource: "frontmatter",
    inlineSource: "inline body",
    aiSource: "AI",
    beforeTags: "Before",
    afterTags: "After",
    noTags: "None",
    sourceFailed: "The note could not be read, so no local item or AI suggestion is available.",
    sourceCancelled: "Note reading was cancelled, so no reviewable content was generated.",
    aiFailed: (message) => `AI suggestions failed: ${message}. Local inline sync items remain reviewable.`,
    aiCancelled: "AI suggestions were cancelled. Locally read sync items remain reviewable.",
    noChange: "Read and AI both succeeded, with no writable candidates.",
    confirmTitle: "Confirm folder batch apply",
    confirmMessage: (fileCount, tagCount) => `This will modify ${fileCount} notes and add ${tagCount} frontmatter tags. Note bodies will not be rewritten.`,
    confirmApply: "Confirm apply",
    resultTitle: "Folder batch result",
    appliedResult: "The batch was fully applied and one whole-batch undo record was retained.",
    removedResult: "Every file is back at its before snapshot and the batch operation record was removed.",
    noResult: "No folder batch operation was available.",
    rolledBackResult: "Applying failed partway through; compensation fully restored every file to its before state.",
    conflictResult: "Preflight found conflicts, so the entire batch performed zero writes.",
    recoveryResult: (target) => `Compensation is incomplete and new batches are blocked. Fixed recovery target: ${target}.`,
    conflictMissing: "File missing",
    conflictTagsChanged: "Frontmatter tags changed; generate a new preview",
    conflictContentChanged: "Full Markdown content changed; generate a new preview",
    undo: "Undo whole batch",
    retryRecovery: "Retry fixed-target recovery",
    close: "Close"
  },
  health: {
    title: "Tag health report",
    subtitle: "Rules provide factual evidence; AI assistance merges, explains, and ranks issues without deciding executability.",
    generatedAt: (value) => `Generated: ${value}`,
    indexUpdatedAt: (value) => `Index updated: ${value}`,
    summary: {
      totalTags: (count) => `Tags: ${count}`,
      totalUsages: (count) => `Tag usages: ${count}`,
      totalFiles: (count) => `Files with tags: ${count}`,
      riskItems: (count) => `Risk groups: ${count}`,
      executableItems: (count) => `Executable suggestions: ${count}`
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
    workflow: {
      layerNote: "Rules are the evidence layer; AI is the action guidance layer. Local rules always decide executability.",
      actionTitle: "AI action suggestions",
      actionSubtitle: "AI merges related rule findings into fewer action-oriented suggestions.",
      lastAnalyzedAt: (value) => `Last analyzed: ${value}`,
      generateAiButton: "Generate AI analysis",
      aiRunningButton: "Analyzing...",
      initialTitle: "AI analysis has not been generated",
      initialDescription: "Only rule evidence is shown right now. After AI runs, low-frequency, duplicate, broad, narrow, hierarchy, and naming issues are merged into fewer action suggestions.",
      initialBullets: ["Merge same-topic issues across rules", "Rank what to handle first and what to observe", "Add target tag candidates and risk notes"],
      loadingTitle: "Generating AI analysis",
      loadingDescription: "Merging related rule findings and deciding which suggestions deserve priority.",
      loadingStages: {
        rules: "Done: organize rule evidence",
        merge: "In progress: merge related tag issues",
        suggest: "Waiting: generate action suggestions and risk notes"
      },
      loadingHint: "You can keep reviewing the rule evidence below.",
      noActionItems: "AI did not return action suggestions to display.",
      ruleEvidence: "Rule evidence",
      relatedTags: "Related tags",
      evidenceTitle: "Rule evidence details",
      evidenceDescription: "Rule details explain what was found; they do not mean every item must be handled.",
      evidenceFileExamples: "Related file examples",
      evidenceFileExamplesDescription: "Shows up to 4 related file examples; click a file name to open the note."
    },
    cleanupPlan: {
      title: "Cleanup review plan",
      subtitle: "A cleanup preview generated from the health report. Only executable items can be applied manually, and each write is logged for undo.",
      empty: "This health report did not produce cleanup items to preview.",
      copyMarkdown: "Copy Markdown plan",
      markdownCopied: "Markdown cleanup plan copied.",
      action: "Action",
      actionCapability: "Action capability",
      actionKind: "Action kind",
      availabilityLabel: "Availability",
      riskLabel: "Risk level",
      requiresTargetTag: "Requires target tag",
      requiresFilePreview: "Requires file preview",
      supportsBatch: "Supports batch",
      booleanYes: "Yes",
      booleanNo: "No",
      executableSuggestion: "Executable suggestion",
      status: "Status",
      pendingReview: "Pending review",
      appliedStatus: "Applied",
      applyThisSuggestion: "Apply",
      undoThisOperation: "Undo",
      unsupportedWriteAction: "This action needs a confirmed target, so it is preview-only for now.",
      notApplyReady: "This cleanup suggestion is not ready for direct writes yet.",
      frontmatterOnlyWarning: "Review the file preview before applying. Only frontmatter tags are written for now; inline body tags still need manual review, and the operation is logged for undo.",
      noWritableChanges: "No writable frontmatter tag changes were found.",
      noCleanupUndoRecord: "No cleanup operation is available to undo.",
      cleanupApplied: (count) => `Cleanup applied to ${count} files.`,
      cleanupUndone: "Latest cleanup undone.",
      previewOnlyNote: "This action is preview-only for now and will not write Markdown.",
      observeOnlyNote: "This issue is observation-only; low usage alone is not enough evidence for modification.",
      manualReviewNote: "This issue requires manual review and will not expose one-click processing.",
      aiAssistance: "AI assistance",
      aiPriorityHint: "AI priority hint",
      aiTargetTagCandidate: "AI candidate target tag",
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
      },
      kind: {
        mergeTags: "Merge tags",
        renameTag: "Rename tag",
        removeTag: "Remove tag",
        observeOnly: "Observe only",
        splitBroadTag: "Split broad tag",
        manualReview: "Manual review"
      },
      availability: {
        executable: "Executable",
        previewOnly: "Preview only",
        observeOnly: "Observe only",
        manualReview: "Manual review"
      },
      risk: {
        high: "High risk",
        medium: "Medium risk",
        low: "Low risk"
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
