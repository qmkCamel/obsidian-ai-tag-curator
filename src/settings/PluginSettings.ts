import type { UiLanguagePreference } from "../ui/labels";

// Defines persisted plugin settings and conservative defaults.
export interface TagCuratorSettings {
  uiLanguage: UiLanguagePreference;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  maxRecommendations: number;
  maxFolderBatchFiles: number;
  allowNewTags: boolean;
  newTagStrictness: "strict" | "balanced" | "exploratory";
  readInlineTags: boolean;
  refreshIndexOnLoad: boolean;
  devMode: boolean;
  operationLogLimit: number;
}

export const DEFAULT_SETTINGS: TagCuratorSettings = {
  uiLanguage: "auto",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  maxRecommendations: 5,
  maxFolderBatchFiles: 50,
  allowNewTags: false,
  newTagStrictness: "strict",
  readInlineTags: true,
  refreshIndexOnLoad: false,
  devMode: false,
  operationLogLimit: 20
};

export function mergeSettings(value: unknown): TagCuratorSettings {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_SETTINGS };
  }

  const merged = {
    ...DEFAULT_SETTINGS,
    ...(value as Partial<TagCuratorSettings>)
  };

  return {
    ...merged,
    maxFolderBatchFiles: normalizeMaxFolderBatchFiles(merged.maxFolderBatchFiles)
  };
}

export function normalizeMaxFolderBatchFiles(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.maxFolderBatchFiles;
  }
  return Math.min(200, Math.max(1, Math.round(value)));
}
