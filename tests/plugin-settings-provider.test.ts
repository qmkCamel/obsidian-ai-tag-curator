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

  it("applies local presets without requiring an API key", () => {
    const ollama = applyProviderPresetSettings({ ...DEFAULT_SETTINGS, model: "" }, "ollama");
    expect(ollama).toMatchObject({
      providerType: "local-openai-compatible",
      providerPreset: "ollama",
      apiBaseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "",
      supportsJsonMode: false,
      providerConcurrency: 1,
      promptProfile: "edge-small"
    });

    const litert = applyProviderPresetSettings({ ...DEFAULT_SETTINGS, model: "" }, "litert-lm");
    expect(litert.apiBaseUrl).toBe("http://127.0.0.1:9379/v1");
    expect(litert.providerConcurrency).toBe(1);
  });
});
