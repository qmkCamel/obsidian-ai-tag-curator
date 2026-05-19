// Shows tag taxonomy health and guarded cleanup actions derived from the report.
import { Modal, Notice } from "obsidian";
import type { CleanupPlan, CleanupPlanFilePreview, CleanupPlanItem } from "../cleanup/CleanupPlan";
import { applyAiAssistanceToCleanupPlan } from "../cleanup/CleanupPlanAiAssistance";
import { buildTagHealthReportViewModel, type HealthActionItemView, type HealthEvidenceSectionView } from "../health/TagHealthReportViewModel";
import type { TagHealthAiAnalysis } from "../health/TagHealthAiAnalysis";
import type { TagHealthIssue, TagHealthIssueType, TagHealthReport } from "../health/TagHealthReport";
import type { CleanupOperationRecord } from "../operations/OperationLog";
import type { getLabels } from "../ui/labels";
import { formatDuration } from "../utils/formatDuration";
import type { OperationStageTiming, OperationTimingReport } from "../utils/OperationTimer";
import { renderClickableTag } from "./ClickableTag";
import { formatHealthAiBadgeClass } from "./HealthAiBadgeClasses";
import { formatTagClipboardText } from "./TagHealthTagActions";

type Labels = ReturnType<typeof getLabels>;
interface TagHealthAiAnalysisResult {
  analysis: TagHealthAiAnalysis;
  timingReport: OperationTimingReport | null;
}
type RequestAiAnalysis = () => Promise<TagHealthAiAnalysisResult>;
interface CleanupActionHandlers {
  latestCleanupRecord: CleanupOperationRecord | null;
  applyCleanupItem: (item: CleanupPlanItem) => Promise<CleanupOperationRecord>;
  undoLatestCleanup: () => Promise<void>;
}

const SECTION_ORDER: TagHealthIssueType[] = [
  "lowFrequency",
  "nearDuplicates",
  "hierarchyInconsistency",
  "overBroad",
  "overNarrow",
  "namingDrift"
];

