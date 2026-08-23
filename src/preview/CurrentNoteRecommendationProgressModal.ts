// Keeps one current-note AI request visible without blocking unrelated workspace interaction.
import { Modal, Setting } from "obsidian";
import type { getLabels } from "../ui/labels";

type Labels = ReturnType<typeof getLabels>;

export type CurrentNoteRecommendationStage =
  | "read-current-note"
  | "prepare-tag-index"
  | "request-ai-recommendations";

export class CurrentNoteRecommendationProgressModal extends Modal {
  private stage: CurrentNoteRecommendationStage = "read-current-note";
  private minimized = false;
  private cancelled = false;
  private finishing = false;
  private readonly startedAt = Date.now();
  private elapsedTimer: ReturnType<typeof globalThis.setInterval> | null = null;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly labels: Labels,
    private readonly model: string,
    private readonly onCancel: () => void
  ) {
    super(app);
    this.scope.register([], "Escape", () => false);
  }

  onOpen(): void {
    this.containerEl.addClass("tag-curator-current-recommendation-progress-container");
    this.containerEl.classList.remove("mod-dim");
    this.modalEl.addClass("tag-curator-current-recommendation-progress-modal");
    this.modalEl.querySelector(".modal-header-button, .modal-close-button")?.remove();
    this.render();
    this.elapsedTimer = globalThis.setInterval(() => this.updateElapsed(), 1000);
  }

  onClose(): void {
    if (this.elapsedTimer !== null) {
      globalThis.clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    this.contentEl.empty();
  }

  updateStage(stage: CurrentNoteRecommendationStage): void {
    if (this.cancelled || this.finishing) {
      return;
    }
    this.stage = stage;
    this.renderIfOpen();
  }

  reveal(): void {
    this.minimized = false;
    this.renderIfOpen();
  }

  markCancelled(): void {
    if (this.cancelled || this.finishing) {
      return;
    }
    this.cancelled = true;
    this.minimized = false;
    this.renderIfOpen();
  }

  finish(): void {
    if (this.finishing) {
      return;
    }
    this.finishing = true;
    this.close();
  }

  private renderIfOpen(): void {
    if (this.containerEl.isConnected) {
      this.render();
    }
  }

  private render(): void {
    this.containerEl.classList.toggle(
      "tag-curator-current-recommendation-progress-container--minimized",
      this.minimized
    );
    this.contentEl.empty();
    this.contentEl.setAttr("role", "region");
    this.contentEl.setAttr("aria-label", this.labels.loading.suggestTitle);
    this.contentEl.createEl(this.minimized ? "h3" : "h2", { text: this.labels.loading.suggestTitle });

    const status = this.contentEl.createDiv({ cls: "tag-curator-current-recommendation-progress__status" });
    if (!this.cancelled) {
      status.createDiv({ cls: "tag-curator-loading-spinner" });
    }
    const statusCopy = status.createDiv();
    const stage = statusCopy.createDiv({
      cls: "tag-curator-current-recommendation-progress__stage",
      text: this.cancelled ? this.labels.loading.suggestCancelled : this.stageLabel()
    });
    stage.setAttr("role", "status");
    stage.setAttr("aria-live", "polite");
    statusCopy.createDiv({
      cls: "tag-curator-current-recommendation-progress__elapsed",
      text: this.elapsedLabel()
    });

    if (!this.minimized) {
      this.contentEl.createEl("p", {
        cls: "tag-curator-current-recommendation-progress__model",
        text: this.labels.loading.suggestModel(this.model)
      });
      this.contentEl.createEl("p", {
        cls: "tag-curator-current-recommendation-progress__boundary",
        text: this.labels.loading.suggestCancelBoundary
      });
    }

    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("tag-curator-current-recommendation-progress__actions");
    actions.addButton((button) =>
      button.setButtonText(this.minimized ? this.labels.loading.expand : this.labels.loading.minimize).onClick(() => {
        this.minimized = !this.minimized;
        this.render();
      })
    );
    actions.addButton((button) =>
      button
        .setButtonText(this.labels.loading.suggestCancel)
        .setWarning()
        .setDisabled(this.cancelled)
        .onClick(() => {
          if (this.cancelled) {
            return;
          }
          this.markCancelled();
          this.onCancel();
        })
    );
  }

  private updateElapsed(): void {
    this.contentEl
      .querySelector<HTMLElement>(".tag-curator-current-recommendation-progress__elapsed")
      ?.setText(this.elapsedLabel());
  }

  private elapsedLabel(): string {
    return this.labels.loading.suggestElapsed(formatElapsed(Date.now() - this.startedAt));
  }

  private stageLabel(): string {
    switch (this.stage) {
      case "read-current-note":
        return this.labels.loading.suggestReadCurrentNote;
      case "prepare-tag-index":
        return this.labels.loading.suggestPrepareTagIndex;
      case "request-ai-recommendations":
        return this.labels.loading.suggestRequestProvider;
    }
  }
}

function formatElapsed(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
