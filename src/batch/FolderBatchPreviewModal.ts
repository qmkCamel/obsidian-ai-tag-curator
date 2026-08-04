// Provides whole-batch and per-file review with risk-aware, source-aware selection controls.
import { Modal, Setting } from "obsidian";
import type { getLabels } from "../ui/labels";
import {
  clearAllCandidates,
  selectAllLowRisk,
  updateCandidateSelection,
  type FolderBatchCandidate,
  type FolderBatchPlan
} from "./FolderBatchPlan";
import {
  buildFolderBatchPreviewViewModel,
  type FolderBatchRiskFilter
} from "./FolderBatchViewModel";

type Labels = ReturnType<typeof getLabels>;

export class FolderBatchPreviewModal extends Modal {
  private plan: FolderBatchPlan;
  private riskFilter: FolderBatchRiskFilter = "all";

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    plan: FolderBatchPlan,
    private readonly labels: Labels,
    private readonly onRetryFailed: (plan: FolderBatchPlan) => void,
    private readonly onApply: (plan: FolderBatchPlan) => Promise<void>
  ) {
    super(app);
    this.plan = plan;
  }

  onOpen(): void {
    this.modalEl.addClass("tag-curator-folder-preview-modal");
    this.render();
  }

  private render(): void {
    const view = buildFolderBatchPreviewViewModel(this.plan, this.riskFilter);
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.labels.folderBatch.previewTitle });
    this.contentEl.createEl("p", { cls: "tag-curator-folder-batch__muted", text: this.labels.folderBatch.previewSubtitle });

    const summary = this.contentEl.createDiv({ cls: "tag-curator-folder-batch__metrics" });
    summary.createDiv({ text: this.labels.folderBatch.summaryFiles(view.selectedFileCount) });
    summary.createDiv({ text: this.labels.folderBatch.summaryTags(view.selectedTagCount) });
    summary.createDiv({
      text: this.labels.folderBatch.summaryRisk(view.riskCounts.low, view.riskCounts.medium, view.riskCounts.high)
    });

    new Setting(this.contentEl)
      .setName(this.labels.folderBatch.filterRisk)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("all", this.labels.folderBatch.filterAll)
          .addOption("low", this.labels.folderBatch.riskLow)
          .addOption("medium", this.labels.folderBatch.riskMedium)
          .addOption("high", this.labels.folderBatch.riskHigh)
          .setValue(this.riskFilter)
          .onChange((value) => {
            this.riskFilter = value as FolderBatchRiskFilter;
            this.render();
          })
      );

    for (const file of view.files) {
      const details = this.contentEl.createEl("details", { cls: "tag-curator-folder-batch__file" }) as HTMLDetailsElement;
      details.open = file.planStatus === "ready" || file.sourceStatus === "failed" || file.aiStatus === "failed";
      details.createEl("summary", { text: `${file.notePath} · ${file.sourceStatus} / ${file.aiStatus} / ${file.planStatus}` });
      this.renderTagLine(details, this.labels.folderBatch.frontmatterSource, file.frontmatterTags);
      this.renderTagLine(details, this.labels.folderBatch.inlineSource, file.inlineTags);
      if (file.sourceStatus === "failed") {
        details.createDiv({ cls: "tag-curator-folder-batch__warning", text: this.labels.folderBatch.sourceFailed });
      } else if (file.aiStatus === "failed") {
        details.createDiv({
          cls: "tag-curator-folder-batch__warning",
          text: this.labels.folderBatch.aiFailed(file.aiError ?? "unknown")
        });
      } else if (file.aiStatus === "cancelled") {
        details.createDiv({ cls: "tag-curator-folder-batch__warning", text: this.labels.folderBatch.aiCancelled });
      } else if (file.planStatus === "noChange") {
        details.createDiv({ cls: "tag-curator-folder-batch__muted", text: this.labels.folderBatch.noChange });
      }

      for (const candidate of file.candidates) {
        this.renderCandidate(details, candidate);
      }
      this.renderTagLine(details, this.labels.folderBatch.beforeTags, file.frontmatterTags);
      this.renderTagLine(details, this.labels.folderBatch.afterTags, file.afterTags);
    }

    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("tag-curator-folder-batch__actions");
    actions.addButton((button) =>
      button.setButtonText(this.labels.folderBatch.selectAllLow).onClick(() => {
        this.plan = selectAllLowRisk(this.plan);
        this.render();
      })
    );
    actions.addButton((button) =>
      button.setButtonText(this.labels.folderBatch.clearAll).onClick(() => {
        this.plan = clearAllCandidates(this.plan);
        this.render();
      })
    );
    if (view.hasRetryableFailures) {
      actions.addButton((button) =>
        button.setButtonText(this.labels.folderBatch.retryFailed).onClick(() => {
          this.close();
          this.onRetryFailed(this.plan);
        })
      );
    }
    actions.addButton((button) =>
      button
        .setButtonText(this.labels.folderBatch.apply)
        .setCta()
        .setDisabled(!view.canApply)
        .onClick(() => {
          new FolderBatchConfirmModal(this.app, view.selectedFileCount, view.selectedTagCount, this.labels, async () => {
            this.close();
            await this.onApply(this.plan);
          }).open();
        })
    );
  }

  private renderCandidate(parent: HTMLElement, candidate: FolderBatchCandidate): void {
    const source = candidate.source === "inline" ? this.labels.folderBatch.inlineSource : this.labels.folderBatch.aiSource;
    const risk =
      candidate.risk === "low"
        ? this.labels.folderBatch.riskLow
        : candidate.risk === "medium"
          ? this.labels.folderBatch.riskMedium
          : this.labels.folderBatch.riskHigh;
    const setting = new Setting(parent)
      .setName(`#${candidate.tag} · ${source}`)
      .setDesc(`${risk} · ${candidate.reason}`);
    setting.settingEl.addClass(`tag-curator-folder-batch__candidate tag-curator-folder-batch__candidate--${candidate.risk}`);
    if (candidate.executable && candidate.risk !== "high") {
      setting.addToggle((toggle) =>
        toggle.setValue(candidate.selected).onChange((selected) => {
          this.plan = updateCandidateSelection(this.plan, candidate.id, selected);
          this.render();
        })
      );
    }
  }

  private renderTagLine(parent: HTMLElement, title: string, tags: string[]): void {
    parent.createDiv({
      cls: "tag-curator-folder-batch__tag-line",
      text: `${title}: ${tags.length > 0 ? tags.map((tag) => `#${tag}`).join(" · ") : this.labels.folderBatch.noTags}`
    });
  }
}

class FolderBatchConfirmModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly fileCount: number,
    private readonly tagCount: number,
    private readonly labels: Labels,
    private readonly onConfirm: () => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(this.labels.folderBatch.confirmTitle);
    this.contentEl.createEl("p", { text: this.labels.folderBatch.confirmMessage(this.fileCount, this.tagCount) });
    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("tag-curator-folder-batch__actions");
    actions.addButton((button) => button.setButtonText(this.labels.folderBatch.close).onClick(() => this.close()));
    actions.addButton((button) =>
      button.setButtonText(this.labels.folderBatch.confirmApply).setCta().onClick(async () => {
        this.close();
        await this.onConfirm();
      })
    );
  }
}
