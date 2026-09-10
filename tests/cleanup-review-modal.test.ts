// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CleanupReviewModal } from "../src/cleanup/CleanupReviewModal";
import { getLabels } from "../src/ui/labels";
import { createFakeApp, installDomHelpers, resetObsidianMockState } from "./e2e/obsidian-harness";
import { samplePlan } from "./cleanup-review-view-model.test";

describe("CleanupReviewModal", () => {
  beforeEach(() => {
    installDomHelpers();
    resetObsidianMockState();
  });

  it.each(["zh-CN", "en"] as const)("renders keyboard toggles, unavailable context, and second confirmation in %s", async (language) => {
    const labels = getLabels(language);
    const app = createFakeApp([]);
    const onApply = vi.fn(async () => undefined);
    new CleanupReviewModal(app as never, samplePlan(), labels, onApply).open();

    expect(document.querySelector(".tag-curator-cleanup-review-modal")).toBeTruthy();
    expect(document.body.textContent).toContain("very/long/path/包含中文/note.md");
    expect(document.body.textContent).toContain("long 中文 context #old");
    expect(document.body.textContent).toContain(labels.cleanupReview.unavailable.positionMismatch);
    const toggles = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(toggles).toHaveLength(3);
    expect(toggles.filter((toggle) => toggle.disabled)).toHaveLength(1);

    click(labels.cleanupReview.clearAll);
    expect(button(labels.cleanupReview.apply).disabled).toBe(true);
    click(labels.cleanupReview.selectAll);
    expect(button(labels.cleanupReview.apply).disabled).toBe(false);
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).at(-1)?.disabled).toBe(true);

    click(labels.cleanupReview.apply);
    expect(document.body.textContent).toContain(labels.cleanupReview.confirmTitle);
    expect(onApply).not.toHaveBeenCalled();
    click(labels.cleanupReview.confirmApply);
    await Promise.resolve();
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});

function button(text: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === text
  );
  expect(match, `Missing button: ${text}`).toBeDefined();
  return match!;
}

function click(text: string): void {
  button(text).click();
}
