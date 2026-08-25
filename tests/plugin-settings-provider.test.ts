import { describe, expect, it } from "vitest";
import { applyProviderPresetSettings, DEFAULT_SETTINGS, mergeSettings } from "../src/settings/PluginSettings";

describe("provider settings", () => {
  it("keeps legacy settings compatible with remote OpenAI-compatible defaults", () => {
    expect(mergeSettings({ apiBaseUrl: "https://provider.example/v1", model: "model" })).toMatchObject({
      providerType: "openai-compatible",
      providerPreset: "openai",
      apiBaseUrl: "https://provider.example/v1",
      model: "model",
      supportsJsonMode: true,
      providerConcurrency: 2,
      promptProfile: "default"
    });
  });

  it("normalizes provider type, concurrency, and prompt profile safely", () => {
    expect(
      mergeSettings({
        providerType: "unknown",
        providerPreset: "unknown",
        providerConcurrency: 3,
        promptProfile: "large"
      })
    ).toMatchObject({
      providerType: "openai-compatible",
      providerPreset: "openai",
      providerConcurrency: 2,
      promptProfile: "default"
    });
    expect(mergeSettings({ providerConcurrency: 1 }).providerConcurrency).toBe(1);
  });

  it("atomically switches from a remote preset to Ollama without reusing credentials or model names", () => {
    const ollama = applyProviderPresetSettings(
      { ...DEFAULT_SETTINGS, apiKey: "sk-remote", model: "gpt-4o-mini" },
      "ollama"
    );
    expect(ollama).toMatchObject({
      providerType: "local-openai-compatible",
      providerPreset: "ollama",
      apiBaseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "",
      model: "",
      supportsJsonMode: false,
      providerConcurrency: 1,
      promptProfile: "edge-small"
    });

    const litert = applyProviderPresetSettings({ ...DEFAULT_SETTINGS, model: "" }, "litert-lm");
    expect(litert.apiBaseUrl).toBe("http://127.0.0.1:9379/v1");
    expect(litert.providerConcurrency).toBe(1);
  });

  it("uses the destination remote defaults and clears the previous provider key", () => {
    const deepseek = applyProviderPresetSettings(
      { ...DEFAULT_SETTINGS, apiKey: "sk-openai", model: "gpt-4o-mini" },
      "deepseek"
    );

    expect(deepseek).toMatchObject({
      providerType: "openai-compatible",
      providerPreset: "deepseek",
      apiBaseUrl: "https://api.deepseek.com",
      apiKey: "",
      model: "deepseek-chat",
      supportsJsonMode: true,
      providerConcurrency: 2,
      promptProfile: "default"
    });
  });

  it("preserves overrides when the selected preset did not change", () => {
    const settings = mergeSettings({
      providerType: "local-openai-compatible",
      providerPreset: "ollama",
      apiBaseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "local-token",
      model: "qwen3.8:27b",
      supportsJsonMode: true,
      providerConcurrency: 2,
      promptProfile: "default"
    });

    expect(applyProviderPresetSettings(settings, "ollama")).toEqual(settings);
  });

  it("clears credentials when entering custom mode but keeps the editable connection values", () => {
    const custom = applyProviderPresetSettings(
      { ...DEFAULT_SETTINGS, apiKey: "sk-openai", model: "gpt-4o-mini" },
      "custom"
    );

    expect(custom).toMatchObject({
      providerType: "openai-compatible",
      providerPreset: "custom",
      apiBaseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4o-mini"
    });
  });
});
