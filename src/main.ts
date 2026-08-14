// Obsidian plugin entry point that wires settings, commands, indexing, AI, preview, and undo.
import { getLanguage, Notice, Plugin, TFile } from "obsidian";
import { OpenAICompatibleProvider } from "./ai/OpenAICompatibleProvider";
import type { CleanupPlanItem } from "./cleanup/CleanupPlan";
import { buildCleanupPlan } from "./cleanup/CleanupPlanBuilder";
import { applyCleanupPreviewToFrontmatterTags } from "./cleanup/CleanupTagTransform";
import { TagRecommendationService } from "./recommendations/TagRecommendationService";
import type { CachedTagHealthAiAnalysis } from "./health/TagHealthAiAnalysis";
import { TagHealthAiAnalyzer } from "./health/TagHealthAiAnalyzer";
import { analyzeTagHealth } from "./health/TagHealthAnalyzer";
import { buildTagIndex } from "./index/TagIndexBuilder";
import type { TagIndex } from "./index/TagIndex";
import { FrontmatterWriter } from "./obsidian/FrontmatterWriter";
import { VaultReader } from "./obsidian/VaultReader";
import { OperationLog, type CleanupOperationRecord, type OperationRecord } from "./operations/OperationLog";
import { UndoService } from "./operations/UndoService";
import { RecommendationModal } from "./preview/RecommendationModal";
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
}

export default class TagCuratorPlugin extends Plugin {
  settings: TagCuratorSettings = { ...DEFAULT_SETTINGS };
  uiLanguage: UiLanguage = "en";
  labels = getLabels("en");
  private vaultReader!: VaultReader;
  private frontmatterWriter!: FrontmatterWriter;
  private operationLog = new OperationLog();
  private tagIndex: TagIndex | undefined;
  private healthAiAnalysisCache: CachedTagHealthAiAnalysis | undefined;
  private folderBatchRecoveryService!: FolderBatchRecoveryService;

  async onload(): Promise<void> {
    await this.loadPluginData();
    this.refreshLabels();

    this.vaultReader = new VaultReader(this.app);
    this.frontmatterWriter = new FrontmatterWriter(this.app);
    this.folderBatchRecoveryService = new FolderBatchRecoveryService({
      findFile: (path) => this.vaultReader.getMarkdownFileByPath(path),
      writer: this.frontmatterWriter,
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
        void this.undoLatestFolderBatch();
      }
    });

    const unresolved = this.operationLog.latestUnresolvedBatch();
    if (unresolved) {
      const reconciliation = await this.folderBatchRecoveryService.reconcileInterruptedBatch();
      if (reconciliation.status === "recoveryRequired") {
        new Notice(this.labels.notices.unresolvedBatchBlocked);
        this.openFolderBatchResult(reconciliation);
      }
    }

