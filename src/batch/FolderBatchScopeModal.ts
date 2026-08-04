// Confirms the exact folder scope before any note read, index build, or provider request begins.
import { ButtonComponent, Modal, Setting } from "obsidian";
import type { VaultReader } from "../obsidian/VaultReader";
import type { getLabels } from "../ui/labels";
import { buildFolderBatchScopeViewModel, type FolderBatchScopeViewModel } from "./FolderBatchScope";
import { FolderSuggestModal } from "./FolderSuggestModal";

type Labels = ReturnType<typeof getLabels>;

export class FolderBatchScopeModal extends Modal {
  private folderPath: string;
  private includeSubfolders = true;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly reader: VaultReader,
    defaultFolderPath: string,
    private readonly maxFolderBatchFiles: number,
    private readonly hasApiKey: boolean,
    private readonly labels: Labels,
    private readonly onStart: (scope: FolderBatchScopeViewModel) => void
  ) {
    super(app);
    this.folderPath = defaultFolderPath;
  }

  onOpen(): void {
    this.modalEl.addClass("tag-curator-folder-scope-modal");
    this.render();
  }

  private currentScope(): FolderBatchScopeViewModel {
    return buildFolderBatchScopeViewModel({
      folderPath: this.folderPath,
      includeSubfolders: this.includeSubfolders,
      filePaths: this.reader.listMarkdownFilesInFolder(this.folderPath, this.includeSubfolders).map((file) => file.path),
      maxFolderBatchFiles: this.maxFolderBatchFiles,
      hasApiKey: this.hasApiKey
    });
  }

  private render(): void {
    const scope = this.currentScope();
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.labels.folderBatch.scopeTitle });
    this.contentEl.createEl("p", { cls: "tag-curator-folder-batch__muted", text: this.labels.folderBatch.scopeSubtitle });

    new Setting(this.contentEl)
      .setName(this.labels.folderBatch.folderName)
      .setDesc(scope.folderPath || this.labels.folderBatch.rootFolder)
      .addButton((button) =>
        button.setButtonText(this.labels.folderBatch.chooseFolder).onClick(() => {
          new FolderSuggestModal(this.app, this.reader.listVaultFolders(), this.labels, (folder) => {
            this.folderPath = folder.path;
            this.render();
          }).open();
        })
      );

    new Setting(this.contentEl)
      .setName(this.labels.folderBatch.includeSubfolders)
      .setDesc(this.labels.folderBatch.includeSubfoldersDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.includeSubfolders).onChange((value) => {
          this.includeSubfolders = value;
          this.render();
        })
      );

    const metrics = this.contentEl.createDiv({ cls: "tag-curator-folder-batch__metrics" });
    metrics.createDiv({ text: this.labels.folderBatch.fileCount(scope.fileCount) });
    metrics.createDiv({ text: this.labels.folderBatch.requestCount(scope.estimatedRequestCount) });
    metrics.createDiv({ text: this.labels.folderBatch.maxLimit(scope.maxFolderBatchFiles) });
    this.contentEl.createEl("p", { cls: "tag-curator-folder-batch__muted", text: this.labels.folderBatch.providerNotice });

    if (scope.blockReason === "empty") {
      this.contentEl.createDiv({ cls: "tag-curator-folder-batch__warning", text: this.labels.folderBatch.emptyScope });
    } else if (scope.blockReason === "overLimit") {
      this.contentEl.createDiv({
        cls: "tag-curator-folder-batch__warning",
        text: this.labels.folderBatch.overLimit(scope.fileCount, scope.maxFolderBatchFiles)
      });
    }

    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass("tag-curator-folder-batch__actions");
    actions.addButton((button: ButtonComponent) =>
      button
        .setButtonText(this.labels.folderBatch.start)
        .setCta()
        .setDisabled(!scope.canStart)
        .onClick(() => {
          if (!scope.canStart) {
            return;
          }
          this.close();
          this.onStart(scope);
        })
    );
  }
}
