// Shared clickable tag pill used by summaries and reports for consistent copy/search behavior.
import { App, Notice } from "obsidian";
import type { getLabels } from "../ui/labels";
import { formatTagClipboardText, formatTagSearchQuery } from "./TagHealthTagActions";

type Labels = ReturnType<typeof getLabels>;
type SearchViewLike = { setQuery?: (query: string) => void };

export function renderClickableTag(app: App, parent: HTMLElement, tag: string, labels: Labels): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "tag-curator-health__tag",
    text: formatTagClipboardText(tag)
  });
  button.type = "button";
  button.setAttr("title", labels.health.clickTagAction(tag));
  button.onClickEvent(() => {
    void copyAndSearchTag(app, tag, labels);
  });
  return button;
}

async function copyAndSearchTag(app: App, tag: string, labels: Labels): Promise<void> {
  try {
    await navigator.clipboard.writeText(formatTagClipboardText(tag));
    await openSearch(app, formatTagSearchQuery(tag));
    new Notice(labels.health.tagActionDone(tag));
  } catch (error) {
    new Notice(error instanceof Error ? error.message : labels.health.tagActionFailed);
  }
}

async function openSearch(app: App, query: string): Promise<void> {
  const leaf = app.workspace.getLeavesOfType("search")[0] ?? app.workspace.getLeftLeaf(false);
  if (!leaf) {
    return;
  }

  await leaf.setViewState({ type: "search", state: { query }, active: true });
  await app.workspace.revealLeaf(leaf);

  const searchView = leaf.view as SearchViewLike;
  if (typeof searchView.setQuery === "function") {
    searchView.setQuery(query);
  }
}
