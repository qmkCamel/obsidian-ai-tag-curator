// Obsidian plugin entry point that wires settings, commands, indexing, AI, preview, and undo.
import { getLanguage, Notice, Plugin, TFile, TFolder } from "obsidian";
import { defaultTagScope, normalizeScope, pathInScope, type TagScope } from "./management/TagScope";
import { type ManualTagIntent, type ReviewContext } from "./management/ManualTagIntent";
import { ManualTagPlanBuilder } from "./management/ManualTagPlanBuilder";
import { TagManagementService } from "./management/TagManagementService";
import { assertPathAllowed, assertTagChangesAllowed, defaultTagPolicy, isProtectedTag, parsePolicy, pathExcluded, type TagMutationPolicy } from "./policy/TagMutationPolicy";
import { MutationCoordinator } from "./policy/MutationCoordinator";
import { TagIndexService } from "./index/TagIndexService";
import { PluginDataStore } from "./operations/PluginDataStore";
import { projectOperationHistory, type HistoryReceipt } from "./operations/OperationHistory";
import { TagManagementView, TAG_MANAGEMENT_VIEW_TYPE, type TagManagementAdapter } from "./management/TagManagementView";
import { getManagementLabels } from "./ui/managementLabels";
import { captureTagValueSnapshot, assertWritableTagValue } from "./obsidian/TagValuePatch";
import {
  createAiProvider,
  describeProviderEndpoint,
  getProviderCapabilities,
  validateProviderSettings,
  type ProviderConfigIssue
} from "./ai/AiProviderFactory";
import type { RecommendationResult } from "./ai/RecommendationSchema";
import type { CleanupPlanItem } from "./cleanup/CleanupPlan";
import { buildCleanupPlan } from "./cleanup/CleanupPlanBuilder";
import { CleanupReviewPlanBuilder } from "./cleanup/CleanupReviewPlanBuilder";
import type { CleanupReviewPlan } from "./cleanup/CleanupReviewPlan";
import { CleanupReviewProgressModal } from "./cleanup/CleanupReviewProgressModal";
import { CleanupReviewModal } from "./cleanup/CleanupReviewModal";
import { CleanupExecutor, type CleanupExecutionResult } from "./cleanup/CleanupExecutor";
import { CleanupRecoveryService, type CleanupRecoveryResult } from "./cleanup/CleanupRecoveryService";
import { CleanupResultModal } from "./cleanup/CleanupResultModal";
import { TagRecommendationService } from "./recommendations/TagRecommendationService";
import type { CachedTagHealthAiAnalysis } from "./health/TagHealthAiAnalysis";
import { TagHealthAiAnalyzer } from "./health/TagHealthAiAnalyzer";
import { analyzeTagHealth } from "./health/TagHealthAnalyzer";
import type { TagIndex } from "./index/TagIndex";
import { FrontmatterWriter } from "./obsidian/FrontmatterWriter";
import { InlineTagWriter } from "./obsidian/InlineTagWriter";
import { VaultReader } from "./obsidian/VaultReader";
import {
  OperationLog,
  isBatchRecord,
  isCleanupV2Record,
  isLegacyCleanupRecord,
  type CleanupOperationRecordV2,
  type OperationRecord
} from "./operations/OperationLog";
import { UndoService } from "./operations/UndoService";
import { RecommendationModal } from "./preview/RecommendationModal";
import { CurrentNoteRecommendationProgressModal } from "./preview/CurrentNoteRecommendationProgressModal";
import { LoadingModal } from "./preview/LoadingModal";
import { TagHealthReportModal } from "./preview/TagHealthReportModal";
import { TagIndexSummaryModal } from "./preview/TagIndexSummaryModal";
import { DEFAULT_SETTINGS, mergeSettings, type TagCuratorSettings } from "./settings/PluginSettings";
import { TagCuratorSettingsTab } from "./settings/SettingsTab";
import { getLabels, resolveUiLanguage, type UiLanguage } from "./ui/labels";
import { OperationTimer } from "./utils/OperationTimer";
import { createFolderBatchPlan, deriveChangePlans, type FolderBatchPlan } from "./batch/FolderBatchPlan";
import { FolderBatchScopeModal } from "./batch/FolderBatchScopeModal";
import type { FolderBatchScopeViewModel } from "./batch/FolderBatchScope";
import {
  buildFolderBatchProgressSnapshot,
  FolderBatchRecommendationRunner
} from "./batch/FolderBatchRecommendationRunner";
import { FolderBatchProgressModal } from "./batch/FolderBatchProgressModal";
import { FolderBatchPreviewModal } from "./batch/FolderBatchPreviewModal";
import { FolderBatchExecutor, type FolderBatchExecutionResult } from "./batch/FolderBatchExecutor";
import {
  FolderBatchRecoveryService,
  type FolderBatchRecoveryResult
} from "./batch/FolderBatchRecoveryService";
import { FolderBatchResultModal } from "./batch/FolderBatchResultModal";
import type { BatchOperationRecord } from "./operations/OperationLog";

interface PluginData {
  settings?: Partial<TagCuratorSettings>;
  operations?: OperationRecord[];
  tagIndex?: TagIndex;
  healthAiAnalysisCache?: CachedTagHealthAiAnalysis;
  tagMutationPolicy?: TagMutationPolicy;
  managementScope?: TagScope;
  receipts?: HistoryReceipt[];
}

interface CurrentNoteRecommendationJob {
  isCancelled: () => boolean;
  progress: CurrentNoteRecommendationProgressModal;
}

export default class TagCuratorPlugin extends Plugin {
  settings: TagCuratorSettings = { ...DEFAULT_SETTINGS };
  uiLanguage: UiLanguage = "en";
  labels = getLabels("en");
  private vaultReader!: VaultReader;
  private frontmatterWriter!: FrontmatterWriter;
  private inlineTagWriter!: InlineTagWriter;
  private operationLog = new OperationLog();
  private tagIndex: TagIndex | undefined;
  private healthAiAnalysisCache: CachedTagHealthAiAnalysis | undefined;
  private folderBatchRecoveryService!: FolderBatchRecoveryService;
  private currentNoteRecommendationJob: CurrentNoteRecommendationJob | null = null;
  private cleanupRecoveryService!: CleanupRecoveryService;
  private mutationPolicy = defaultTagPolicy();
  private managementScope = defaultTagScope();
  private managementListeners = new Set<() => void>();
  private coordinator = new MutationCoordinator(() => this.notifyManagement());
  private loadError: string | null = null;
  private preservedPluginData: unknown;
  private indexService!: TagIndexService;
  private managementScopeRevision = 0;
  private indexedInlineSetting = true;
  private retainedLogLimit = DEFAULT_SETTINGS.operationLogLimit;
  private managementService?: TagManagementService;
  private dataStore = new PluginDataStore<PluginData>({
    snapshot: () => ({ settings: this.settings, operations: this.operationLog.toJSON(), receipts: this.operationLog.receiptsToJSON(),
      tagIndex: this.tagIndex, healthAiAnalysisCache: this.healthAiAnalysisCache, tagMutationPolicy: this.mutationPolicy, managementScope: this.managementScope }),
    write: (data) => this.saveData(data),
    onError: (error) => this.coordinator.block(error instanceof Error ? error.message : "Saving plugin data failed. Reload before writing.")
  });

