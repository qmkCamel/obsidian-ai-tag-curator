// Presents AI recommendations for review and applies only the tags the user keeps selected.
import { ButtonComponent, Modal, Notice, Setting } from "obsidian";
import type { RecommendationResult, TagRecommendation } from "../ai/RecommendationSchema";
import type { getLabels } from "../ui/labels";
import { formatDuration } from "../utils/formatDuration";
import type { OperationTimingReport, OperationStageTiming } from "../utils/OperationTimer";
import { createChangePlan, type ChangePlan } from "./ChangePlan";

type Labels = ReturnType<typeof getLabels>;

export class RecommendationModal extends Modal {
  private selected = new Set<string>();

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly result: RecommendationResult,
    private readonly labels: Labels,
    private readonly timingReport: OperationTimingReport | null,
    private readonly onApply: (plan: ChangePlan) => Promise<void>
  ) {
    super(app);
    for (const recommendation of result.recommendations) {
      this.selected.add(recommendation.tag);
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("tag-curator-recommendation-modal");
    contentEl.empty();
    const header = contentEl.createDiv({ cls: "tag-curator-recommendation__header" });
    header.createEl("h2", { text: this.labels.recommendations.title });
    header.createEl("p", {
      cls: "tag-curator-recommendation__intro",
      text: this.labels.recommendations.subtitle
    });

    if (this.result.warnings.length > 0) {
      const warningList = contentEl.createEl("ul");
      for (const warning of this.result.warnings) {
        warningList.createEl("li", { text: warning });
      }
    }

    for (const [index, recommendation] of this.result.recommendations.entries()) {
      this.renderRecommendation(contentEl, recommendation, index + 1);
    }

    if (this.timingReport) {
      this.renderTimingReport(contentEl, this.timingReport);
    }

    const actions = new Setting(contentEl);
    actions.settingEl.addClass("tag-curator-recommendation__actions");
    actions.addButton((button: ButtonComponent) =>
      button
        .setButtonText(this.labels.recommendations.apply)
        .setCta()
        .onClick(async () => {
          try {
            const plan = createChangePlan({
              notePath: this.result.notePath,
              beforeTags: this.result.existingTags,
              selectedTags: Array.from(this.selected)
            });
            await this.onApply(plan);
            new Notice(this.labels.notices.tagsUpdated);
            this.close();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : this.labels.notices.updateFailed);
          }
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderRecommendation(parent: HTMLElement, recommendation: TagRecommendation, index: number): void {
    const row = parent.createDiv({ cls: "tag-curator-recommendation" });

    const setting = new Setting(row)
      .setName(`${this.labels.recommendations.candidateLabel(index)} · #${recommendation.tag}`)
      .addToggle((toggle) =>
        toggle.setValue(this.selected.has(recommendation.tag)).onChange((value) => {
          if (value) {
            this.selected.add(recommendation.tag);
          } else {
            this.selected.delete(recommendation.tag);
          }
        })
      );
    setting.settingEl.addClass("tag-curator-recommendation__topline");

    const badges = row.createDiv({ cls: "tag-curator-recommendation__badges" });
    badges.createSpan({
      cls: `tag-curator-recommendation__badge tag-curator-recommendation__badge--${recommendation.type}`,
      text: this.labels.recommendations.typeLabel(recommendation.type)
    });
    badges.createSpan({
      cls: `tag-curator-recommendation__badge tag-curator-recommendation__badge--${recommendation.confidence}`,
      text: this.labels.recommendations.confidenceLabel(recommendation.confidence)
    });

    row.createDiv({
      cls: "tag-curator-recommendation__meta",
      text: this.labels.recommendations.reasonTitle
    });
    row.createDiv({ cls: "tag-curator-recommendation__reason", text: recommendation.reason });

    if (recommendation.rejectedSimilarTags && recommendation.rejectedSimilarTags.length > 0) {
      row.createDiv({
        cls: "tag-curator-recommendation__meta tag-curator-recommendation__alternatives-title",
        text: this.labels.recommendations.alternativesTitle
      });
      const list = row.createEl("ul", { cls: "tag-curator-recommendation__meta" });
      for (const rejected of recommendation.rejectedSimilarTags) {
        list.createEl("li", { text: this.labels.recommendations.alternative(rejected.tag, rejected.reason) });
      }
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
      stage.name === "read-current-note"
        ? this.labels.recommendations.stageTiming.readCurrentNote
        : stage.name === "prepare-tag-index"
          ? this.labels.recommendations.stageTiming.prepareTagIndex
          : stage.name === "request-ai-recommendations"
            ? this.labels.recommendations.stageTiming.requestAiRecommendations
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
