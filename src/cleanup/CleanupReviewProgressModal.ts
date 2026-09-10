// Shows cancellable, read-only hydration progress for a single cleanup item.
import { Modal, Setting } from "obsidian";
import type { getLabels } from "../ui/labels";
import type { CleanupReviewProgressSnapshot } from "./CleanupReviewPlanBuilder";

type Labels = ReturnType<typeof getLabels>;

export class CleanupReviewProgressModal extends Modal {
  private snapshot: CleanupReviewProgressSnapshot;
  private cancelled = false;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    snapshot: CleanupReviewProgressSnapshot,
    private readonly labels: Labels,
    private readonly onCancel: () => void
  ) {
    super(app);
    this.snapshot = snapshot;
  }

  onOpen(): void {
    this.modalEl.addClass("tag-curator-cleanup-progress-modal");
    this.render();
  }

  update(snapshot: CleanupReviewProgressSnapshot): void {
    this.snapshot = snapshot;
    if (this.containerEl.isConnected) this.render();
  }

  private render(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.labels.cleanupReview.progressTitle });
    this.contentEl.createDiv({
      cls: "tag-curator-cleanup-review__progress-primary",
      text: this.labels.cleanupReview.progressSummary(this.snapshot.completed, this.snapshot.total)
    });
    this.contentEl.createDiv({
      cls: "tag-curator-cleanup-review__metrics",
      text: this.labels.cleanupReview.progressCounts(
        this.snapshot.ready,
        this.snapshot.unavailable,
        this.snapshot.failed,
        this.snapshot.cancelled
      )
    });
    this.contentEl.createEl("p", {
      cls: "tag-curator-cleanup-review__note",
      text: this.labels.cleanupReview.progressNoWrites
    });
    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("tag-curator-cleanup-review__actions");
    actions.addButton((button) =>
      button
        .setButtonText(this.labels.cleanupReview.cancel)
        .setWarning()
        .setDisabled(this.cancelled)
        .onClick(() => {
          this.cancelled = true;
          this.onCancel();
          this.close();
        })
    );
  }
}