  private notifyManagement(): void {
    for (const listener of this.managementListeners) {
      try { listener(); } catch { /* A failed view must not interrupt transaction ownership. */ }
    }
  }

  private reportFailure(work: Promise<unknown>): void {
    void work.catch(error => new Notice(error instanceof Error ? error.message : this.labels.notices.updateFailed));
  }

  private assertCurrentPolicy(revision: number): void {
    if (this.coordinator.error) throw new Error(this.coordinator.error);
    if (revision !== this.mutationPolicy.revision) throw new Error(this.uiLanguage === "zh-CN" ? "范围或保护规则已变化，请重新审查。" : "Scope or protection rules changed. Review again.");
  }

  private assertForwardTags(path: string, before: string[], after: string[]): void {
    if (this.isRecoveryPath(path)) return;
    if (this.coordinator.error) throw new Error(this.coordinator.error);
    assertTagChangesAllowed(path, before, after, this.mutationPolicy);
  }

  private isRecoveryPath(path: string): boolean {
    const id = this.coordinator.recoveryId;
    if (!id) return false;
    const record = this.operationLog.toJSON().find(record => record.id === id);
    const paths = record && ("files" in record ? record.files.map(file => file.notePath) : [record.plan.notePath]);
    if (!paths?.includes(path)) throw new Error("Recovery may only modify paths in its original operation.");
    return true;
  }

  private requireLatestOperation(id: string): void {
    if (this.operationLog.latest()?.id !== id) throw new Error(this.uiLanguage === "zh-CN" ? "请先撤销全局最近一次操作。" : "Undo the most recent operation first.");
  }

  private announceRecoveryExceptions(record: OperationRecord): void {
    const files = "files" in record ? record.files : [record.plan];
    const exceptions = files.filter(file => pathExcluded(file.notePath, this.mutationPolicy) ||
      [...file.beforeTags, ...file.afterTags].some(tag => isProtectedTag(tag, this.mutationPolicy)));
    if (!exceptions.length) return;
    new Notice(this.uiLanguage === "zh-CN"
      ? `本次恢复按原记录范围处理，${exceptions.length} 个文件豁免后来添加的排除/保护规则；内容冲突检查仍生效。`
      : `Recovery uses the original operation scope: ${exceptions.length} file(s) are exempt from later exclusions/protections. Content conflict checks still apply.`);
  }

