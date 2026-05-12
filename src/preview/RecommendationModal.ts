// Presents AI recommendations for review and applies only the tags the user keeps selected.
import { ButtonComponent, Modal, Notice, Setting } from "obsidian";
import type { RecommendationResult, TagRecommendation } from "../ai/RecommendationSchema";
import type { getLabels } from "../ui/labels";
import { createChangePlan, type ChangePlan } from "./ChangePlan";

type Labels = ReturnType<typeof getLabels>;

export class RecommendationModal extends Modal {
  private selected = new Set<string>();

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly result: RecommendationResult,
    private readonly labels: Labels,
    private readonly onApply: (plan: ChangePlan) => Promise<void>
  ) {
    super(app);
    for (const recommendation of result.recommendations) {
      this.selected.add(recommendation.tag);
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.labels.recommendations.title });
    contentEl.createEl("p", {
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

    new Setting(contentEl).addButton((button: ButtonComponent) =>
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

    new Setting(row)
      .setName(`${this.labels.recommendations.candidateLabel(index)} · #${recommendation.tag}`)
      .setDesc(
        `${this.labels.recommendations.typeLabel(recommendation.type)} · ${this.labels.recommendations.confidenceLabel(
          recommendation.confidence
        )}`
      )
      .addToggle((toggle) =>
        toggle.setValue(this.selected.has(recommendation.tag)).onChange((value) => {
          if (value) {
            this.selected.add(recommendation.tag);
          } else {
            this.selected.delete(recommendation.tag);
          }
        })
      );

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
}
