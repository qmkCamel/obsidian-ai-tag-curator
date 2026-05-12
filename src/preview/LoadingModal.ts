// Keeps long-running plugin operations visible while vault scanning or AI calls run.
import { Modal } from "obsidian";

export class LoadingModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly title: string,
    private readonly message: string
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    contentEl.createDiv({ cls: "tag-curator-loading-spinner" });
    contentEl.createEl("p", { text: this.message });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
