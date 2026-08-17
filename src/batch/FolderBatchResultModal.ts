// Reports applied, compensated, conflict, and fixed-target recovery outcomes with precise file lists.
import { Modal, Setting } from "obsidian";
import type { BatchOperationRecord } from "../operations/OperationLog";
import type { getLabels } from "../ui/labels";
import type { FolderBatchExecutionResult } from "./FolderBatchExecutor";
import type { FolderBatchRecoveryResult } from "./FolderBatchRecoveryService";

type Labels = ReturnType<typeof getLabels>;
type Result = FolderBatchExecutionResult | FolderBatchRecoveryResult;

export class FolderBatchResultModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly result: Result,
    private readonly labels: Labels,
    private readonly onUndo?: () => void,
    private readonly onRetryRecovery?: (record: BatchOperationRecord) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("tag-curator-folder-result-modal");
    this.setTitle(this.labels.folderBatch.resultTitle);
    this.contentEl.createEl("p", { text: this.resultText() });
    if (this.result.error) {
      this.contentEl.createDiv({ cls: "tag-curator-folder-batch__warning", text: this.result.error });
    }
    if ("conflicts" in this.result && this.result.conflicts.length > 0) {
      const list = this.contentEl.createEl("ul");
      for (const conflict of this.result.conflicts) {
        list.createEl("li", { text: `${conflict.notePath}: ${this.conflictLabel(conflict.kind)}` });
      }
    }
    if ("files" in this.result) {
      const problems = this.result.files.filter((file) => file.recoveryState === "conflict" || file.recoveryState === "missing");
      if (problems.length > 0) {
        const list = this.contentEl.createEl("ul");
        for (const file of problems) {
          list.createEl("li", { text: `${file.notePath}: ${file.recoveryState}` });
        }
      }
    }

    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("tag-curator-folder-batch__actions");
    actions.addButton((button) => button.setButtonText(this.labels.folderBatch.close).onClick(() => this.close()));
    if (this.result.status === "applied" && this.onUndo) {
      actions.addButton((button) =>
        button.setButtonText(this.labels.folderBatch.undo).onClick(() => {
          this.close();
          this.onUndo?.();
        })
      );
    }
    if (this.result.status === "recoveryRequired" && this.result.record && this.onRetryRecovery) {
      actions.addButton((button) =>
        button.setButtonText(this.labels.folderBatch.retryRecovery).setWarning().onClick(() => {
          this.close();
          this.onRetryRecovery?.(this.result.record!);
        })
      );
    }
  }

  private resultText(): string {
    if (this.result.status === "applied") return this.labels.folderBatch.appliedResult;
    if (this.result.status === "removed") return this.labels.folderBatch.removedResult;
    if (this.result.status === "none") return this.labels.folderBatch.noResult;
    if (this.result.status === "rolledBack") return this.labels.folderBatch.rolledBackResult;
    if (this.result.status === "conflict") return this.labels.folderBatch.conflictResult;
    if (this.result.status === "recoveryRequired") {
      return this.labels.folderBatch.recoveryResult(this.result.record?.recoveryTarget ?? "before");
    }
    return this.labels.folderBatch.rolledBackResult;
  }

  private conflictLabel(kind: "missing" | "tagsChanged" | "contentChanged"): string {
    if (kind === "missing") return this.labels.folderBatch.conflictMissing;
    if (kind === "tagsChanged") return this.labels.folderBatch.conflictTagsChanged;
    return this.labels.folderBatch.conflictContentChanged;
  }
}
