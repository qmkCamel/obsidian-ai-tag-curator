// Derives display groups and confirmation counts from the immutable review plan.
import type { CleanupReviewFile, CleanupReviewPlan, SelectedCleanupPlan } from "./CleanupReviewPlan";
import { buildSelectedCleanupPlan } from "./CleanupReviewPlan";

export interface CleanupReviewFileView {
  notePath: string;
  status: CleanupReviewFile["status"];
  frontmatterSelected: boolean;
  frontmatterChanged: boolean;
  beforeTags: string[];
  afterTags: string[];
  trustedOccurrenceCount: number;
  selectedOccurrenceCount: number;
  unavailableOccurrenceCount: number;
  error?: string;
}

export interface CleanupReviewViewModel {
  selected: SelectedCleanupPlan;
  files: CleanupReviewFileView[];
  canApply: boolean;
  partial: boolean;
  hasUnavailable: boolean;
}

export function buildCleanupReviewViewModel(plan: CleanupReviewPlan): CleanupReviewViewModel {
  const selected = buildSelectedCleanupPlan(plan);
  const files = plan.files.map((file) => {
    const trusted = file.occurrences.filter((occurrence) => occurrence.availability === "trusted");
    return {
      notePath: file.notePath,
      status: file.status,
      frontmatterSelected: file.frontmatterSelected,
      frontmatterChanged: file.frontmatterChanged,
      beforeTags: [...file.beforeTags],
      afterTags: file.frontmatterSelected ? [...file.proposedAfterTags] : [...file.beforeTags],
      trustedOccurrenceCount: trusted.length,
      selectedOccurrenceCount: trusted.filter((occurrence) => occurrence.selected).length,
      unavailableOccurrenceCount: file.occurrences.length - trusted.length,
      error: file.error
    };
  });
  return {
    selected,
    files,
    canApply: !plan.cancelled && selected.files.length > 0,
    partial: selected.partial,
    hasUnavailable: files.some((file) => file.unavailableOccurrenceCount > 0)
  };
}
