import type { UiLanguagePreference } from "../ui/labels";

// Defines persisted plugin settings and conservative defaults.
export interface TagCuratorSettings {
  uiLanguage: UiLanguagePreference;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  maxRecommendations: number;
  allowNewTags: boolean;
  newTagStrictness: "strict" | "balanced" | "exploratory";
  readInlineTags: boolean;
  refreshIndexOnLoad: boolean;
  operationLogLimit: number;
}

export const DEFAULT_SETTINGS: TagCuratorSettings = {
  uiLanguage: "auto",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  maxRecommendations: 5,
  allowNewTags: false,
  newTagStrictness: "strict",
  readInlineTags: true,
  refreshIndexOnLoad: false,
  operationLogLimit: 20
};

export function mergeSettings(value: unknown): TagCuratorSettings {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    ...DEFAULT_SETTINGS,
    ...(value as Partial<TagCuratorSettings>)
  };
}
