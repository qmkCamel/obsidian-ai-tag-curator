// Displays V2 cleanup apply/undo/recovery outcomes and exposes only safe next actions.
import { Modal, Setting } from "obsidian";
import type { CleanupOperationRecordV2 } from "../operations/OperationLog";
import type { getLabels } from "../ui/labels";
import type { CleanupExecutionResult } from "./CleanupExecutor";
import type { CleanupRecoveryResult } from "./CleanupRecoveryService";

type Labels = ReturnType<typeof getLabels>;
type Result = CleanupExecutionResult | CleanupRecoveryResult;

export class CleanupResultModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly result: Result,
    private readonly labels: Labels,
    private readonly onUndo?: () => void,
    private readonly onRetryRecovery?: (record: CleanupOperationRecordV2) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("tag-curator-cleanup-result-modal");
    this.setTitle(this.labels.cleanupReview.resultTitle);
    this.contentEl.createEl("p", { text: this.resultText() });
    if (this.result.record?.partial) {
      this.contentEl.createDiv({
        cls: "tag-curator-cleanup-review__warning",
        text: this.labels.cleanupReview.partialResult
      });
    }
    if (this.result.error) {
      this.contentEl.createDiv({ cls: "tag-curator-cleanup-review__warning", text: this.result.error });
    }
    if (this.result.indexRefreshError) {
      this.contentEl.createDiv({
        cls: "tag-curator-cleanup-review__warning",
        text: this.labels.cleanupReview.indexRefreshFailure(this.result.indexRefreshError)
      });
    }
    if ("conflicts" in this.result) {
      const list = this.contentEl.createEl("ul");
      for (const conflict of this.result.conflicts) {
        list.createEl("li", { text: `${conflict.notePath}: ${this.conflictLabel(conflict.kind)}` });
      }
    }
    if ("files" in this.result) {
      const states = this.result.files.filter(
        (file) => file.recoveryState && file.recoveryState !== "before" && file.recoveryState !== "after"
      );
      if (states.length > 0) {
        const list = this.contentEl.createEl("ul");
        for (const file of states) list.createEl("li", { text: `${file.notePath}: ${file.recoveryState}` });
      }
    }

    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("tag-curator-cleanup-review__actions");
    actions.addButton((button) => button.setButtonText(this.labels.cleanupReview.close).onClick(() => this.close()));
    if (this.result.status === "applied" && this.onUndo) {
      actions.addButton((button) =>
        button.setButtonText(this.labels.cleanupReview.undo).onClick(() => {
          this.close();
          this.onUndo?.();
        })
      );
    }
    if (this.result.status === "recoveryRequired" && this.result.record && this.onRetryRecovery) {
      actions.addButton((button) =>
        button.setButtonText(this.labels.cleanupReview.retryRecovery).setWarning().onClick(() => {
          this.close();
          this.onRetryRecovery?.(this.result.record!);
        })
      );
    }
  }

  private resultText(): string {
    if (this.result.status === "applied") return this.labels.cleanupReview.appliedResult;
    if (this.result.status === "removed") return this.labels.cleanupReview.removedResult;
    if (this.result.status === "none") return this.labels.cleanupReview.noResult;
    if (this.result.status === "rolledBack") return this.labels.cleanupReview.rolledBackResult;
    if (this.result.status === "conflict") return this.labels.cleanupReview.conflictResult;
    return this.labels.cleanupReview.recoveryResult(this.result.record?.recoveryTarget ?? "before");
  }

  private conflictLabel(kind: "missing" | "tagsChanged" | "contentChanged" | "tokenChanged"): string {
    if (kind === "missing") return this.labels.cleanupReview.conflictMissing;
    if (kind === "tagsChanged") return this.labels.cleanupReview.conflictTagsChanged;
    if (kind === "tokenChanged") return this.labels.cleanupReview.conflictTokenChanged;
    return this.labels.cleanupReview.conflictContentChanged;
  }
}
