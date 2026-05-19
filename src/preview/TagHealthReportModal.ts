// Shows a read-only diagnosis of tag taxonomy health without applying changes.
import { Modal, Notice } from "obsidian";
import type { CleanupPlan, CleanupPlanFilePreview, CleanupPlanItem } from "../cleanup/CleanupPlan";
import type { TagHealthAiAnalysis, TagHealthAiPriority } from "../health/TagHealthAiAnalysis";
import type { TagHealthIssue, TagHealthIssueType, TagHealthReport } from "../health/TagHealthReport";
import type { CleanupOperationRecord } from "../operations/OperationLog";
import type { getLabels } from "../ui/labels";
import { formatDuration } from "../utils/formatDuration";
import type { OperationStageTiming, OperationTimingReport } from "../utils/OperationTimer";
import { renderClickableTag } from "./ClickableTag";
import { formatHealthAiBadgeClass } from "./HealthAiBadgeClasses";

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
    private readonly cleanupPlan: CleanupPlan,
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

  onOpen(): void {
    this.latestCleanupRecord = this.cleanupActions.latestCleanupRecord;
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

    this.renderSummary(contentEl);
    this.renderAiPanel(contentEl);

    for (const sectionType of SECTION_ORDER) {
      this.renderSection(contentEl, sectionType);
    }
  }

  private renderSummary(parent: HTMLElement): void {
    const summary = parent.createDiv({ cls: "tag-curator-health__summary" });
    summary.createDiv({ text: this.labels.health.summary.totalTags(this.report.summary.totalTags) });
    summary.createDiv({ text: this.labels.health.summary.totalUsages(this.report.summary.totalUsages) });
    summary.createDiv({ text: this.labels.health.summary.totalFiles(this.report.summary.totalFiles) });
    summary.createDiv({ text: this.labels.health.summary.riskItems(this.report.summary.riskItemCount) });
  }

  private renderCleanupPlan(parent: HTMLElement): void {
    const plan = parent.createDiv({ cls: "tag-curator-cleanup-plan" });
    const header = plan.createDiv({ cls: "tag-curator-cleanup-plan__header" });
    const title = header.createDiv();
    title.createEl("h3", { text: this.labels.health.cleanupPlan.title });
    title.createEl("p", { text: this.labels.health.cleanupPlan.subtitle });

    const copyButton = header.createEl("button", {
      text: this.labels.health.cleanupPlan.copyMarkdown
    });
    copyButton.type = "button";
    copyButton.disabled = this.cleanupPlan.items.length === 0;
    copyButton.onClickEvent(() => {
      void this.copyCleanupPlanMarkdown();
    });

    if (this.cleanupPlan.items.length === 0) {
      plan.createDiv({ cls: "tag-curator-health__empty", text: this.labels.health.cleanupPlan.empty });
      return;
    }

    const summary = plan.createDiv({ cls: "tag-curator-cleanup-plan__summary" });
    summary.createSpan({ text: this.labels.health.cleanupPlan.affectedFiles(this.cleanupPlan.affectedFileCount) });

    const list = plan.createDiv({ cls: "tag-curator-cleanup-plan__list" });
    for (const item of this.cleanupPlan.items) {
      this.renderCleanupPlanItem(list, item);
    }
  }

  private renderCleanupPlanItem(parent: HTMLElement, item: CleanupPlanItem): void {
    const card = parent.createDiv({ cls: "tag-curator-cleanup-plan__item" });
    card.createDiv({ cls: "tag-curator-cleanup-plan__item-title", text: item.title });

    const meta = card.createDiv({ cls: "tag-curator-cleanup-plan__meta" });
    meta.createSpan({
      text: `${this.labels.health.cleanupPlan.action}: ${this.labels.health.cleanupPlan.actions[item.action]}`
    });
    meta.createSpan({ text: this.labels.health.cleanupPlan.affectedFiles(item.affectedFileCount) });

    const tags = card.createDiv({ cls: "tag-curator-health__tags" });
    for (const tag of item.tags) {
      this.renderTagButton(tags, tag);
    }

    const target = item.targetTag ? formatTagClipboardText(item.targetTag) : this.labels.health.cleanupPlan.noTarget;
    this.renderField(card, this.labels.health.cleanupPlan.targetTag, target);
    this.renderField(card, this.labels.health.impact, item.rationale);

    card.createEl("h4", { text: this.labels.health.cleanupPlan.filePreview });
    const files = card.createDiv({ cls: "tag-curator-cleanup-plan__files" });
    for (const file of item.files) {
      this.renderCleanupFilePreview(files, file);
    }
  }

  private renderCleanupFilePreview(parent: HTMLElement, file: CleanupPlanFilePreview): void {
    const row = parent.createDiv({ cls: "tag-curator-cleanup-plan__file" });
    row.createDiv({ cls: "tag-curator-cleanup-plan__path", text: file.path });
    row.createDiv({
      cls: "tag-curator-cleanup-plan__diff",
      text: `${this.labels.health.cleanupPlan.before}: ${formatTagList(file.beforeTags)} -> ${this.labels.health.cleanupPlan.after}: ${formatTagList(file.afterTags)}`
    });
  }

  private renderAiPanel(parent: HTMLElement): void {
    const panel = parent.createDiv({ cls: "tag-curator-health-ai" });
    const header = panel.createDiv({ cls: "tag-curator-health-ai__header" });
    header.createEl("h3", { text: this.labels.health.ai.title });
    const button = header.createEl("button", {
      cls: "mod-cta",
      text: this.aiLoading ? this.labels.health.ai.enhancing : this.labels.health.ai.enhanceButton
    });
    button.type = "button";
    button.disabled = this.aiLoading;
    button.onClickEvent(() => {
      void this.enhanceWithAi();
    });

    if (this.aiAnalysis) {
      panel.createEl("h4", { text: this.labels.health.ai.summary });
      panel.createEl("p", { cls: "tag-curator-health-ai__summary", text: this.aiAnalysis.summary });
      this.renderAiPriorities(panel, this.aiAnalysis.priorities);
      if (this.aiTimingReport) {
        this.renderTimingReport(panel, this.aiTimingReport);
      }
    }
  }

  private renderAiPriorities(parent: HTMLElement, priorities: TagHealthAiPriority[]): void {
    if (priorities.length === 0) {
      return;
    }

    parent.createEl("h4", { text: this.labels.health.ai.priorities });
    const list = parent.createDiv({ cls: "tag-curator-health-ai__list" });
    for (const priority of priorities) {
      const item = list.createDiv({ cls: "tag-curator-health-ai__item" });
      const statusRow = item.createDiv({ cls: "tag-curator-health-ai__status-row" });
      const badges = statusRow.createDiv({ cls: "tag-curator-health-ai__badges tag-curator-recommendation__badges" });
      badges.createSpan({
        cls: formatHealthAiBadgeClass("priority", priority.severity),
        text: this.labels.health.ai.severity[priority.severity]
      });
      badges.createSpan({
        cls: formatHealthAiBadgeClass("confidence", priority.confidence),
        text: this.labels.health.ai.confidence[priority.confidence]
      });

      const tagRow = item.createDiv({ cls: "tag-curator-health-ai__tag-row" });
      const tags = tagRow.createDiv({ cls: "tag-curator-health__tags tag-curator-health__tags--compact" });
      for (const tag of priority.tags) {
        this.renderTagButton(tags, tag);
      }
      this.renderAiField(item, this.labels.health.ai.diagnosis, priority.diagnosis);
      this.renderAiField(item, this.labels.health.ai.reason, priority.reason);
      if (priority.targetTag) {
        this.renderAiTagField(item, this.labels.health.ai.targetTag, priority.targetTag);
      }
      if (priority.riskNote) {
        this.renderAiField(item, this.labels.health.ai.riskNote, priority.riskNote);
      }
    }
  }

  private renderAiField(parent: HTMLElement, label: string, value: string): void {
    const field = parent.createDiv({ cls: "tag-curator-health-ai__field" });
    field.createSpan({ cls: "tag-curator-health__field-label", text: `${label}: ` });
    field.createSpan({ text: value });
  }

  private renderAiTagField(parent: HTMLElement, label: string, tag: string): void {
    const field = parent.createDiv({ cls: "tag-curator-health-ai__field" });
    field.createSpan({ cls: "tag-curator-health__field-label", text: `${label}: ` });
    this.renderTagButton(field, tag);
  }

  private renderSection(parent: HTMLElement, sectionType: TagHealthIssueType): void {
    const section = this.report.sections[sectionType];
    const container = parent.createDiv({ cls: "tag-curator-health__section" });
    container.createEl("h3", { text: this.labels.health.sections[sectionType] });

    if (section.items.length === 0) {
      container.createDiv({ cls: "tag-curator-health__empty", text: this.labels.health.noIssues });
      container.createDiv({
        cls: "tag-curator-health__empty-detail",
        text: this.labels.health.emptyIssueDetails[sectionType]
      });
      return;
    }

    section.items.forEach((issue, issueIndex) => {
      this.renderIssue(container, issue, `${sectionType}-${issueIndex + 1}`);
    });
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
    title.createEl("h4", { text: this.labels.health.cleanupPlan.executableSuggestion });
    title.createDiv({
      cls: "tag-curator-inline-action__status",
      text: `${this.labels.health.cleanupPlan.status}: ${this.getCleanupStatusLabel(item)}`
    });

    const controls = header.createDiv({ cls: "tag-curator-inline-action__controls" });
    const copyButton = controls.createEl("button", { text: this.labels.health.cleanupPlan.copyMarkdown });
    copyButton.type = "button";
    copyButton.onClickEvent(() => {
      void this.copyCleanupItemMarkdown(item);
    });

    const latestAppliesToItem = this.latestCleanupRecord?.itemId === item.id;
    if (latestAppliesToItem) {
      const undoButton = controls.createEl("button", { text: this.labels.health.cleanupPlan.undoThisOperation });
      undoButton.type = "button";
      undoButton.onClickEvent(() => {
        void this.undoCleanupItem();
      });
    } else {
      const applyButton = controls.createEl("button", {
        cls: item.action === "deprecate" ? "mod-cta" : "",
        text: this.labels.health.cleanupPlan.applyThisSuggestion
      });
      applyButton.type = "button";
      applyButton.disabled = item.action !== "deprecate";
      applyButton.onClickEvent(() => {
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
    lines.push(this.labels.health.cleanupPlan.affectedFiles(this.cleanupPlan.affectedFileCount), "");

    for (const item of this.cleanupPlan.items) {
      lines.push(`## ${item.title}`);
      lines.push(`- ${this.labels.health.cleanupPlan.action}: ${this.labels.health.cleanupPlan.actions[item.action]}`);
      lines.push(
        `- ${this.labels.health.cleanupPlan.targetTag}: ${
          item.targetTag ? formatTagClipboardText(item.targetTag) : this.labels.health.cleanupPlan.noTarget
        }`
      );
      lines.push(`- ${this.labels.health.cleanupPlan.affectedFiles(item.affectedFileCount)}`);
      lines.push(`- ${this.labels.health.impact}: ${item.rationale}`);
      lines.push("");

      for (const file of item.files) {
        lines.push(
          `  - ${file.path}: ${formatTagList(file.beforeTags)} -> ${formatTagList(file.afterTags)}`
        );
      }
      lines.push("");
    }

    return lines.join("\n").trim();
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
    lines.push(
      `- ${this.labels.health.cleanupPlan.targetTag}: ${
        item.targetTag ? formatTagClipboardText(item.targetTag) : this.labels.health.cleanupPlan.noTarget
      }`
    );
    lines.push(`- ${this.labels.health.cleanupPlan.affectedFiles(item.affectedFileCount)}`);
    lines.push(`- ${this.labels.health.impact}: ${item.rationale}`);
    lines.push("");

    for (const file of item.files) {
      lines.push(`  - ${file.path}: ${formatTagList(file.beforeTags)} -> ${formatTagList(file.afterTags)}`);
    }

    return lines.join("\n").trim();
  }

  private getCleanupStatusLabel(item: CleanupPlanItem): string {
    return this.latestCleanupRecord?.itemId === item.id
      ? this.labels.health.cleanupPlan.appliedStatus
      : this.labels.health.cleanupPlan.pendingReview;
  }

  private getCleanupActionNote(item: CleanupPlanItem): string {
    return item.action === "deprecate"
      ? this.labels.health.cleanupPlan.frontmatterOnlyWarning
      : this.labels.health.cleanupPlan.unsupportedWriteAction;
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
}

function formatTagList(tags: string[]): string {
  return tags.length > 0 ? tags.map(formatTagClipboardText).join(", ") : "-";
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}
