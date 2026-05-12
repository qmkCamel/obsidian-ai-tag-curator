// Shows a read-only diagnosis of tag taxonomy health without applying changes.
import { Modal, Notice, Setting } from "obsidian";
import type { TagHealthIssue, TagHealthIssueType, TagHealthReport } from "../health/TagHealthReport";
import type { getLabels } from "../ui/labels";

type Labels = ReturnType<typeof getLabels>;

const SECTION_ORDER: TagHealthIssueType[] = [
  "lowFrequency",
  "nearDuplicates",
  "hierarchyInconsistency",
  "overBroad",
  "overNarrow",
  "namingDrift"
];

export class TagHealthReportModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly report: TagHealthReport,
    private readonly labels: Labels
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("tag-curator-health-modal");
    contentEl.empty();

    const header = contentEl.createDiv({ cls: "tag-curator-health__header" });
    header.createEl("h2", { text: this.labels.health.title });
    header.createEl("p", { text: this.labels.health.subtitle });
    header.createEl("div", {
      cls: "tag-curator-health__meta",
      text: `${this.labels.health.generatedAt(new Date(this.report.generatedAt).toLocaleString())} · ${this.labels.health.indexUpdatedAt(
        new Date(this.report.indexUpdatedAt).toLocaleString()
      )}`
    });

    this.renderSummary(contentEl);

    for (const sectionType of SECTION_ORDER) {
      this.renderSection(contentEl, sectionType);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderSummary(parent: HTMLElement): void {
    const summary = parent.createDiv({ cls: "tag-curator-health__summary" });
    summary.createDiv({ text: this.labels.health.summary.totalTags(this.report.summary.totalTags) });
    summary.createDiv({ text: this.labels.health.summary.totalUsages(this.report.summary.totalUsages) });
    summary.createDiv({ text: this.labels.health.summary.totalFiles(this.report.summary.totalFiles) });
    summary.createDiv({ text: this.labels.health.summary.riskItems(this.report.summary.riskItemCount) });
  }

  private renderSection(parent: HTMLElement, sectionType: TagHealthIssueType): void {
    const section = this.report.sections[sectionType];
    const container = parent.createDiv({ cls: "tag-curator-health__section" });
    container.createEl("h3", { text: this.labels.health.sections[sectionType] });

    if (section.items.length === 0) {
      container.createDiv({ cls: "tag-curator-health__empty", text: this.labels.health.noIssues });
      return;
    }

    for (const issue of section.items) {
      this.renderIssue(container, issue);
    }
  }

  private renderIssue(parent: HTMLElement, issue: TagHealthIssue): void {
    const card = parent.createDiv({ cls: "tag-curator-health__issue" });
    card.createDiv({ cls: "tag-curator-health__issue-title", text: issue.title });

    const tags = card.createDiv({ cls: "tag-curator-health__tags" });
    for (const tag of issue.tags) {
      tags.createSpan({ cls: "tag-curator-health__tag", text: `#${tag}` });
    }

    this.renderField(card, this.labels.health.evidence, issue.evidence);
    this.renderField(card, this.labels.health.impact, issue.impact);
    this.renderField(card, this.labels.health.suggestion, this.labels.health.suggestions[issue.suggestion]);

    const actions = new Setting(card);
    actions.settingEl.addClass("tag-curator-health__actions");
    actions.addButton((button) =>
      button.setButtonText(this.labels.health.copyTags).onClick(async () => {
        await navigator.clipboard.writeText(issue.tags.map((tag) => `#${tag}`).join(" "));
        new Notice(this.labels.health.copied);
      })
    );
  }

  private renderField(parent: HTMLElement, label: string, value: string): void {
    const field = parent.createDiv({ cls: "tag-curator-health__field" });
    field.createSpan({ cls: "tag-curator-health__field-label", text: `${label}: ` });
    field.createSpan({ text: value });
  }
}