    if (this.settings.refreshIndexOnLoad) {
      void this.refreshTagIndex(false);
    }
  }

  async loadPluginData(): Promise<void> {
    const data = (await this.loadData()) as PluginData | null;
    this.settings = mergeSettings(data?.settings);
    this.operationLog = new OperationLog(data?.operations ?? []);
    this.tagIndex = data?.tagIndex;
    this.healthAiAnalysisCache = data?.healthAiAnalysisCache;
  }

  async savePluginData(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      operations: this.operationLog.toJSON(),
      tagIndex: this.tagIndex,
      healthAiAnalysisCache: this.healthAiAnalysisCache
    } satisfies PluginData);
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
      const notes = await this.vaultReader.readAllMarkdownNotes();
      this.tagIndex = buildTagIndex(notes, new Date(), {
        includeInlineTags: this.settings.readInlineTags
      });
      this.healthAiAnalysisCache = undefined;
      await this.savePluginData();

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
      const index = this.tagIndex ?? (await this.buildAndSaveTagIndex());
      this.tagIndex = index;
      const report = analyzeTagHealth(index);
      const cleanupPlan = buildCleanupPlan(report, index);
      const cachedAnalysis = this.getHealthAiAnalysisCache(report.indexUpdatedAt);
      new TagHealthReportModal(
        this.app,
        report,
        cleanupPlan,
        this.labels,
        async () => {
          if (!this.settings.apiKey) {
            throw new Error(this.labels.notices.configureApiKey);
          }

          const timer = this.settings.devMode ? new OperationTimer() : null;
          timer?.startStage("prepare-ai-health-context");
          const provider = new OpenAICompatibleProvider(this.settings);
          const analyzer = new TagHealthAiAnalyzer(provider, {
            allowNewTags: this.settings.allowNewTags,
            newTagStrictness: this.settings.newTagStrictness,
            uiLanguage: this.uiLanguage
          });
          timer?.endStage("prepare-ai-health-context");

          timer?.startStage("request-ai-health-analysis");
          const analysis = await analyzer.analyze(report, index);
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
          latestCleanupRecord: this.operationLog.latestCleanup() ?? null,
          applyCleanupItem: (item) => this.applyCleanupItem(item),
          undoLatestCleanup: () => this.undoLatestCleanup()
        },
        cachedAnalysis
      ).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.notices.refreshFailed);
    }
  }

  private async suggestTagsForCurrentNote(): Promise<void> {
    const file = this.vaultReader.getCurrentMarkdownFile();
    if (!file) {
      new Notice(this.labels.notices.openMarkdownForSuggest);
      return;
    }

    if (!this.settings.apiKey.trim()) {
      new Notice(this.labels.notices.configureApiKey);
      return;
    }

    try {
      const timer = this.settings.devMode ? new OperationTimer() : null;
      new Notice(this.labels.notices.suggestStarted);

      timer?.startStage("read-current-note");
      const currentNote = await this.vaultReader.readNote(file);
      timer?.endStage("read-current-note");

      timer?.startStage("prepare-tag-index");
      const index = this.tagIndex ?? (await this.buildAndSaveTagIndex());
      this.tagIndex = index;
      timer?.endStage("prepare-tag-index");

      const provider = new OpenAICompatibleProvider(this.settings);
      const service = new TagRecommendationService(provider, this.settings, this.uiLanguage);
      timer?.startStage("request-ai-recommendations");
      let result;
      try {
        result = await service.recommendForNote(currentNote, index);
      } catch (error) {
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
      timer?.endStage("request-ai-recommendations");

      const hasUnsyncedInlineTags = currentNote.inlineTags.some((tag) => !currentNote.frontmatterTags.includes(tag));
      if (result.recommendations.length === 0 && !hasUnsyncedInlineTags) {
        if (result.aiError) {
          throw new Error(result.aiError);
        }
        new Notice(this.labels.notices.noRecommendations);
        return;
      }

      new RecommendationModal(this.app, result, this.labels, timer?.finish() ?? null, async (plan) => {
        await this.frontmatterWriter.applyChangePlan(file, plan);
        this.operationLog.add(plan, this.settings.operationLogLimit);
        await this.savePluginData();
      }).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.notices.suggestFailed);
    }
  }

  /** Enforces entry prerequisites before opening a scope UI that remains read/request free until confirmation. */
  private async suggestTagsForFolder(): Promise<void> {
    const defaultFolderPath = this.vaultReader.getCurrentFolderPath();
    if (defaultFolderPath === null) {
      new Notice(this.labels.notices.openMarkdownForFolderBatch);
      return;
    }
    if (!this.settings.apiKey.trim()) {
      new Notice(this.labels.notices.configureApiKey);
      return;
    }
    const unresolved = this.operationLog.latestUnresolvedBatch();
    if (unresolved) {
      new Notice(this.labels.notices.unresolvedBatchBlocked);
      this.openFolderBatchResult({ status: "recoveryRequired", record: unresolved, files: unresolved.files });
      return;
    }

    new FolderBatchScopeModal(
      this.app,
      this.vaultReader,
      defaultFolderPath,
      this.settings.maxFolderBatchFiles,
      true,
      this.labels,
      (scope) => {
        void this.generateFolderBatch(scope);
      }
    ).open();
  }

  /** Freezes settings and the vault index once, then hands all per-note work to the bounded runner. */
  private async generateFolderBatch(scope: FolderBatchScopeViewModel): Promise<void> {
    try {
      const frozenSettings: TagCuratorSettings = { ...this.settings };
      const index = this.tagIndex ?? (await this.buildAndSaveTagIndex());
      const provider = new OpenAICompatibleProvider(frozenSettings);
      const service = new TagRecommendationService(provider, frozenSettings, this.uiLanguage);
      const batchPlan = createFolderBatchPlan({
        folderPath: scope.folderPath,
        includeSubfolders: scope.includeSubfolders,
        filePaths: scope.filePaths,
        index,
        settings: frozenSettings,
        uiLanguage: this.uiLanguage
      });
      const runner = new FolderBatchRecommendationRunner({
        readNote: (path) => this.vaultReader.readNoteByPath(path),
        recommendForNote: (note, frozenIndex) => service.recommendForNote(note, frozenIndex),
        inlineSyncReason: this.labels.recommendations.inlineSyncReason
      });
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
    const unresolved = this.operationLog.latestUnresolvedBatch();
    if (unresolved) {
      new Notice(this.labels.notices.unresolvedBatchBlocked);
      this.openFolderBatchResult({ status: "recoveryRequired", record: unresolved, files: unresolved.files });
      return;
    }
    const plans = deriveChangePlans(batchPlan);
    const executor = new FolderBatchExecutor({
      findFile: (path) => this.vaultReader.getMarkdownFileByPath(path),
      writer: this.frontmatterWriter,
      operationLog: this.operationLog,
      persist: () => this.savePluginData(),
      refreshIndex: async () => {
        await this.refreshDerivedStateAfterFolderBatch();
      }
    });
    const result = await executor.execute(batchPlan, plans, this.settings.operationLogLimit);
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
    const unresolved = this.operationLog.latestUnresolvedBatch();
    if (unresolved) {
      new Notice(this.labels.notices.unresolvedBatchBlocked);
      this.openFolderBatchResult({ status: "recoveryRequired", record: unresolved, files: unresolved.files });
      return;
    }
    if (!this.operationLog.latestBatch("applied")) {
      new Notice(this.labels.notices.noFolderBatchUndo);
      return;
    }
    const result = await this.folderBatchRecoveryService.undoLatestAppliedBatch();
    if (result.status === "removed") {
      new Notice(this.labels.notices.folderBatchUndone);
    }
    if (result.indexRefreshError) {
      new Notice(this.labels.notices.indexRefreshFailed(result.indexRefreshError));
    }
    this.openFolderBatchResult(result);
  }

  private async retryFolderBatchRecovery(record: BatchOperationRecord): Promise<void> {
    const result = await this.folderBatchRecoveryService.retryRecovery(record);
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
        void this.undoLatestFolderBatch();
      },
      (record) => {
        void this.retryFolderBatchRecovery(record);
      }
    ).open();
  }

  private async buildAndSaveTagIndex(): Promise<TagIndex> {
    const notes = await this.vaultReader.readAllMarkdownNotes();
    const index = buildTagIndex(notes, new Date(), {
      includeInlineTags: this.settings.readInlineTags
    });
    this.tagIndex = index;
    this.healthAiAnalysisCache = undefined;
    await this.savePluginData();
    return index;
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

  private async undoLastChangeForCurrentNote(): Promise<void> {
    const file = this.vaultReader.getCurrentMarkdownFile();
    if (!file) {
      new Notice(this.labels.notices.openMarkdownForUndo);
      return;
    }

    const record = this.operationLog.latestForPath(file.path);
    if (!record) {
      new Notice(this.labels.notices.noUndoRecord);
      return;
    }

    try {
      const undoService = new UndoService(this.frontmatterWriter);
      const target = this.app.vault.getAbstractFileByPath(record.plan.notePath);
      if (!(target instanceof TFile)) {
        new Notice(this.labels.notices.noteMissing);
        return;
      }

      await undoService.undo(target, record.plan);
      this.operationLog.remove(record.id);
      await this.savePluginData();
      new Notice(this.labels.notices.undoComplete);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.notices.undoFailed);
    }
  }

  private async applyCleanupItem(item: CleanupPlanItem): Promise<CleanupOperationRecord> {
    if (item.capability.availability !== "executable") {
      throw new Error(this.labels.health.cleanupPlan.notApplyReady);
    }

    const files: CleanupOperationRecord["files"] = [];

    for (const preview of item.files) {
      const target = this.app.vault.getAbstractFileByPath(preview.path);
      if (!(target instanceof TFile)) {
        continue;
      }

      const change = await this.frontmatterWriter.applyTagTransform(target, (beforeTags) =>
        applyCleanupPreviewToFrontmatterTags(beforeTags, preview)
      );

      if (!sameTagList(change.beforeTags, change.afterTags)) {
        files.push({
          notePath: target.path,
          beforeTags: change.beforeTags,
          afterTags: change.afterTags
        });
      }
    }

    if (files.length === 0) {
      throw new Error(this.labels.health.cleanupPlan.noWritableChanges);
    }

    const record = this.operationLog.addCleanup(
      {
        itemId: item.id,
        title: item.title,
        action: item.action,
        files
      },
      this.settings.operationLogLimit
    );

    await this.buildAndSaveTagIndex();
    return record;
  }

  private async undoLatestCleanup(): Promise<void> {
    const record = this.operationLog.latestCleanup();
    if (!record) {
      throw new Error(this.labels.health.cleanupPlan.noCleanupUndoRecord);
    }

    for (const fileChange of record.files) {
      const target = this.app.vault.getAbstractFileByPath(fileChange.notePath);
      if (!(target instanceof TFile)) {
        throw new Error(this.labels.notices.noteMissing);
      }

      await this.frontmatterWriter.replaceTagsIfCurrent(target, fileChange.afterTags, fileChange.beforeTags);
    }

    this.operationLog.remove(record.id);
    await this.buildAndSaveTagIndex();
  }
}

function sameTagList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((tag, index) => tag === right[index]);
}
