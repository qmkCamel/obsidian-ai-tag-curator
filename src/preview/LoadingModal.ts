// Keeps long-running plugin operations visible while vault scanning or AI calls run.
import { ButtonComponent, Modal, Setting } from "obsidian";

export class LoadingModal extends Modal {
  private collapsed = false;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly title: string,
    private readonly message: string,
    private readonly minimizeLabel: string,
    private readonly expandLabel: string
  ) {
    super(app);
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createDiv({ cls: "tag-curator-loading-header" });
    header.createEl(this.collapsed ? "h3" : "h2", { text: this.title });

    new Setting(header).addButton((button: ButtonComponent) =>
      button.setButtonText(this.collapsed ? this.expandLabel : this.minimizeLabel).onClick(() => {
        this.collapsed = !this.collapsed;
        this.render();
      })
    );

    if (this.collapsed) {
      contentEl.createEl("p", {
        cls: "tag-curator-loading-compact",
        text: this.message
      });
      return;
    }

    contentEl.createDiv({ cls: "tag-curator-loading-spinner" });
    contentEl.createEl("p", { text: this.message });
  }
}
