// Renders occurrence-level cleanup selection and requires a second confirmation before any write callback.
import { Modal, Setting } from "obsidian";
import type { getLabels } from "../ui/labels";
import {
  clearAllCleanupChanges,
  selectAllTrustedCleanupChanges,
  setCleanupFrontmatterSelected,
  setCleanupOccurrenceSelected,
  type CleanupReviewPlan,
  type SelectedCleanupPlan
} from "./CleanupReviewPlan";
import { buildCleanupReviewViewModel } from "./CleanupReviewViewModel";

type Labels = ReturnType<typeof getLabels>;

export class CleanupReviewModal extends Modal {
  private confirming = false;
  private applying = false;
  private applyError: string | null = null;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private plan: CleanupReviewPlan,
    private readonly labels: Labels,
    private readonly onApply: (plan: SelectedCleanupPlan) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("tag-curator-cleanup-review-modal");
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    this.contentEl.empty();
    const view = buildCleanupReviewViewModel(this.plan);
    this.setTitle(this.confirming ? this.labels.cleanupReview.confirmTitle : this.labels.cleanupReview.title);
    if (this.confirming) {
      this.renderConfirmation(view.selected);
      return;
    }

    this.contentEl.createEl("p", { text: this.labels.cleanupReview.subtitle });
    this.contentEl.createDiv({
      cls: "tag-curator-cleanup-review__identity",
      text: this.labels.cleanupReview.actionTarget(
        this.labels.health.cleanupPlan.actions[this.plan.action],
        this.plan.targetTag
      )
    });
    this.renderSummary(view.selected);

    const bulk = new Setting(this.contentEl);
    bulk.settingEl.addClass("tag-curator-cleanup-review__bulk-actions");
    bulk.addButton((button) =>
      button.setButtonText(this.labels.cleanupReview.selectAll).onClick(() => {
        this.plan = selectAllTrustedCleanupChanges(this.plan);
        this.render();
      })
    );
    bulk.addButton((button) =>
      button.setButtonText(this.labels.cleanupReview.clearAll).onClick(() => {
        this.plan = clearAllCleanupChanges(this.plan);
        this.render();
      })
    );

    const files = this.contentEl.createDiv({ cls: "tag-curator-cleanup-review__files" });
    for (const file of this.plan.files) this.renderFile(files, file);

    if (!view.canApply) {
      this.contentEl.createDiv({ cls: "tag-curator-cleanup-review__warning", text: this.labels.cleanupReview.emptySelection });
    }
    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("tag-curator-cleanup-review__actions");
    actions.addButton((button) => button.setButtonText(this.labels.cleanupReview.cancel).onClick(() => this.close()));
    actions.addButton((button) =>
      button
        .setButtonText(this.labels.cleanupReview.apply)
        .setCta()
        .setDisabled(!view.canApply)
        .onClick(() => {
          this.confirming = true;
          this.render();
        })
    );
  }

  private renderSummary(selected: SelectedCleanupPlan): void {
    const summary = this.contentEl.createDiv({ cls: "tag-curator-cleanup-review__summary" });
    summary.createDiv({
      text: this.labels.cleanupReview.summary(
        selected.fileCount,
        selected.frontmatterChangeCount,
        selected.inlineEditCount
      )
    });
    summary.createDiv({ text: this.labels.cleanupReview.remaining(selected.remainingSourceCount) });
    if (selected.partial) {
      summary.createDiv({
        cls: "tag-curator-cleanup-review__warning",
        text: this.labels.cleanupReview.partialWarning(selected.remainingSourceCount)
      });
    }
  }

  private renderFile(parent: HTMLElement, file: CleanupReviewPlan["files"][number]): void {
    const details = parent.createEl("details", { cls: "tag-curator-cleanup-review__file" }) as HTMLDetailsElement;
    details.open = file.status === "ready";
    details.createEl("summary", { text: file.notePath });
    if (file.error) details.createDiv({ cls: "tag-curator-cleanup-review__warning", text: file.error });

    if (file.frontmatterChanged) {
      new Setting(details)
        .setName(this.labels.cleanupReview.frontmatterSource)
        .setDesc(
          `${this.labels.cleanupReview.before}: ${formatTags(file.beforeTags)} → ${this.labels.cleanupReview.after}: ${formatTags(
            file.proposedAfterTags
          )}`
        )
        .addToggle((toggle) =>
          toggle.setValue(file.frontmatterSelected).setDisabled(file.status !== "ready").onChange((selected) => {
            this.plan = setCleanupFrontmatterSelected(this.plan, file.notePath, selected);
            this.render();
          })
        );
    }

    const inline = details.createDiv({ cls: "tag-curator-cleanup-review__occurrences" });
    if (file.occurrences.length > 0) {
      inline.createEl("h4", { text: this.labels.cleanupReview.inlineSource });
    }
    for (const occurrence of file.occurrences) {
      const unavailable = occurrence.availability !== "trusted";
      const setting = new Setting(inline)
        .setName(
          `${this.labels.cleanupReview.line(occurrence.line + 1)} · ${occurrence.sourceText} → ${occurrence.afterText}`
        )
        .setDesc(
          unavailable
            ? `${occurrence.context} · ${
                occurrence.availability === "cacheUnavailable"
                  ? this.labels.cleanupReview.unavailable.cacheUnavailable
                  : this.labels.cleanupReview.unavailable.positionMismatch
              }`
            : occurrence.context
        );
      setting.settingEl.addClass("tag-curator-cleanup-review__occurrence");
      if (unavailable) setting.settingEl.addClass("is-unavailable");
      setting.addToggle((toggle) =>
        toggle
          .setValue(occurrence.selected)
          .setDisabled(unavailable)
          .onChange((selected) => {
            this.plan = setCleanupOccurrenceSelected(this.plan, occurrence.id, selected);
            this.render();
          })
      );
    }
  }

  private renderConfirmation(selected: SelectedCleanupPlan): void {
    this.contentEl.createEl("p", {
      text: this.labels.cleanupReview.confirmMessage(
        selected.fileCount,
        selected.frontmatterChangeCount,
        selected.inlineEditCount
      )
    });
    if (selected.partial) {
      this.contentEl.createEl("p", {
        cls: "tag-curator-cleanup-review__warning",
        text: this.labels.cleanupReview.confirmPartial(selected.remainingSourceCount)
      });
    }
    if (this.applyError) {
      this.contentEl.createDiv({ cls: "tag-curator-cleanup-review__warning", text: this.applyError });
    }
    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("tag-curator-cleanup-review__actions");
    actions.addButton((button) =>
      button.setButtonText(this.labels.cleanupReview.back).setDisabled(this.applying).onClick(() => {
        this.confirming = false;
        this.render();
      })
    );
    actions.addButton((button) =>
      button
        .setButtonText(this.labels.cleanupReview.confirmApply)
        .setCta()
        .setDisabled(this.applying)
        .onClick(async () => {
          this.applying = true;
          this.render();
          try {
            await this.onApply(selected);
            this.close();
          } catch (error) {
            this.applyError = error instanceof Error ? error.message : String(error);
          } finally {
            this.applying = false;
            if (this.containerEl.isConnected) this.render();
          }
        })
    );
  }
}

function formatTags(tags: string[]): string {
  return tags.length > 0 ? tags.map((tag) => `#${tag}`).join(", ") : "-";
}
