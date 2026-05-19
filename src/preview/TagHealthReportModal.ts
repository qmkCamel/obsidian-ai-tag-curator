// Shows a read-only diagnosis of tag taxonomy health without applying changes.
import { Modal, Notice } from "obsidian";
import type { TagHealthAiAnalysis, TagHealthAiPriority } from "../health/TagHealthAiAnalysis";
import type { TagHealthIssue, TagHealthIssueType, TagHealthReport } from "../health/TagHealthReport";
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
    private readonly labels: Labels,
    private readonly requestAiAnalysis: RequestAiAnalysis
  ) {
    super(app);
  }

  private aiAnalysis: TagHealthAiAnalysis | null = null;
  private aiTimingReport: OperationTimingReport | null = null;
  private aiLoading = false;

  onOpen(): void {
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

    for (const issue of section.items) {
      this.renderIssue(container, issue);
    }
  }

  private renderIssue(parent: HTMLElement, issue: TagHealthIssue): void {
    const card = parent.createDiv({ cls: "tag-curator-health__issue" });
    card.createDiv({ cls: "tag-curator-health__issue-title", text: issue.title });

    const tags = card.createDiv({ cls: "tag-curator-health__tags" });
    for (const tag of issue.tags) {
      this.renderTagButton(tags, tag);
    }

    this.renderField(card, this.labels.health.evidence, issue.evidence);
    this.renderField(card, this.labels.health.impact, issue.impact);
    this.renderField(card, this.labels.health.suggestion, this.labels.health.suggestions[issue.suggestion]);
  }

  private renderField(parent: HTMLElement, label: string, value: string): void {
    const field = parent.createDiv({ cls: "tag-curator-health__field" });
    field.createSpan({ cls: "tag-curator-health__field-label", text: `${label}: ` });
    field.createSpan({ text: value });
  }

  private renderTagButton(parent: HTMLElement, tag: string): void {
    renderClickableTag(this.app, parent, tag, this.labels);
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

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}