  private async showManagement(relationships = false): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(TAG_MANAGEMENT_VIEW_TYPE)[0] ?? this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: TAG_MANAGEMENT_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if(relationships && leaf.view instanceof TagManagementView) leaf.view.openRelationships();
  }

  private managementAdapter(): TagManagementAdapter {
    this.managementService ??= new TagManagementService({
      index: () => this.indexService.getSnapshot(), scope: () => this.managementScope, policy: () => this.mutationPolicy,
      readInlineTags: () => this.settings.readInlineTags,
      records: () => this.operationLog.toJSON(), receipts: () => this.operationLog.receiptsToJSON(),
      historyRevision: () => this.operationLog.revision,
      markdownPaths: () => this.app.vault.getMarkdownFiles().map(file => file.path),
      folders: () => this.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder).map(file => file.path),
      busy: () => this.coordinator.busy, error: () => this.coordinator.error, historyError: () => this.loadError,
      subscribe: listener => { this.managementListeners.add(listener); return () => this.managementListeners.delete(listener); },
      commands: {
        refresh: async () => { await this.buildAndSaveTagIndex(); },
        cancelRefresh: () => this.indexService.cancel(),
        saveScopeAndPolicy: (scope, policy) => this.saveManagementPolicy(scope, policy),
        startManual: (intent, signal) => this.startManualReview(intent, signal),
        openFile: async path => {
          const file = this.vaultReader.getMarkdownFileByPath(path);
          if (!file) throw new Error(this.labels.notices.noteMissing);
          await this.app.workspace.getLeaf(false).openFile(file);
        },
        openGraphFile: async path => {
          const file=this.vaultReader.getMarkdownFileByPath(path);
          if(!file)throw new Error(this.labels.notices.noteMissing);
          // Keep the relationship view and its evidence alive while opening a note beside it.
          const existing=this.app.workspace.getLeavesOfType("markdown").find(leaf=>(leaf.view as unknown as {file?:TFile}).file?.path===path);
          const leaf=existing??this.app.workspace.getLeaf("split");
          await leaf.openFile(file);await this.app.workspace.revealLeaf(leaf);
        },
        undo: id => this.runHistoryAction(id, false), recover: id => this.runHistoryAction(id, true),
        openHealth: () => this.analyzeTagHealth(),
        openGraphSettings: () => {
          const settings=(this.app as unknown as {setting?:{open():void;openTabById(id:string):void}}).setting;
          settings?.open();settings?.openTabById(this.manifest.id);
        }
      }
    });
    return this.managementService;
  }

  private async saveManagementPolicy(scopeInput: TagScope, policyInput: TagMutationPolicy): Promise<void> {
    const scope = normalizeScope(scopeInput);
    const policy = parsePolicy(policyInput);
    this.assertCurrentPolicy(policy.revision);
    for (const path of [...scope.include.map(rule => rule.path), ...policy.excludedFolders]) {
      if (path && !(this.app.vault.getAbstractFileByPath(path) instanceof TFolder)) throw new Error(`Folder not found: ${path}`);
    }
    await this.coordinator.run(async () => {
      this.assertCurrentPolicy(policy.revision);
      const policyChanged = JSON.stringify([policy.excludedFolders, policy.protectedTags]) !==
        JSON.stringify([this.mutationPolicy.excludedFolders, this.mutationPolicy.protectedTags]);
      this.managementScope = scope;
      this.managementScopeRevision++;
      if (policyChanged) {
        this.mutationPolicy = { ...policy, revision: policy.revision + 1 };
        this.tagIndex = undefined;
        this.healthAiAnalysisCache = undefined;
        await this.indexService.setPolicy(this.mutationPolicy);
      }
      await this.savePluginData();
    });
  }

  private assertReviewContext(context: ReviewContext, scopeRevision: number): void {
    this.assertCurrentPolicy(context.policyRevision);
    const current = this.indexService.getSnapshot();
    if (current.state !== "ready" || current.revision !== context.indexRevision || current.vaultRevision !== context.vaultRevision ||
        this.managementScopeRevision !== scopeRevision) {
      throw new Error(this.uiLanguage === "zh-CN" ? "索引或范围已变化，请刷新后重新审查。" : "Index or scope changed. Refresh and review again.");
    }
  }

  private async startManualReview(intent: ManualTagIntent, signal: AbortSignal): Promise<void> {
    if (this.blockWriteForUnresolvedMutation()) throw new Error(this.labels.cleanupReview.unresolvedMutationBlocked);
    for (const rule of normalizeScope(intent.scope).include) {
      if (rule.path && !(this.app.vault.getAbstractFileByPath(rule.path) instanceof TFolder)) throw new Error(`Folder not found: ${rule.path}`);
    }
    const prepared = new ManualTagPlanBuilder(this.indexService.getSnapshot(), this.mutationPolicy).prepare(intent);
    const { context } = prepared;
    const scopeRevision = this.managementScopeRevision;
    const builder = new CleanupReviewPlanBuilder({ readOccurrences: async (path, tags) => {
      this.assertReviewContext(context, scopeRevision);
      const file = this.vaultReader.getMarkdownFileByPath(path);
      if (!file) throw new Error(this.labels.notices.noteMissing);
      return this.vaultReader.readInlineTagOccurrences(file, tags);
    } });
    const cancel = (): void => builder.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      if (signal.aborted) return;
      const plan = await builder.buildInput(prepared.input);
      if (signal.aborted || plan.cancelled) return;
      this.assertReviewContext(context, scopeRevision);
      new CleanupReviewModal(this.app, plan, this.labels, async selected => {
        this.assertReviewContext(context, scopeRevision);
        if (this.blockWriteForUnresolvedMutation()) throw new Error(this.labels.cleanupReview.unresolvedMutationBlocked);
        const result = await this.coordinator.run(async () => {
          this.assertReviewContext(context, scopeRevision);
          const executor = new CleanupExecutor({ findFile: path => this.vaultReader.getMarkdownFileByPath(path), inlineWriter: this.inlineTagWriter,
            frontmatterWriter: this.frontmatterWriter, operationLog: this.operationLog, persist: () => this.savePluginData(),
            validateContext: selected => {
              this.assertReviewContext(context, scopeRevision);
              if (selected.files.some(file => !context.candidatePaths.includes(file.notePath) || !pathInScope(file.notePath, context.scope))) {
                throw new Error("Reviewed paths do not match the confirmed scope.");
              }
            },
            refreshIndex: () => this.refreshDerivedStateAfterFolderBatch() });
          return executor.execute(selected, this.settings.operationLogLimit);
        });
        this.openCleanupResult(result);
      }, plan => this.reviewSkipNotes(plan, prepared.outsideFiles)).open();
    } finally { signal.removeEventListener("abort", cancel); }
  }

  private reviewSkipNotes(plan: CleanupReviewPlan, outside: number): string[] {
    const untrusted = plan.files.flatMap(file => file.occurrences).filter(occurrence => occurrence.availability !== "trusted").length;
    const unselected = plan.files.flatMap(file => file.occurrences).filter(occurrence => occurrence.availability === "trusted" && !occurrence.selected).length;
    const unselectedProperties = plan.files.filter(file => file.frontmatterChanged && !file.frontmatterSelected).length;
    const failed = plan.files.filter(file => file.status === "failed" || file.status === "unavailable").length;
    return this.uiLanguage === "zh-CN" ? [
      `范围外：${outside} 个已索引文件；全局排除目录未读取，不统计位置。`,
      `受保护源/目标：不允许提交；不可信位置：${untrusted}；读取或原值不可用：${failed} 个文件。`,
      `未选择：${unselected} 个可信正文位置、${unselectedProperties} 个属性修改。`
    ] : [
      `Outside scope: ${outside} indexed files; globally excluded folders were not read or counted.`,
      `Protected sources/targets block submission; untrusted positions: ${untrusted}; unreadable or unsupported files: ${failed}.`,
      `Unselected: ${unselected} trusted inline positions and ${unselectedProperties} property changes.`
    ];
  }

  private async runHistoryAction(id: string, recover: boolean): Promise<void> {
    const row = projectOperationHistory(this.operationLog.toJSON(), this.operationLog.receiptsToJSON()).find(row => row.operationId === id);
    if (!row || !(recover ? row.canRecover : row.canUndo)) throw new Error("This history action is no longer available.");
    const record = this.operationLog.toJSON().find(record => record.id === id);
    if (!record) throw new Error(this.labels.notices.noUndoRecord);
    if (isBatchRecord(record)) {
      if (recover) await this.retryFolderBatchRecovery(record); else await this.undoLatestFolderBatch();
    } else if (isCleanupV2Record(record)) {
      if (recover) await this.retryCleanupRecovery(record); else await this.undoLatestCleanup();
    } else if (!isLegacyCleanupRecord(record) && !recover) {
      const file = this.vaultReader.getMarkdownFileByPath(record.plan.notePath);
      if (!file) throw new Error(this.labels.notices.noteMissing);
      this.announceRecoveryExceptions(record);
      await this.coordinator.run(() => this.operationLog.runMutation(async () => {
        this.requireLatestOperation(id);
        await new UndoService(this.frontmatterWriter).undo(file, record.plan);
        await this.operationLog.removeAndPersist(id, () => this.savePluginData(), { status: "undone" });
      }), id);
      await this.refreshDerivedStateAfterFolderBatch();
    }
  }

  async onload(): Promise<void> {
    await this.loadPluginData();
    this.refreshLabels();
    this.indexedInlineSetting = this.settings.readInlineTags;

    this.vaultReader = new VaultReader(this.app, (path) => !pathExcluded(path, this.mutationPolicy));
    this.frontmatterWriter = new FrontmatterWriter(this.app, (path, before, after) => this.assertForwardTags(path, before, after));
    this.inlineTagWriter = new InlineTagWriter(this.app, (path, edits) => {
      if (this.isRecoveryPath(path)) return;
      assertPathAllowed(path, this.mutationPolicy);
      if (edits.some(edit => isProtectedTag(edit.beforeText, this.mutationPolicy) || isProtectedTag(edit.afterText, this.mutationPolicy))) {
        throw new Error("Protected inline tags cannot be changed.");
      }
    });
    this.indexService = new TagIndexService({
      listPaths: () => this.app.vault.getMarkdownFiles().map((file) => file.path),
      readNote: (path) => this.vaultReader.readNoteByPath(path),
      includePath: (path) => !pathExcluded(path, this.mutationPolicy),
      includeInlineTags: () => this.settings.readInlineTags,
      persist: async (index, context) => {
        if (this.loadError) throw new Error(this.loadError);
        await this.dataStore.save(() => context.isCurrent(), data => ({ ...data, tagIndex: index, healthAiAnalysisCache: undefined }));
        // A started disk write cannot be cancelled. Restore only derived state if its generation expired.
        if (!context.isCurrent()) await this.savePluginData();
      }
    }, this.tagIndex, { policy: this.mutationPolicy });
    this.tagIndex = this.indexService.getSnapshot().index;
    this.register(this.indexService.subscribe(snapshot => {
      this.tagIndex = snapshot.index;
      this.notifyManagement();
    }));
    this.register(() => this.indexService.cancel());
    const invalidateFile = (file: TFile | TFolder): void => {
        if (file instanceof TFolder || (file instanceof TFile && file.extension === "md")) {
          this.indexService.markVaultChanged();
          this.healthAiAnalysisCache = undefined;
        }
    };
    this.registerEvent(this.app.vault.on("create", invalidateFile));
    this.registerEvent(this.app.vault.on("modify", invalidateFile));
    this.registerEvent(this.app.vault.on("delete", invalidateFile));
    this.registerEvent(this.app.vault.on("rename", invalidateFile));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.indexService.markVaultChanged()));
    this.registerEvent(this.app.metadataCache.on("deleted", () => this.indexService.markVaultChanged()));
    this.registerView(TAG_MANAGEMENT_VIEW_TYPE, (leaf) => new TagManagementView(leaf, { adapter: this.managementAdapter(), language: this.uiLanguage }));
    this.addCommand({ id: "open-tag-manager", name: getManagementLabels(this.uiLanguage).title, callback: () => void this.showManagement() });
    this.addCommand({id:"open-tag-relationship-graph",name:this.uiLanguage.startsWith("zh")?"打开标签关系图":"Open tag relationships",callback:()=>void this.showManagement(true)});
    this.addRibbonIcon("tags", getManagementLabels(this.uiLanguage).title, () => void this.showManagement());
    this.folderBatchRecoveryService = new FolderBatchRecoveryService({
      findFile: (path) => this.vaultReader.getMarkdownFileByPath(path),
      writer: this.frontmatterWriter,
      operationLog: this.operationLog,
      persist: () => this.savePluginData(),
      refreshIndex: async () => {
        await this.refreshDerivedStateAfterFolderBatch();
      }
    });
    this.cleanupRecoveryService = new CleanupRecoveryService({
      findFile: (path) => this.vaultReader.getMarkdownFileByPath(path),
      inlineWriter: this.inlineTagWriter,
      frontmatterWriter: this.frontmatterWriter,
      operationLog: this.operationLog,
      persist: () => this.savePluginData(),
      refreshIndex: async () => {
        await this.refreshDerivedStateAfterFolderBatch();
      }
    });

    this.addSettingTab(new TagCuratorSettingsTab(this));

    this.addCommand({
      id: "refresh-tag-index",
      name: this.labels.commands.refreshTagIndex,
      callback: () => {
        void this.refreshTagIndex();
      }
    });

    this.addCommand({
      id: "show-tag-index-summary",
      name: this.labels.commands.showTagIndexSummary,
      callback: () => {
        this.showTagIndexSummary();
      }
    });

    this.addCommand({
      id: "analyze-tag-health",
      name: this.labels.commands.analyzeTagHealth,
      callback: () => {
        void this.analyzeTagHealth();
      }
    });

    this.addCommand({
      id: "suggest-tags-for-current-note",
      name: this.labels.commands.suggestTagsForCurrentNote,
      callback: () => {
        void this.suggestTagsForCurrentNote();
      }
    });

    this.addCommand({
      id: "undo-last-tag-curator-change",
      name: this.labels.commands.undoLastChangeForCurrentNote,
      callback: () => {
        void this.undoLastChangeForCurrentNote();
      }
    });

    this.addCommand({
      id: "suggest-tags-for-folder",
      name: this.labels.commands.suggestTagsForFolder,
      callback: () => {
        void this.suggestTagsForFolder();
      }
    });

    this.addCommand({
      id: "undo-last-folder-batch",
      name: this.labels.commands.undoLastFolderBatch,
      callback: () => {
        this.reportFailure(this.undoLatestFolderBatch());
      }
    });

    this.addCommand({
      id: "handle-unfinished-tag-operation",
      name: this.labels.commands.handleUnfinishedTagOperation,
      callback: () => {
        this.openUnfinishedMutation();
      }
    });

    const unresolved = this.operationLog.latestUnresolvedBatch();
    if (unresolved && !this.loadError) {
      const reconciliation = await this.folderBatchRecoveryService.reconcileInterruptedBatch();
      if (reconciliation.status === "recoveryRequired") {
        new Notice(this.labels.notices.unresolvedBatchBlocked);
        this.openFolderBatchResult(reconciliation);
      }
    }

    const unresolvedCleanup = this.operationLog.latestUnresolvedCleanup();
    if (unresolvedCleanup && !this.loadError) {
      const reconciliation = await this.cleanupRecoveryService.reconcileInterruptedCleanup();
      if (reconciliation.status === "recoveryRequired") {
        new Notice(this.labels.cleanupReview.unresolvedMutationBlocked);
        this.openCleanupResult(reconciliation);
      }
    }

    if (this.settings.refreshIndexOnLoad) {
      void this.refreshTagIndex(false);
    }
  }

  async loadPluginData(): Promise<void> {
    this.managementService?.invalidateHistory();
    const data = (await this.loadData()) as PluginData | null;
    this.preservedPluginData = data;
    this.settings = mergeSettings(data?.settings);
    this.operationLog = new OperationLog(data?.operations === undefined ? [] : data.operations, data?.receipts === undefined ? [] : data.receipts);
    try {
      this.mutationPolicy = parsePolicy(data?.tagMutationPolicy);
      this.managementScope = normalizeScope(data?.managementScope);
      if (this.operationLog.validationErrors.length) throw new Error(this.operationLog.validationErrors.join("; "));
      const unresolvedCount = this.operationLog.toJSON().filter((record) => (isBatchRecord(record) || isCleanupV2Record(record)) && record.status !== "applied").length;
      if (unresolvedCount > 1) throw new Error("Multiple unfinished operations. Resolve the stored history before writing.");
      this.operationLog.enforceRetention(this.settings.operationLogLimit);
      this.retainedLogLimit = this.settings.operationLogLimit;
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : "Invalid stored tag management data.";
      this.coordinator.block(this.loadError);
    }
    this.tagIndex = data?.tagIndex;
    this.healthAiAnalysisCache = data?.healthAiAnalysisCache;
  }

  async savePluginData(): Promise<void> {
    this.managementService?.invalidateHistory();
    if (this.loadError) throw new Error(this.loadError);
    if (this.retainedLogLimit !== this.settings.operationLogLimit) {
      this.operationLog.enforceRetention(this.settings.operationLogLimit);
      this.retainedLogLimit = this.settings.operationLogLimit;
    }
    if (this.indexService && this.indexedInlineSetting !== this.settings.readInlineTags) {
      this.indexedInlineSetting = this.settings.readInlineTags;
      this.indexService.markStale();
      this.healthAiAnalysisCache = undefined;
    }
    await this.dataStore.save();
    this.notifyManagement();
  }

  refreshLabels(): void {
    this.uiLanguage = resolveUiLanguage(this.settings.uiLanguage, getLanguage());
    this.labels = getLabels(this.uiLanguage);
  }

  private async refreshTagIndex(showNotice = true): Promise<void> {
    const loading = showNotice
      ? new LoadingModal(
          this.app,
          this.labels.loading.refreshTitle,
          this.labels.loading.refreshMessage,
          this.labels.loading.minimize,
          this.labels.loading.expand
        )
      : null;

    try {
      loading?.open();
      this.tagIndex = await this.buildAndSaveTagIndex();

      if (showNotice) {
        new Notice(this.labels.notices.indexed(Object.keys(this.tagIndex.tags).length));
        new TagIndexSummaryModal(this.app, this.tagIndex, this.labels).open();
      }
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.notices.refreshFailed);
    } finally {
      loading?.close();
    }
  }

  private showTagIndexSummary(): void {
    if (!this.tagIndex) {
      new Notice(this.labels.notices.noTagIndex);
      return;
    }

    new TagIndexSummaryModal(this.app, this.tagIndex, this.labels).open();
  }

  private async analyzeTagHealth(): Promise<void> {
    try {
      const policyRevision = this.mutationPolicy.revision;
      const index = await this.ensureFreshIndex();
      this.tagIndex = index;
      const report = analyzeTagHealth(index);
      const freshness = this.indexService.getSnapshot();
      const scopeRevision = this.managementScopeRevision;
      const context: ReviewContext = { origin: "health", indexRevision: freshness.revision, vaultRevision: freshness.vaultRevision,
        policyRevision, scope: defaultTagScope(), candidatePaths: [] };
      const cleanupPlan = buildCleanupPlan(report, index);
      const latestCleanup = this.operationLog.latestCleanup() ?? null;
      const cachedAnalysis = this.getHealthAiAnalysisCache(report.indexUpdatedAt);
      new TagHealthReportModal(
        this.app,
        report,
        cleanupPlan,
        this.labels,
        async () => {
          this.assertCurrentPolicy(policyRevision);
          const providerIssue = this.getProviderConfigIssue();
          if (providerIssue) {
            throw new Error(this.providerConfigNotice(providerIssue));
          }

          const timer = this.settings.devMode ? new OperationTimer() : null;
          timer?.startStage("prepare-ai-health-context");
          const provider = createAiProvider(this.settings);
          const analyzer = new TagHealthAiAnalyzer(provider, {
            allowNewTags: this.settings.allowNewTags,
            newTagStrictness: this.settings.newTagStrictness,
            uiLanguage: this.uiLanguage,
            promptProfile: this.settings.promptProfile
          });
          timer?.endStage("prepare-ai-health-context");

          timer?.startStage("request-ai-health-analysis");
          const analysis = await analyzer.analyze(report, index);
          this.assertCurrentPolicy(policyRevision);
          timer?.endStage("request-ai-health-analysis");
          const analyzedAt = new Date().toISOString();
          this.healthAiAnalysisCache = {
            analysis,
            analyzedAt,
            indexUpdatedAt: report.indexUpdatedAt
          };
          await this.savePluginData();

          return {
            analysis,
            analyzedAt,
            timingReport: timer?.finish() ?? null
          };
        },
        {
          latestCleanupRecord: latestCleanup,
          reviewCleanupItem: (item) => {
            try {
              this.assertReviewContext(context, scopeRevision);
              void this.reviewCleanupItem(item, { ...context, candidatePaths: item.files.map(file => file.path) }, scopeRevision)
                .catch(error => new Notice(error instanceof Error ? error.message : this.labels.notices.updateFailed));
            } catch (error) { new Notice(error instanceof Error ? error.message : this.labels.notices.updateFailed); }
          },
          undoLatestCleanup: () => latestCleanup ? this.runHistoryAction(latestCleanup.id, false) : this.undoLatestCleanup()
        },
        cachedAnalysis
      ).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.notices.refreshFailed);
    }
  }

  private async suggestTagsForCurrentNote(): Promise<void> {
    if (this.currentNoteRecommendationJob) {
      this.currentNoteRecommendationJob.progress.reveal();
      new Notice(this.labels.notices.suggestAlreadyRunning);
      return;
    }

    const file = this.vaultReader.getCurrentMarkdownFile();
    if (!file) {
      new Notice(this.labels.notices.openMarkdownForSuggest);
      return;
    }
    if (pathExcluded(file.path, this.mutationPolicy)) {
      new Notice(this.uiLanguage === "zh-CN" ? "当前笔记位于排除目录中。" : "The current note is in an excluded folder.");
      return;
    }
    const policyRevision = this.mutationPolicy.revision;

    const providerIssue = this.getProviderConfigIssue();
    if (providerIssue) {
      new Notice(this.providerConfigNotice(providerIssue));
      return;
    }
    if (this.blockWriteForUnresolvedMutation()) return;

    let cancelRequested = false;
    const progress = new CurrentNoteRecommendationProgressModal(this.app, this.labels, this.settings.model, () => {
      cancelRequested = true;
      new Notice(this.labels.notices.suggestCancelAccepted);
    });
    const job: CurrentNoteRecommendationJob = {
      isCancelled: () => cancelRequested,
      progress
    };
    this.currentNoteRecommendationJob = job;
    job.progress.open();

    try {
      const timer = this.settings.devMode ? new OperationTimer() : null;
      new Notice(this.labels.notices.suggestStarted);

      job.progress.updateStage("read-current-note");
      timer?.startStage("read-current-note");
      const currentNote = await this.vaultReader.readNote(file);
      const tagValueSnapshot = captureTagValueSnapshot(currentNote.content);
      assertWritableTagValue(tagValueSnapshot);
      timer?.endStage("read-current-note");
      if (job.isCancelled()) {
        return;
      }

      job.progress.updateStage("prepare-tag-index");
      timer?.startStage("prepare-tag-index");
      const index = await this.ensureFreshIndex();
      this.tagIndex = index;
      timer?.endStage("prepare-tag-index");
      if (job.isCancelled()) {
        return;
      }

      const provider = createAiProvider(this.settings);
      this.assertCurrentPolicy(policyRevision);
      const service = new TagRecommendationService(provider, this.settings, this.uiLanguage);
      job.progress.updateStage("request-ai-recommendations");
      timer?.startStage("request-ai-recommendations");
      let result: RecommendationResult | null = null;
      try {
        result = await service.recommendForNote(currentNote, index);
      } catch (error) {
        if (!job.isCancelled()) {
          const message = error instanceof Error ? error.message : this.labels.notices.suggestFailed;
          result = {
            notePath: currentNote.path,
            existingTags: currentNote.frontmatterTags,
            frontmatterTags: currentNote.frontmatterTags,
            inlineTags: currentNote.inlineTags,
            allTags: currentNote.allTags,
            sourceContentHash: currentNote.sourceContentHash,
            recommendations: [],
            warnings: [this.labels.recommendations.aiFailed(message)],
            aiError: message
          };
        }
      }
      timer?.endStage("request-ai-recommendations");
      if (job.isCancelled() || result === null) {
        return;
      }
      this.assertCurrentPolicy(policyRevision);
      result.tagValueSnapshot = tagValueSnapshot;
      result.recommendations = result.recommendations.filter((candidate) => !isProtectedTag(candidate.tag, this.mutationPolicy));
      result.blockedTags = currentNote.inlineTags.filter((tag) => isProtectedTag(tag, this.mutationPolicy));

      const hasUnsyncedInlineTags = currentNote.inlineTags.some((tag) => !currentNote.frontmatterTags.includes(tag));
      if (result.recommendations.length === 0 && !hasUnsyncedInlineTags) {
        if (result.aiError) {
          throw new Error(result.aiError);
        }
        new Notice(this.labels.notices.noRecommendations);
        return;
      }

      new RecommendationModal(this.app, result, this.labels, timer?.finish() ?? null, async (plan) => {
        this.assertCurrentPolicy(policyRevision);
        if (this.blockWriteForUnresolvedMutation()) {
          throw new Error(this.labels.cleanupReview.unresolvedMutationBlocked);
        }
        await this.coordinator.run(async () => {
          this.assertCurrentPolicy(policyRevision);
          assertTagChangesAllowed(file.path, plan.beforeTags, plan.afterTags, this.mutationPolicy);
          const batch = createFolderBatchPlan({ folderPath: file.parent?.path ?? "", includeSubfolders: false,
            filePaths: [file.path], index, settings: this.settings, uiLanguage: this.uiLanguage, origin: "recommendation", policyRevision });
          const executor = new FolderBatchExecutor({ findFile: path => this.vaultReader.getMarkdownFileByPath(path), writer: this.frontmatterWriter,
            operationLog: this.operationLog, persist: () => this.savePluginData(), refreshIndex: () => this.refreshDerivedStateAfterFolderBatch() });
          const outcome = await executor.execute(batch, [plan], this.settings.operationLogLimit);
          if (outcome.status !== "applied") {
            this.openFolderBatchResult(outcome);
            throw new Error(outcome.error ?? this.labels.notices.updateFailed);
          }
        });
      }).open();
    } catch (error) {
      if (!job.isCancelled()) {
        new Notice(error instanceof Error ? error.message : this.labels.notices.suggestFailed);
      }
    } finally {
      job.progress.finish();
      if (this.currentNoteRecommendationJob === job) {
        this.currentNoteRecommendationJob = null;
      }
    }
  }

  /** Enforces entry prerequisites before opening a scope UI that remains read/request free until confirmation. */
  private async suggestTagsForFolder(): Promise<void> {
    const defaultFolderPath = this.vaultReader.getCurrentFolderPath();
    if (defaultFolderPath === null) {
      new Notice(this.labels.notices.openMarkdownForFolderBatch);
      return;
    }
    const providerIssue = this.getProviderConfigIssue();
    if (providerIssue) {
      new Notice(this.providerConfigNotice(providerIssue));
      return;
    }
    if (this.blockWriteForUnresolvedMutation()) return;

    new FolderBatchScopeModal(
      this.app,
      this.vaultReader,
      defaultFolderPath,
      this.settings.maxFolderBatchFiles,
      true,
      this.labels,
      this.folderBatchProviderNotice(),
      (scope) => {
        void this.generateFolderBatch(scope);
      }
    ).open();
  }

  /** Freezes settings and the vault index once, then hands all per-note work to the bounded runner. */
  private async generateFolderBatch(scope: FolderBatchScopeViewModel): Promise<void> {
    try {
      const policyRevision = this.mutationPolicy.revision;
      const frozenSettings: TagCuratorSettings = { ...this.settings };
      const index = await this.ensureFreshIndex();
      const provider = createAiProvider(frozenSettings);
      const service = new TagRecommendationService(provider, frozenSettings, this.uiLanguage);
      const batchPlan = createFolderBatchPlan({
        folderPath: scope.folderPath,
        includeSubfolders: scope.includeSubfolders,
        filePaths: scope.filePaths.filter((path) => !pathExcluded(path, this.mutationPolicy)),
        index,
        settings: frozenSettings,
        uiLanguage: this.uiLanguage
      });
      batchPlan.policyRevision = policyRevision;
      if (batchPlan.filePaths.length === 0) throw new Error("No eligible notes in this scope.");
      const runner = new FolderBatchRecommendationRunner(
        {
          readNote: (path) => {
            this.assertCurrentPolicy(policyRevision);
            return this.vaultReader.readNoteByPath(path);
          },
          recommendForNote: async (note, frozenIndex) => {
            this.assertCurrentPolicy(policyRevision);
            const result = await service.recommendForNote(note, frozenIndex);
            this.assertCurrentPolicy(policyRevision);
            return { ...result, recommendations: result.recommendations.filter((candidate) => !isProtectedTag(candidate.tag, this.mutationPolicy)) };
          },
          inlineSyncReason: this.labels.recommendations.inlineSyncReason
        },
        getProviderCapabilities(frozenSettings).providerConcurrency
      );
      await this.runFolderBatchGeneration(runner, batchPlan, index, false);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.notices.folderBatchFailed);
    }
  }

  /** Reuses one runner across initial generation and failed-only retry so reviewed selections survive. */
  private async runFolderBatchGeneration(
    runner: FolderBatchRecommendationRunner,
    plan: FolderBatchPlan,
    index: TagIndex,
    retry: boolean
  ): Promise<void> {
    const initial = runner.getSnapshot() ?? buildFolderBatchProgressSnapshot(plan);
    const progress = new FolderBatchProgressModal(this.app, initial, this.labels, () => {
      runner.cancel();
    });
    progress.open();
    let completed: FolderBatchPlan;
    try {
      completed = retry
        ? await runner.retryFailed(index, (snapshot) => progress.update(snapshot), plan)
        : await runner.run(plan, index, (snapshot) => progress.update(snapshot));
    } finally {
      progress.close();
    }
    this.assertCurrentPolicy(plan.policyRevision ?? this.mutationPolicy.revision);
    completed.items.forEach((item) => item.candidates.forEach((candidate) => {
      if (isProtectedTag(candidate.tag, this.mutationPolicy)) {
        candidate.selected = false;
        candidate.executable = false;
        candidate.reason = this.uiLanguage === "zh-CN" ? "标签受保护" : "Protected tag";
      }
    }));
    this.openFolderBatchPreview(completed, runner, index);
  }

  private openFolderBatchPreview(
    plan: FolderBatchPlan,
    runner: FolderBatchRecommendationRunner,
    index: TagIndex
  ): void {
    new FolderBatchPreviewModal(
      this.app,
      plan,
      this.labels,
      (reviewedPlan) => {
        void this.runFolderBatchGeneration(runner, reviewedPlan, index, true);
      },
      async (selectedPlan) => {
        await this.applyFolderBatch(selectedPlan);
      }
    ).open();
  }

  /** Converts current review selections into additive plans and delegates all writes to the transaction executor. */
  private async applyFolderBatch(batchPlan: FolderBatchPlan): Promise<void> {
    if (this.blockWriteForUnresolvedMutation()) return;
    const plans = deriveChangePlans(batchPlan);
    this.assertCurrentPolicy(batchPlan.policyRevision ?? this.mutationPolicy.revision);
    for (const plan of plans) assertTagChangesAllowed(plan.notePath, plan.beforeTags, plan.afterTags, this.mutationPolicy);
    const executor = new FolderBatchExecutor({
      findFile: (path) => this.vaultReader.getMarkdownFileByPath(path),
      writer: this.frontmatterWriter,
      operationLog: this.operationLog,
      persist: () => this.savePluginData(),
      refreshIndex: async () => {
        await this.refreshDerivedStateAfterFolderBatch();
      }
    });
    const result = await this.coordinator.run(() => {
      this.assertCurrentPolicy(batchPlan.policyRevision ?? this.mutationPolicy.revision);
      return executor.execute(batchPlan, plans, this.settings.operationLogLimit);
    });
    if (result.status === "applied") {
      new Notice(
        this.labels.notices.folderBatchApplied(
          plans.length,
          plans.reduce((total, plan) => total + plan.addedTags.length, 0)
        )
      );
    }
    if (result.indexRefreshError) {
      new Notice(this.labels.notices.indexRefreshFailed(result.indexRefreshError));
    }
    this.openFolderBatchResult(result);
  }

  private async undoLatestFolderBatch(): Promise<void> {
    if (this.blockWriteForUnresolvedMutation()) return;
    if (!this.operationLog.latestBatch("applied")) {
      new Notice(this.labels.notices.noFolderBatchUndo);
      return;
    }
    const latest = this.operationLog.latestBatch("applied")!;
    this.requireLatestOperation(latest.id);
    this.announceRecoveryExceptions(latest);
    const result = await this.coordinator.run(() => {
      this.requireLatestOperation(latest.id);
      return this.folderBatchRecoveryService.undoLatestAppliedBatch();
    }, latest.id);
    if (result.status === "removed") {
      new Notice(latest.origin === "recommendation" ? this.labels.notices.undoComplete : this.labels.notices.folderBatchUndone);
    }
    if (result.indexRefreshError) {
      new Notice(this.labels.notices.indexRefreshFailed(result.indexRefreshError));
    }
    if (latest.origin !== "recommendation" || result.status !== "removed") this.openFolderBatchResult(result);
  }

  private async retryFolderBatchRecovery(record: BatchOperationRecord): Promise<void> {
    if (this.blockRecoveryBehindDifferentMutation(record.id)) return;
    this.announceRecoveryExceptions(record);
    const result = await this.coordinator.run(() => this.folderBatchRecoveryService.retryRecovery(record), record.id);
    if (result.indexRefreshError) {
      new Notice(this.labels.notices.indexRefreshFailed(result.indexRefreshError));
    }
    this.openFolderBatchResult(result);
  }

  private openFolderBatchResult(result: FolderBatchExecutionResult | FolderBatchRecoveryResult): void {
    new FolderBatchResultModal(
      this.app,
      result,
      this.labels,
      () => {
        if (result.record) this.reportFailure(this.runHistoryAction(result.record.id, false));
      },
      (record) => {
        this.reportFailure(this.runHistoryAction(record.id, true));
      }
    ).open();
  }

  private async buildAndSaveTagIndex(): Promise<TagIndex> {
    const index = await this.indexService.refresh();
    if (!index) throw new Error(this.indexService.getSnapshot().error ?? (this.uiLanguage === "zh-CN" ? "索引未完成或已过期，请重新刷新。" : "Index refresh was cancelled or became stale. Refresh again."));
    return index;
  }

  private async ensureFreshIndex(): Promise<TagIndex> {
    const snapshot = this.indexService.getSnapshot();
    return snapshot.state === "ready" && snapshot.index ? snapshot.index : this.buildAndSaveTagIndex();
  }

  /** Invalidates derived health data before rebuilding the index, even when the rebuild itself later fails. */
  private async refreshDerivedStateAfterFolderBatch(): Promise<void> {
    this.healthAiAnalysisCache = undefined;
    await this.savePluginData();
    await this.buildAndSaveTagIndex();
  }

  private getHealthAiAnalysisCache(indexUpdatedAt: string): CachedTagHealthAiAnalysis | null {
    if (this.healthAiAnalysisCache?.indexUpdatedAt !== indexUpdatedAt) {
      return null;
    }

    return this.healthAiAnalysisCache;
  }

  private getProviderConfigIssue(): ProviderConfigIssue | null {
    const state = validateProviderSettings(this.settings);
    return state.ok ? null : state.issue;
  }

  private providerConfigNotice(issue: ProviderConfigIssue): string {
    switch (issue) {
      case "missing-api-key":
        return this.labels.notices.configureApiKey;
      case "missing-base-url":
        return this.labels.notices.configureProviderBaseUrl;
      case "invalid-base-url":
        return this.labels.notices.configureProviderInvalidBaseUrl;
      case "missing-model":
        return this.labels.notices.configureProviderModel;
    }
  }

  private folderBatchProviderNotice(): string {
    const endpoint = describeProviderEndpoint(this.settings);
    if (endpoint.boundary === "loopback") {
      return this.labels.folderBatch.providerNoticeLoopback(endpoint.host);
    }
    if (endpoint.boundary === "remote") {
      return this.labels.folderBatch.providerNoticeRemote(endpoint.host);
    }
    return this.labels.folderBatch.providerNoticeCustom(endpoint.host);
  }

  private async undoLastChangeForCurrentNote(): Promise<void> {
    const file = this.vaultReader.getCurrentMarkdownFile();
    if (!file) {
      new Notice(this.labels.notices.openMarkdownForUndo);
      return;
    }

    const latest = this.operationLog.toJSON()[0];
    if (latest && isBatchRecord(latest) && latest.origin === "recommendation" && latest.files.some(change => change.notePath === file.path)) {
      try { await this.runHistoryAction(latest.id, false); }
      catch (error) { new Notice(error instanceof Error ? error.message : this.labels.notices.undoFailed); }
      return;
    }
    const record = this.operationLog.latestForPath(file.path);
    if (!record) {
      new Notice(this.labels.notices.noUndoRecord);
      return;
    }
    if (this.blockWriteForUnresolvedMutation()) return;

    try {
      const undoService = new UndoService(this.frontmatterWriter);
      const target = this.app.vault.getAbstractFileByPath(record.plan.notePath);
      if (!(target instanceof TFile)) {
        new Notice(this.labels.notices.noteMissing);
        return;
      }

      this.requireLatestOperation(record.id);
      this.announceRecoveryExceptions(record);
      await this.coordinator.run(() => this.operationLog.runMutation(async () => {
        this.requireLatestOperation(record.id);
        await undoService.undo(target, record.plan);
        await this.operationLog.removeAndPersist(record.id, () => this.savePluginData());
      }), record.id);
      new Notice(this.labels.notices.undoComplete);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.notices.undoFailed);
    }
  }

  private async reviewCleanupItem(item: CleanupPlanItem, context?: ReviewContext, scopeRevision = this.managementScopeRevision): Promise<void> {
    if (item.capability.availability !== "executable") {
      throw new Error(this.labels.health.cleanupPlan.notApplyReady);
    }
    const policyRevision = this.mutationPolicy.revision;
    if (item.tags.some((tag) => isProtectedTag(tag, this.mutationPolicy)) || (item.targetTag && isProtectedTag(item.targetTag, this.mutationPolicy))) {
      throw new Error(this.uiLanguage === "zh-CN" ? "此操作涉及受保护标签。" : "This operation involves protected tags.");
    }
    item = { ...item, files: item.files.filter((file) => !pathExcluded(file.path, this.mutationPolicy)) };
    const builder = new CleanupReviewPlanBuilder({
      readOccurrences: async (notePath, relevantTags) => {
        const file = this.vaultReader.getMarkdownFileByPath(notePath);
        if (!file) throw new Error(`${this.labels.cleanupReview.conflictMissing}: ${notePath}`);
        return this.vaultReader.readInlineTagOccurrences(file, relevantTags);
      }
    });
    const total = new Set(item.files.map((file) => file.path)).size;
    const progress = new CleanupReviewProgressModal(
      this.app,
      { total, completed: 0, ready: 0, unavailable: 0, failed: 0, cancelled: 0 },
      this.labels,
      () => builder.cancel()
    );
    progress.open();
    try {
      const plan = await builder.build(item, (snapshot) => progress.update(snapshot));
      if (context) { this.assertReviewContext(context, scopeRevision); plan.context = context; }
      this.assertCurrentPolicy(policyRevision);
      progress.close();
      if (plan.cancelled) return;
      new CleanupReviewModal(this.app, plan, this.labels, async (selected) => {
        this.assertCurrentPolicy(policyRevision);
        if (context) this.assertReviewContext(context, scopeRevision);
        if (this.blockWriteForUnresolvedMutation()) {
          throw new Error(this.labels.cleanupReview.unresolvedMutationBlocked);
        }
        const executor = new CleanupExecutor({
          findFile: (path) => this.vaultReader.getMarkdownFileByPath(path),
          inlineWriter: this.inlineTagWriter,
          frontmatterWriter: this.frontmatterWriter,
          operationLog: this.operationLog,
          persist: () => this.savePluginData(),
          validateContext: selected => {
            this.assertCurrentPolicy(policyRevision);
            if (context) {
              this.assertReviewContext(context, scopeRevision);
              if (selected.files.some(file => !context.candidatePaths.includes(file.notePath))) throw new Error("Review paths changed.");
            }
          },
          refreshIndex: async () => {
            await this.refreshDerivedStateAfterFolderBatch();
          }
        });
        const result = await this.coordinator.run(() => {
          this.assertCurrentPolicy(policyRevision);
          if (context) this.assertReviewContext(context, scopeRevision);
          return executor.execute(selected, this.settings.operationLogLimit);
        });
        if (result.status === "applied") {
          new Notice(this.labels.health.cleanupPlan.cleanupApplied(result.record?.files.length ?? selected.fileCount));
        }
        this.openCleanupResult(result);
      }, plan => this.reviewSkipNotes(plan, 0)).open();
    } catch (error) {
      progress.close();
      new Notice(error instanceof Error ? error.message : this.labels.notices.updateFailed);
    }
  }

  private async undoLatestCleanup(): Promise<void> {
    const record = this.operationLog.latestCleanup();
    if (!record) {
      throw new Error(this.labels.health.cleanupPlan.noCleanupUndoRecord);
    }

    if (this.blockWriteForUnresolvedMutation()) return;

    this.requireLatestOperation(record.id);

    if (isCleanupV2Record(record)) {
      this.announceRecoveryExceptions(record);
      const result = await this.coordinator.run(() => {
        this.requireLatestOperation(record.id);
        return this.cleanupRecoveryService.undoLatestAppliedCleanup();
      }, record.id);
      if (result.status === "removed") new Notice(this.labels.health.cleanupPlan.cleanupUndone);
      this.openCleanupResult(result);
      return;
    }

    if (!isLegacyCleanupRecord(record)) {
      throw new Error(this.labels.health.cleanupPlan.noCleanupUndoRecord);
    }
    throw new Error(this.uiLanguage === "zh-CN" ? "旧清理记录缺少可恢复事务证据，仅支持查看。" : "Legacy cleanup has no recoverable transaction evidence and is read-only.");
  }

  private async retryCleanupRecovery(record: CleanupOperationRecordV2): Promise<void> {
    if (this.blockRecoveryBehindDifferentMutation(record.id)) return;
    this.announceRecoveryExceptions(record);
    const result = await this.coordinator.run(() => this.cleanupRecoveryService.retryRecovery(record), record.id);
    this.openCleanupResult(result);
  }

  private openCleanupResult(result: CleanupExecutionResult | CleanupRecoveryResult): void {
    new CleanupResultModal(
      this.app,
      result,
      this.labels,
      () => {
        if (result.record) this.reportFailure(this.runHistoryAction(result.record.id, false));
      },
      (record) => {
        this.reportFailure(this.runHistoryAction(record.id, true));
      }
    ).open();
  }

  private openUnfinishedMutation(): void {
    const unresolved = this.operationLog.latestUnresolvedMutation();
    if (!unresolved) {
      new Notice(this.labels.cleanupReview.noResult);
      return;
    }
    if (isBatchRecord(unresolved)) {
      this.openFolderBatchResult({ status: "recoveryRequired", record: unresolved, files: unresolved.files });
      return;
    }
    this.openCleanupResult({ status: "recoveryRequired", record: unresolved, files: unresolved.files });
  }

  private blockWriteForUnresolvedMutation(): boolean {
    if (this.coordinator.error || this.coordinator.busy) {
      new Notice(this.coordinator.error ?? (this.uiLanguage === "zh-CN" ? "另一项标签操作正在执行。" : "Another tag operation is running."));
      return true;
    }
    if (this.operationLog.isMutationRunning) {
      new Notice(this.labels.cleanupReview.mutationInProgress);
      return true;
    }
    const unresolved = this.operationLog.latestUnresolvedMutation();
    if (!unresolved) return false;
    if (isBatchRecord(unresolved)) {
      new Notice(this.labels.notices.unresolvedBatchBlocked);
      this.openFolderBatchResult({ status: "recoveryRequired", record: unresolved, files: unresolved.files });
    } else {
      new Notice(this.labels.cleanupReview.unresolvedMutationBlocked);
      this.openCleanupResult({ status: "recoveryRequired", record: unresolved, files: unresolved.files });
    }
    return true;
  }

  private blockRecoveryBehindDifferentMutation(recordId: string): boolean {
    if (this.operationLog.isMutationRunning) return this.blockWriteForUnresolvedMutation();
    const unresolved = this.operationLog.latestUnresolvedMutation();
    if (!unresolved || unresolved.id === recordId) return false;
    return this.blockWriteForUnresolvedMutation();
  }
}