export class TagHealthReportModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly report: TagHealthReport,
    private cleanupPlan: CleanupPlan,
    private readonly labels: Labels,
    private readonly requestAiAnalysis: RequestAiAnalysis,
    private readonly cleanupActions: CleanupActionHandlers
  ) {
    super(app);
  }

  private aiAnalysis: TagHealthAiAnalysis | null = null;
  private aiTimingReport: OperationTimingReport | null = null;
  private aiLoading = false;
  private latestCleanupRecord: CleanupOperationRecord | null = null;
  private activeEvidenceSection: TagHealthIssueType = "nearDuplicates";

  onOpen(): void {
    this.latestCleanupRecord = this.cleanupActions.latestCleanupRecord;
    this.activeEvidenceSection = this.findInitialEvidenceSection();
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    this.modalEl.addClass("tag-curator-health-modal");
    contentEl.empty();

    const header = contentEl.createDiv({ cls: "tag-curator-health__header" });
    header.createEl("h2", { text: this.labels.health.title });
    header.createEl("p", { text: this.labels.health.subtitle });
    header.createEl("div", {
      cls: "tag-curator-health__meta",
      text: `${this.labels.health.generatedAt(new Date(this.report.generatedAt).toLocaleString())} · ${this.labels.health.indexUpdatedAt(
        new Date(this.report.indexUpdatedAt).toLocaleString()
      )}`
    });

    const view = buildTagHealthReportViewModel(this.report, this.cleanupPlan, {
      aiAnalysis: this.aiAnalysis,
      aiLoading: this.aiLoading
    });
    this.renderSummary(contentEl, view.overview);
    this.renderActionLayer(contentEl, view.actionItems);
    this.renderEvidenceLayer(contentEl, view.evidenceSections);
  }

  private findInitialEvidenceSection(): TagHealthIssueType {
    return SECTION_ORDER.find((type) => this.report.sections[type].items.length > 0) ?? "lowFrequency";
  }

  private renderSummary(parent: HTMLElement, overview: ReturnType<typeof buildTagHealthReportViewModel>["overview"]): void {
    const summary = parent.createDiv({ cls: "tag-curator-health__summary" });
    summary.createDiv({ text: this.labels.health.summary.totalTags(overview.totalTags) });
    summary.createDiv({ text: this.labels.health.summary.totalUsages(overview.totalUsages) });
    summary.createDiv({ text: this.labels.health.summary.riskItems(overview.riskItemCount) });
    summary.createDiv({ text: this.labels.health.summary.executableItems(overview.executableItemCount) });
    parent.createDiv({ cls: "tag-curator-health__layer-note", text: this.labels.health.workflow.layerNote });
  }

  private renderActionLayer(parent: HTMLElement, actionItems: HealthActionItemView[]): void {
    const section = parent.createDiv({ cls: "tag-curator-health-actions" });
    const header = section.createDiv({ cls: "tag-curator-health-actions__header" });
    const title = header.createDiv();
    title.createEl("h3", { text: this.labels.health.workflow.actionTitle });
    title.createEl("p", { text: this.labels.health.workflow.actionSubtitle });

    const controls = header.createDiv({ cls: "tag-curator-health-actions__header-controls" });
    const copyReportButton = controls.createEl("button", { text: this.labels.health.cleanupPlan.copyMarkdown });
    copyReportButton.type = "button";
    copyReportButton.onClickEvent(() => {
      void this.copyCleanupPlanMarkdown();
    });

    const button = controls.createEl("button", {
      cls: "mod-cta",
      text: this.aiLoading ? this.labels.health.workflow.aiRunningButton : this.labels.health.workflow.generateAiButton
    });
    button.type = "button";
    button.disabled = this.aiLoading;
    button.onClickEvent(() => {
      void this.enhanceWithAi();
    });

    if (this.aiLoading) {
      this.renderAiLoadingState(section);
      return;
    }

    if (!this.aiAnalysis) {
      this.renderAiInitialState(section);
      return;
    }

    if (this.aiAnalysis.summary) {
      section.createDiv({ cls: "tag-curator-health-actions__summary", text: this.aiAnalysis.summary });
    }

    if (actionItems.length === 0) {
      section.createDiv({ cls: "tag-curator-health__empty", text: this.labels.health.workflow.noActionItems });
      return;
    }

    const list = section.createDiv({ cls: "tag-curator-health-actions__list" });
    for (const item of actionItems) {
      this.renderActionItem(list, item);
    }

    if (this.aiTimingReport) {
      this.renderTimingReport(section, this.aiTimingReport);
    }
  }

  private renderAiInitialState(parent: HTMLElement): void {
    const empty = parent.createDiv({ cls: "tag-curator-health-ai-state" });
    empty.createEl("h4", { text: this.labels.health.workflow.initialTitle });
    empty.createEl("p", { text: this.labels.health.workflow.initialDescription });
    const list = empty.createEl("ul");
    for (const item of this.labels.health.workflow.initialBullets) {
      list.createEl("li", { text: item });
    }
    const button = empty.createEl("button", { cls: "mod-cta", text: this.labels.health.workflow.generateAiButton });
    button.type = "button";
    button.onClickEvent(() => {
      void this.enhanceWithAi();
    });
  }

  private renderAiLoadingState(parent: HTMLElement): void {
    const loading = parent.createDiv({ cls: "tag-curator-health-ai-state tag-curator-health-ai-state--loading" });
    loading.createDiv({ cls: "tag-curator-loading-spinner" });
    const body = loading.createDiv();
    body.createEl("h4", { text: this.labels.health.workflow.loadingTitle });
    body.createEl("p", { text: this.labels.health.workflow.loadingDescription });
    const stages = body.createEl("ol", { cls: "tag-curator-health-ai-state__stages" });
    stages.createEl("li", { text: this.labels.health.workflow.loadingStages.rules });
    stages.createEl("li", { cls: "is-active", text: this.labels.health.workflow.loadingStages.merge });
    stages.createEl("li", { text: this.labels.health.workflow.loadingStages.suggest });
    body.createDiv({ cls: "tag-curator-health-ai-state__hint", text: this.labels.health.workflow.loadingHint });
  }

  private renderActionItem(parent: HTMLElement, item: HealthActionItemView): void {
    const card = parent.createDiv({ cls: "tag-curator-health-action-card" });
    const statusRow = card.createDiv({ cls: "tag-curator-health-ai__status-row tag-curator-health-action-card__status-row" });
    const badges = statusRow.createDiv({ cls: "tag-curator-health-action-card__badges tag-curator-recommendation__badges" });
    badges.createSpan({
      cls: formatHealthAiBadgeClass("priority", item.priority),
      text: this.labels.health.ai.severity[item.priority]
    });
    badges.createSpan({
      cls: formatHealthAiBadgeClass("confidence", item.confidence),
      text: this.labels.health.ai.confidence[item.confidence]
    });
    badges.createSpan({
      cls: `tag-curator-recommendation__badge tag-curator-inline-action__badge tag-curator-inline-action__badge--availability-${item.capability.availability}`,
      text: this.labels.health.cleanupPlan.availability[item.capability.availability]
    });

    const tagRow = card.createDiv({ cls: "tag-curator-health-ai__tag-row tag-curator-health-action-card__tag-row" });
    const tags = tagRow.createDiv({ cls: "tag-curator-health__tags tag-curator-health__tags--compact" });
    for (const tag of item.tags) {
      this.renderTagButton(tags, tag);
    }

    this.renderField(card, this.labels.health.ai.diagnosis, item.diagnosis);
    this.renderField(card, this.labels.health.ai.reason, item.reason);
    if (item.targetTag) {
      this.renderAiTagField(card, this.labels.health.ai.targetTag, item.targetTag);
    }
    this.renderField(
      card,
      this.labels.health.workflow.ruleEvidence,
      item.evidenceTypes.map((type) => this.labels.health.sections[type]).join(" / ")
    );
    if (item.riskNote) {
      this.renderField(card, this.labels.health.ai.riskNote, item.riskNote);
    }

    const controls = card.createDiv({ cls: "tag-curator-health-action-card__controls" });
    const copyButton = controls.createEl("button", { text: this.labels.health.cleanupPlan.copyMarkdown });
    copyButton.type = "button";
    copyButton.onClickEvent(() => {
      if (item.cleanupItem) {
        void this.copyCleanupItemMarkdown(item.cleanupItem);
        return;
      }

      void this.copyActionItemMarkdown(item);
    });

    if (item.cleanupItem) {
      const previewButton = controls.createEl("button", { text: this.labels.health.workflow.viewFilePreview });
      previewButton.type = "button";
      previewButton.onClickEvent(() => {
        this.activeEvidenceSection = item.cleanupItem?.issueType ?? this.activeEvidenceSection;
        this.render();
      });
    }

    if (item.cleanupItem && item.capability.availability === "executable") {
      const latestAppliesToItem = this.latestCleanupRecord?.itemId === item.cleanupItem.id;
      const actionButton = controls.createEl("button", {
        cls: latestAppliesToItem ? "" : "mod-cta",
        text: latestAppliesToItem ? this.labels.health.cleanupPlan.undoThisOperation : this.labels.health.cleanupPlan.applyThisSuggestion
      });
      actionButton.type = "button";
      actionButton.onClickEvent(() => {
        if (!item.cleanupItem) {
          return;
        }

        if (latestAppliesToItem) {
          void this.undoCleanupItem();
          return;
        }

        void this.applyCleanupItem(item.cleanupItem);
      });
    }
  }

  private renderEvidenceLayer(parent: HTMLElement, sections: HealthEvidenceSectionView[]): void {
    const layer = parent.createDiv({ cls: "tag-curator-health-evidence" });
    const header = layer.createDiv({ cls: "tag-curator-health-evidence__header" });
    header.createEl("h3", { text: this.labels.health.workflow.evidenceTitle });
    header.createEl("p", { text: this.labels.health.workflow.evidenceDescription });

    const tabs = layer.createDiv({ cls: "tag-curator-health-evidence__tabs" });
    for (const section of sections) {
      const button = tabs.createEl("button", {
        cls: section.type === this.activeEvidenceSection ? "is-active" : "",
        text: this.labels.health.sections[section.type]
      });
      button.type = "button";
      button.onClickEvent(() => {
        this.activeEvidenceSection = section.type;
        this.render();
      });
    }

    const active = sections.find((section) => section.type === this.activeEvidenceSection) ?? sections[0];
    this.renderEvidenceSection(layer, active);
  }

  private renderEvidenceSection(parent: HTMLElement, section: HealthEvidenceSectionView): void {
    const list = parent.createDiv({ cls: "tag-curator-health-evidence__list" });
    if (section.items.length === 0) {
      list.createDiv({ cls: "tag-curator-health__empty", text: this.labels.health.noIssues });
      list.createDiv({ cls: "tag-curator-health__empty-detail", text: this.labels.health.emptyIssueDetails[section.type] });
      return;
    }

    section.items.forEach((issue, issueIndex) => {
      this.renderIssue(list, issue, `${section.type}-${issueIndex + 1}`);
    });
  }

  private renderAiTagField(parent: HTMLElement, label: string, tag: string): void {
    const field = parent.createDiv({ cls: "tag-curator-health-ai__field" });
    field.createSpan({ cls: "tag-curator-health__field-label", text: `${label}: ` });
    this.renderTagButton(field, tag);
  }

  private renderIssue(parent: HTMLElement, issue: TagHealthIssue, cleanupItemId: string): void {
    const card = parent.createDiv({ cls: "tag-curator-health__issue" });
    card.createDiv({ cls: "tag-curator-health__issue-title", text: issue.title });

    const tags = card.createDiv({ cls: "tag-curator-health__tags" });
    for (const tag of issue.tags) {
      this.renderTagButton(tags, tag);
    }

    this.renderField(card, this.labels.health.evidence, issue.evidence);
    this.renderField(card, this.labels.health.impact, issue.impact);
    this.renderField(card, this.labels.health.suggestion, this.labels.health.suggestions[issue.suggestion]);

    const cleanupItem = this.cleanupPlan.items.find((item) => item.id === cleanupItemId);
    if (cleanupItem) {
      this.renderInlineCleanupAction(card, cleanupItem);
    }
  }

  private renderInlineCleanupAction(parent: HTMLElement, item: CleanupPlanItem): void {
    const panel = parent.createDiv({ cls: "tag-curator-inline-action" });
    const header = panel.createDiv({ cls: "tag-curator-inline-action__header" });
    const title = header.createDiv();
    title.createEl("h4", { text: this.labels.health.cleanupPlan.actionCapability });
    title.createDiv({
      cls: "tag-curator-inline-action__status",
      text: `${this.labels.health.cleanupPlan.status}: ${this.getCleanupStatusLabel(item)}`
    });
    this.renderCapabilityBadges(title, item);

    const controls = header.createDiv({ cls: "tag-curator-inline-action__controls" });
    const copyButton = controls.createEl("button", { text: this.labels.health.cleanupPlan.copyMarkdown });
    copyButton.type = "button";
    copyButton.onClickEvent(() => {
      void this.copyCleanupItemMarkdown(item);
    });

    if (item.capability.availability === "executable") {
      const latestAppliesToItem = this.latestCleanupRecord?.itemId === item.id;
      const actionButton = controls.createEl("button", {
        cls: latestAppliesToItem ? "" : "mod-cta",
        text: latestAppliesToItem ? this.labels.health.cleanupPlan.undoThisOperation : this.labels.health.cleanupPlan.applyThisSuggestion
      });
      actionButton.type = "button";
      actionButton.onClickEvent(() => {
        if (latestAppliesToItem) {
          void this.undoCleanupItem();
          return;
        }

        void this.applyCleanupItem(item);
      });
    }

    const meta = panel.createDiv({ cls: "tag-curator-inline-action__meta" });
    meta.createSpan({
      text: `${this.labels.health.cleanupPlan.action}: ${this.labels.health.cleanupPlan.actions[item.action]}`
    });
    meta.createSpan({ text: this.labels.health.cleanupPlan.affectedFiles(item.affectedFileCount) });
    const target = item.targetTag ? formatTagClipboardText(item.targetTag) : this.labels.health.cleanupPlan.noTarget;
    meta.createSpan({ text: `${this.labels.health.cleanupPlan.targetTag}: ${target}` });

    panel.createDiv({ cls: "tag-curator-inline-action__note", text: this.getCleanupActionNote(item) });
    this.renderAiAssistance(panel, item);

    const files = panel.createDiv({ cls: "tag-curator-inline-action__files" });
    for (const file of item.files.slice(0, 4)) {
      this.renderInlineCleanupFilePreview(files, file);
    }
  }

  private renderInlineCleanupFilePreview(parent: HTMLElement, file: CleanupPlanFilePreview): void {
    const row = parent.createDiv({ cls: "tag-curator-inline-action__file" });
    row.createDiv({ cls: "tag-curator-inline-action__path", text: file.path });
    row.createDiv({
      cls: "tag-curator-inline-action__diff",
      text: `${this.labels.health.cleanupPlan.before}: ${formatTagList(file.beforeTags)} -> ${this.labels.health.cleanupPlan.after}: ${formatTagList(file.afterTags)}`
    });
  }

  private renderField(parent: HTMLElement, label: string, value: string): void {
    const field = parent.createDiv({ cls: "tag-curator-health__field" });
    field.createSpan({ cls: "tag-curator-health__field-label", text: `${label}: ` });
    field.createSpan({ text: value });
  }

  private renderTagButton(parent: HTMLElement, tag: string): void {
    renderClickableTag(this.app, parent, tag, this.labels);
  }

  private async copyCleanupPlanMarkdown(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.formatCleanupPlanMarkdown());
      new Notice(this.labels.health.cleanupPlan.markdownCopied);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.health.tagActionFailed);
    }
  }

  private formatCleanupPlanMarkdown(): string {
    const lines = [`# ${this.labels.health.cleanupPlan.title}`, ""];
    const view = buildTagHealthReportViewModel(this.report, this.cleanupPlan, {
      aiAnalysis: this.aiAnalysis,
      aiLoading: this.aiLoading
    });

    if (!this.aiAnalysis) {
      lines.push(this.labels.health.workflow.initialTitle, "");
    } else {
      lines.push(`## ${this.labels.health.workflow.actionTitle}`, "");
      for (const item of view.actionItems) {
        this.appendActionItemMarkdown(lines, item);
        lines.push("");
      }
    }

    lines.push(`## ${this.labels.health.workflow.evidenceTitle}`, "");
    for (const section of view.evidenceSections) {
      lines.push(`### ${this.labels.health.sections[section.type]}`);
      if (section.items.length === 0) {
        lines.push(`- ${this.labels.health.noIssues}`);
        lines.push("");
        continue;
      }

      for (const issue of section.items) {
        lines.push(`- ${issue.title}: ${formatTagList(issue.tags)} · ${this.labels.health.suggestions[issue.suggestion]}`);
      }
      lines.push("");
    }

    return lines.join("\n").trim();
  }

  private async copyActionItemMarkdown(item: HealthActionItemView): Promise<void> {
    try {
      const lines = [`## ${this.labels.health.workflow.actionTitle}`];
      this.appendActionItemMarkdown(lines, item);
      await navigator.clipboard.writeText(lines.join("\n").trim());
      new Notice(this.labels.health.cleanupPlan.markdownCopied);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.health.tagActionFailed);
    }
  }

  private async copyCleanupItemMarkdown(item: CleanupPlanItem): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.formatCleanupItemMarkdown(item));
      new Notice(this.labels.health.cleanupPlan.markdownCopied);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.health.tagActionFailed);
    }
  }

  private formatCleanupItemMarkdown(item: CleanupPlanItem): string {
    const lines = [`## ${item.title}`];
    lines.push(`- ${this.labels.health.cleanupPlan.action}: ${this.labels.health.cleanupPlan.actions[item.action]}`);
    this.appendCapabilityMarkdown(lines, item);
    lines.push(
      `- ${this.labels.health.cleanupPlan.targetTag}: ${
        item.targetTag ? formatTagClipboardText(item.targetTag) : this.labels.health.cleanupPlan.noTarget
      }`
    );
    lines.push(`- ${this.labels.health.cleanupPlan.affectedFiles(item.affectedFileCount)}`);
    lines.push(`- ${this.labels.health.impact}: ${item.rationale}`);
    this.appendAiAssistanceMarkdown(lines, item);
    lines.push("");

    for (const file of item.files) {
      lines.push(`  - ${file.path}: ${formatTagList(file.beforeTags)} -> ${formatTagList(file.afterTags)}`);
    }

    return lines.join("\n").trim();
  }

  private getCleanupStatusLabel(item: CleanupPlanItem): string {
    if (this.latestCleanupRecord?.itemId === item.id) {
      return this.labels.health.cleanupPlan.appliedStatus;
    }

    return this.labels.health.cleanupPlan.availability[item.capability.availability];
  }

  private getCleanupActionNote(item: CleanupPlanItem): string {
    if (item.capability.availability === "executable") {
      return this.labels.health.cleanupPlan.frontmatterOnlyWarning;
    }

    if (item.capability.availability === "previewOnly") {
      return this.labels.health.cleanupPlan.previewOnlyNote;
    }

    if (item.capability.availability === "observeOnly") {
      return this.labels.health.cleanupPlan.observeOnlyNote;
    }

    return this.labels.health.cleanupPlan.manualReviewNote;
  }

  private async applyCleanupItem(item: CleanupPlanItem): Promise<void> {
    try {
      const record = await this.cleanupActions.applyCleanupItem(item);
      this.latestCleanupRecord = record;
      new Notice(this.labels.health.cleanupPlan.cleanupApplied(record.files.length));
      this.render();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.notices.updateFailed);
    }
  }

  private async undoCleanupItem(): Promise<void> {
    try {
      await this.cleanupActions.undoLatestCleanup();
      this.latestCleanupRecord = null;
      new Notice(this.labels.health.cleanupPlan.cleanupUndone);
      this.render();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.notices.undoFailed);
    }
  }

  private async enhanceWithAi(): Promise<void> {
    if (this.aiLoading) {
      return;
    }

    try {
      this.aiLoading = true;
      this.render();
      const result = await this.requestAiAnalysis();
      this.aiAnalysis = result.analysis;
      this.cleanupPlan = applyAiAssistanceToCleanupPlan(this.cleanupPlan, result.analysis);
      this.aiTimingReport = result.timingReport;
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.labels.notices.suggestFailed);
    } finally {
      this.aiLoading = false;
      this.render();
    }
  }

  private renderTimingReport(parent: HTMLElement, timing: OperationTimingReport): void {
    const container = parent.createDiv({ cls: "tag-curator-dev-timing" });
    container.createEl("h3", { text: this.labels.recommendations.devTimingTitle });

    const list = container.createEl("ul");
    list.createEl("li", {
      text: `${this.labels.recommendations.totalTiming} · ${this.labels.recommendations.timingRow(
        formatTime(timing.startedAt),
        formatTime(timing.endedAt),
        formatDuration(timing.durationMs)
      )}`
    });

    for (const stage of timing.stages) {
      list.createEl("li", { text: this.formatStageTiming(stage) });
    }
  }

  private formatStageTiming(stage: OperationStageTiming): string {
    const label =
      stage.name === "prepare-ai-health-context"
        ? this.labels.health.ai.stageTiming.prepareAiHealthContext
        : stage.name === "request-ai-health-analysis"
          ? this.labels.health.ai.stageTiming.requestAiHealthAnalysis
          : stage.name;

    return `${label} · ${this.labels.recommendations.timingRow(
      formatTime(stage.startedAt),
      formatTime(stage.endedAt),
      formatDuration(stage.durationMs)
    )}`;
  }

  private renderCapabilityBadges(parent: HTMLElement, item: CleanupPlanItem): void {
    const badges = parent.createDiv({ cls: "tag-curator-inline-action__badges tag-curator-recommendation__badges" });
    badges.createSpan({
      cls: "tag-curator-recommendation__badge tag-curator-inline-action__badge",
      text: this.labels.health.cleanupPlan.kind[item.capability.kind]
    });
    badges.createSpan({
      cls: `tag-curator-recommendation__badge tag-curator-inline-action__badge tag-curator-inline-action__badge--availability-${item.capability.availability}`,
      text: this.labels.health.cleanupPlan.availability[item.capability.availability]
    });
    badges.createSpan({
      cls: `tag-curator-recommendation__badge tag-curator-inline-action__badge tag-curator-inline-action__badge--risk-${item.capability.riskLevel}`,
      text: this.labels.health.cleanupPlan.risk[item.capability.riskLevel]
    });
  }

  private renderAiAssistance(parent: HTMLElement, item: CleanupPlanItem): void {
    if (!item.aiAssistance) {
      return;
    }

    const ai = parent.createDiv({ cls: "tag-curator-inline-action__ai" });
    ai.createDiv({ cls: "tag-curator-inline-action__ai-title", text: this.labels.health.cleanupPlan.aiAssistance });
    ai.createDiv({ text: `${this.labels.health.ai.priorities}: ${this.labels.health.ai.severity[item.aiAssistance.priorityHint]} · ${this.labels.health.ai.confidence[item.aiAssistance.confidence]}` });
    ai.createDiv({ text: `${this.labels.health.ai.reason}: ${item.aiAssistance.reason}` });
    if (item.aiAssistance.targetTagCandidate) {
      const target = ai.createDiv({ cls: "tag-curator-inline-action__ai-target" });
      target.createSpan({ text: `${this.labels.health.cleanupPlan.aiTargetTagCandidate}: ` });
      this.renderTagButton(target, item.aiAssistance.targetTagCandidate);
    }
    if (item.aiAssistance.riskNote) {
      ai.createDiv({ text: `${this.labels.health.ai.riskNote}: ${item.aiAssistance.riskNote}` });
    }
  }

  private appendCapabilityMarkdown(lines: string[], item: CleanupPlanItem): void {
    lines.push(`- ${this.labels.health.cleanupPlan.actionKind}: ${this.labels.health.cleanupPlan.kind[item.capability.kind]}`);
    lines.push(
      `- ${this.labels.health.cleanupPlan.availabilityLabel}: ${this.labels.health.cleanupPlan.availability[item.capability.availability]}`
    );
    lines.push(`- ${this.labels.health.cleanupPlan.riskLabel}: ${this.labels.health.cleanupPlan.risk[item.capability.riskLevel]}`);
    lines.push(`- ${this.labels.health.cleanupPlan.requiresTargetTag}: ${this.formatBoolean(item.capability.requiresTargetTag)}`);
    lines.push(`- ${this.labels.health.cleanupPlan.requiresFilePreview}: ${this.formatBoolean(item.capability.requiresFilePreview)}`);
    lines.push(`- ${this.labels.health.cleanupPlan.supportsBatch}: ${this.formatBoolean(item.capability.supportsBatch)}`);
  }

  private appendActionItemMarkdown(lines: string[], item: HealthActionItemView): void {
    lines.push(`- ${this.labels.health.workflow.ruleEvidence}: ${item.evidenceTypes.map((type) => this.labels.health.sections[type]).join(" / ")}`);
    lines.push(`- ${this.labels.health.cleanupPlan.status}: ${this.labels.health.ai.severity[item.priority]} · ${this.labels.health.ai.confidence[item.confidence]}`);
    lines.push(`- ${this.labels.health.ai.diagnosis}: ${item.diagnosis}`);
    lines.push(`- ${this.labels.health.ai.reason}: ${item.reason}`);
    lines.push(`- ${this.labels.health.cleanupPlan.action}: ${this.labels.health.cleanupPlan.actions[item.suggestedAction]}`);
    lines.push(`- ${this.labels.health.cleanupPlan.availabilityLabel}: ${this.labels.health.cleanupPlan.availability[item.capability.availability]}`);
    if (item.targetTag) {
      lines.push(`- ${this.labels.health.ai.targetTag}: ${formatTagClipboardText(item.targetTag)}`);
    }
    if (item.riskNote) {
      lines.push(`- ${this.labels.health.ai.riskNote}: ${item.riskNote}`);
    }
    if (item.cleanupItem) {
      lines.push(`- ${this.labels.health.cleanupPlan.affectedFiles(item.cleanupItem.affectedFileCount)}`);
    }
    lines.push(`- ${this.labels.health.workflow.relatedTags}: ${formatTagList(item.tags)}`);
  }

  private appendAiAssistanceMarkdown(lines: string[], item: CleanupPlanItem): void {
    if (!item.aiAssistance) {
      return;
    }

    lines.push(`- ${this.labels.health.cleanupPlan.aiAssistance}: ${item.aiAssistance.reason}`);
    lines.push(`- ${this.labels.health.cleanupPlan.aiPriorityHint}: ${this.labels.health.ai.severity[item.aiAssistance.priorityHint]}`);
    if (item.aiAssistance.targetTagCandidate) {
      lines.push(
        `- ${this.labels.health.cleanupPlan.aiTargetTagCandidate}: ${formatTagClipboardText(item.aiAssistance.targetTagCandidate)}`
      );
    }
    if (item.aiAssistance.riskNote) {
      lines.push(`- ${this.labels.health.ai.riskNote}: ${item.aiAssistance.riskNote}`);
    }
  }

  private formatBoolean(value: boolean): string {
    return value ? this.labels.health.cleanupPlan.booleanYes : this.labels.health.cleanupPlan.booleanNo;
  }
}

function formatTagList(tags: string[]): string {
  return tags.length > 0 ? tags.map(formatTagClipboardText).join(", ") : "-";
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}
