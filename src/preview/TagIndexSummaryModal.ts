// Shows the cached vault tag index so refresh results are visible beyond a toast.
import { Modal } from "obsidian";
import { summarizeTagIndex } from "../index/TagIndexSummary";
import type { TagIndex } from "../index/TagIndex";
import type { getLabels } from "../ui/labels";
import { renderClickableTag } from "./ClickableTag";

type Labels = ReturnType<typeof getLabels>;

export class TagIndexSummaryModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly index: TagIndex,
    private readonly labels: Labels
  ) {
    super(app);
  }

  onOpen(): void {
    const summary = summarizeTagIndex(this.index);
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: this.labels.summary.title });
    contentEl.createEl("p", {
      text: this.labels.summary.lastRefreshed(new Date(summary.updatedAt).toLocaleString())
    });

    const stats = contentEl.createEl("ul", { cls: "tag-curator-summary-stats" });
    stats.createEl("li", { text: this.labels.summary.tags(summary.totalTags) });
    stats.createEl("li", { text: this.labels.summary.usages(summary.totalUsages) });
    stats.createEl("li", { text: this.labels.summary.files(summary.totalFiles) });
    stats.createEl("li", { text: this.labels.summary.hierarchical(summary.hierarchicalTags) });

    contentEl.createEl("h3", { text: this.labels.summary.topTags });
    const list = contentEl.createEl("ol", { cls: "tag-curator-summary-tags" });

    for (const item of summary.topTags) {
      const listItem = list.createEl("li");
      renderClickableTag(this.app, listItem, item.tag, this.labels);
      listItem.createSpan({
        cls: "tag-curator-summary-tag-meta",
        text: this.labels.summary.topTagStats(item.count, item.fileCount)
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
