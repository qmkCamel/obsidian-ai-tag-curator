// Lets the user choose any vault folder, including the vault root.
import { FuzzySuggestModal, TFolder } from "obsidian";
import type { getLabels } from "../ui/labels";

type Labels = ReturnType<typeof getLabels>;

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  constructor(
    app: ConstructorParameters<typeof FuzzySuggestModal<TFolder>>[0],
    private readonly folders: TFolder[],
    private readonly labels: Labels,
    private readonly onChoose: (folder: TFolder) => void
  ) {
    super(app);
  }

  getItems(): TFolder[] {
    return this.folders;
  }

  getItemText(folder: TFolder): string {
    return folder.path ? folder.path : this.labels.folderBatch.rootFolder;
  }

  onChooseItem(folder: TFolder): void {
    this.onChoose(folder);
  }
}
