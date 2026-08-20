import type { UiLanguagePreference } from "../ui/labels";

export type AiProviderType = "openai-compatible" | "local-openai-compatible";
export type AiProviderPreset = "openai" | "deepseek" | "litert-lm" | "ollama" | "lm-studio" | "custom";
export type AiPromptProfile = "default" | "edge-small";
export type ProviderConcurrency = 1 | 2;

export interface ProviderPresetDefaults {
  providerType: AiProviderType;
  apiBaseUrl: string;
  model: string;
  supportsJsonMode: boolean;
  providerConcurrency: ProviderConcurrency;
  promptProfile: AiPromptProfile;
}

// Defines persisted plugin settings and conservative defaults.
export interface TagCuratorSettings {
  uiLanguage: UiLanguagePreference;
  providerType: AiProviderType;
  providerPreset: AiProviderPreset;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  supportsJsonMode: boolean;
  providerConcurrency: ProviderConcurrency;
  promptProfile: AiPromptProfile;
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
  providerType: "openai-compatible",
  providerPreset: "openai",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  supportsJsonMode: true,
  providerConcurrency: 2,
  promptProfile: "default",
  maxRecommendations: 5,
  maxFolderBatchFiles: 50,
  allowNewTags: false,
  newTagStrictness: "strict",
  readInlineTags: true,
  refreshIndexOnLoad: false,
  devMode: false,
  operationLogLimit: 20
};

export const PROVIDER_PRESET_DEFAULTS: Record<AiProviderPreset, ProviderPresetDefaults> = {
  openai: {
    providerType: "openai-compatible",
    apiBaseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    supportsJsonMode: true,
    providerConcurrency: 2,
    promptProfile: "default"
  },
  deepseek: {
    providerType: "openai-compatible",
    apiBaseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    supportsJsonMode: true,
    providerConcurrency: 2,
    promptProfile: "default"
  },
  "litert-lm": {
    providerType: "local-openai-compatible",
    apiBaseUrl: "http://127.0.0.1:9379/v1",
    model: "",
    supportsJsonMode: false,
    providerConcurrency: 1,
    promptProfile: "edge-small"
  },
  ollama: {
    providerType: "local-openai-compatible",
    apiBaseUrl: "http://127.0.0.1:11434/v1",
    model: "",
    supportsJsonMode: false,
    providerConcurrency: 1,
    promptProfile: "edge-small"
  },
  "lm-studio": {
    providerType: "local-openai-compatible",
    apiBaseUrl: "http://127.0.0.1:1234/v1",
    model: "",
    supportsJsonMode: false,
    providerConcurrency: 1,
    promptProfile: "edge-small"
  },
  custom: {
    providerType: "local-openai-compatible",
    apiBaseUrl: "",
    model: "",
    supportsJsonMode: false,
    providerConcurrency: 1,
    promptProfile: "edge-small"
  }
};

export function mergeSettings(value: unknown): TagCuratorSettings {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_SETTINGS };
  }
  const partial = value as Partial<TagCuratorSettings>;

  const merged = {
    ...DEFAULT_SETTINGS,
    ...partial
  };
  const providerPreset =
    partial.providerPreset === undefined && partial.providerType === "local-openai-compatible"
      ? "custom"
      : normalizeProviderPreset(merged.providerPreset);
  const presetDefaults = PROVIDER_PRESET_DEFAULTS[providerPreset];
  const providerType =
    partial.providerType === undefined
      ? presetDefaults.providerType
      : normalizeProviderType(merged.providerType);

  return {
    ...merged,
    providerType,
    providerPreset,
    supportsJsonMode:
      partial.supportsJsonMode === undefined
        ? presetDefaults.supportsJsonMode
        : normalizeBoolean(merged.supportsJsonMode, DEFAULT_SETTINGS.supportsJsonMode),
    providerConcurrency:
      partial.providerConcurrency === undefined
        ? presetDefaults.providerConcurrency
        : normalizeProviderConcurrency(merged.providerConcurrency),
    promptProfile:
      partial.promptProfile === undefined ? presetDefaults.promptProfile : normalizePromptProfile(merged.promptProfile),
    maxFolderBatchFiles: normalizeMaxFolderBatchFiles(merged.maxFolderBatchFiles)
  };
}

export function applyProviderPresetSettings(
  settings: TagCuratorSettings,
  preset: AiProviderPreset
): TagCuratorSettings {
  const normalizedPreset = normalizeProviderPreset(preset);
  if (normalizedPreset === "custom") {
    return mergeSettings({ ...settings, providerPreset: "custom" });
  }

  const defaults = PROVIDER_PRESET_DEFAULTS[normalizedPreset];
  return mergeSettings({
    ...settings,
    providerPreset: normalizedPreset,
    providerType: defaults.providerType,
    apiBaseUrl: defaults.apiBaseUrl,
    model: settings.model.trim() || defaults.model,
    supportsJsonMode: defaults.supportsJsonMode,
    providerConcurrency: defaults.providerConcurrency,
    promptProfile: defaults.promptProfile
  });
}

export function normalizeMaxFolderBatchFiles(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.maxFolderBatchFiles;
  }
  return Math.min(200, Math.max(1, Math.round(value)));
}

export function normalizeProviderType(value: unknown): AiProviderType {
  return value === "local-openai-compatible" ? "local-openai-compatible" : DEFAULT_SETTINGS.providerType;
}

export function normalizeProviderPreset(value: unknown): AiProviderPreset {
  return typeof value === "string" && value in PROVIDER_PRESET_DEFAULTS
    ? (value as AiProviderPreset)
    : DEFAULT_SETTINGS.providerPreset;
}

export function normalizePromptProfile(value: unknown): AiPromptProfile {
  return value === "edge-small" ? "edge-small" : DEFAULT_SETTINGS.promptProfile;
}

export function normalizeProviderConcurrency(value: unknown): ProviderConcurrency {
  return value === 1 ? 1 : DEFAULT_SETTINGS.providerConcurrency;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
