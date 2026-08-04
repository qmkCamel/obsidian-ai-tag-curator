// Displays orthogonal read/AI/plan progress and exposes immediate cancellation.
import { Modal, Setting } from "obsidian";
import type { getLabels } from "../ui/labels";
import type { FolderBatchProgressSnapshot } from "./FolderBatchRecommendationRunner";

type Labels = ReturnType<typeof getLabels>;

export class FolderBatchProgressModal extends Modal {
  private snapshot: FolderBatchProgressSnapshot;
  private minimized = false;
  private cancelled = false;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    snapshot: FolderBatchProgressSnapshot,
    private readonly labels: Labels,
    private readonly onCancel: () => void
  ) {
    super(app);
    this.snapshot = snapshot;
  }

  onOpen(): void {
    this.modalEl.addClass("tag-curator-folder-progress-modal");
    this.render();
  }

  update(snapshot: FolderBatchProgressSnapshot): void {
    this.snapshot = snapshot;
    if (this.containerEl.isConnected) {
      this.render();
    }
  }

  private render(): void {
    const value = this.snapshot;
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.labels.folderBatch.progressTitle });
    this.contentEl.createDiv({
      cls: "tag-curator-folder-batch__progress-primary",
      text: this.labels.folderBatch.progressSummary(value.completed, value.total)
    });
    if (!this.minimized) {
      const stats = this.contentEl.createDiv({ cls: "tag-curator-folder-batch__metrics" });
      stats.createDiv({ text: this.labels.folderBatch.sourceProgress(value.sourceReady, value.sourceFailed) });
      stats.createDiv({ text: this.labels.folderBatch.aiProgress(value.aiReady, value.aiFailed) });
      stats.createDiv({ text: this.labels.folderBatch.planProgress(value.planReady, value.noChange) });
      stats.createDiv({ text: this.labels.folderBatch.cancelledCount(value.cancelled) });
      this.contentEl.createEl("p", {
        cls: "tag-curator-folder-batch__warning",
        text: this.labels.folderBatch.cancelBillingNotice
      });
    }

    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("tag-curator-folder-batch__actions");
    actions.addButton((button) =>
      button.setButtonText(this.minimized ? this.labels.loading.expand : this.labels.folderBatch.minimize).onClick(() => {
        this.minimized = !this.minimized;
        this.render();
      })
    );
    actions.addButton((button) =>
      button
        .setButtonText(this.labels.folderBatch.cancel)
        .setWarning()
        .setDisabled(this.cancelled)
        .onClick(() => {
          this.cancelled = true;
          this.onCancel();
          this.render();
        })
    );
  }
}
