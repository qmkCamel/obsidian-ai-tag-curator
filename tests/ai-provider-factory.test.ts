// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  createAiProvider,
  testProviderConnection,
  validateProviderSettings
} from "../src/ai/AiProviderFactory";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/settings/PluginSettings";
import {
  queueAiError,
  queueAiResponse,
  requestUrlMock,
  resetObsidianMockState
} from "./e2e/obsidian-harness";

const messages = [{ role: "user" as const, content: "Return JSON." }];

describe("AI provider factory", () => {
  beforeEach(() => {
    resetObsidianMockState();
  });

  it("validates remote keys but allows local providers without keys", () => {
    expect(validateProviderSettings(mergeSettings({ apiKey: "   " }))).toEqual({
      ok: false,
      issue: "missing-api-key"
    });
    expect(
      validateProviderSettings(
        mergeSettings({
          providerType: "local-openai-compatible",
          apiBaseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          model: "qwen3:4b"
        })
      )
    ).toMatchObject({
      ok: true,
      capabilities: {
        requiresApiKey: false,
        boundary: "loopback",
        providerConcurrency: 1,
        promptProfile: "edge-small"
      }
    });
  });

  it("sends Authorization only when configured and respects the JSON mode capability", async () => {
    queueAiResponse(JSON.stringify({ recommendations: [], warnings: [] }));
    const localProvider = createAiProvider(
      mergeSettings({
        providerType: "local-openai-compatible",
        apiBaseUrl: "http://127.0.0.1:11434/v1",
        apiKey: "",
        model: "qwen3:4b",
        supportsJsonMode: false
      })
    );
    await localProvider.completeJson(messages);
    const localRequest = requestUrlMock.mock.calls[0][0] as { headers: Record<string, string>; body: string };
    expect(localRequest.headers.Authorization).toBeUndefined();
    expect(JSON.parse(localRequest.body)).not.toHaveProperty("response_format");

    resetObsidianMockState();
    queueAiResponse(JSON.stringify({ recommendations: [], warnings: [] }));
    const remoteProvider = createAiProvider({ ...DEFAULT_SETTINGS, apiKey: "sk-secret" });
    await remoteProvider.completeJson(messages);
    const remoteRequest = requestUrlMock.mock.calls[0][0] as { headers: Record<string, string>; body: string };
    expect(remoteRequest.headers.Authorization).toBe("Bearer sk-secret");
    expect(JSON.parse(remoteRequest.body).response_format).toEqual({ type: "json_object" });
  });

  it("redacts API keys from provider errors", async () => {
    queueAiError(new Error("401 rejected sk-secret"));
    const provider = createAiProvider({ ...DEFAULT_SETTINGS, apiKey: "sk-secret" });
    await expect(provider.completeJson(messages)).rejects.toThrow("401 rejected [redacted]");
  });

  it("tests provider connections without leaking keys and classifies JSON mode and parser failures", async () => {
    queueAiError(new Error("models unavailable"));
    queueAiError(new Error("response_format json_object is unsupported"));
    const jsonModeResult = await testProviderConnection({ ...DEFAULT_SETTINGS, apiKey: "sk-secret" });
    expect(jsonModeResult).toMatchObject({
      ok: false,
      modelsEndpoint: "unavailable",
      errorKind: "json-mode-unsupported"
    });
    expect(JSON.stringify(jsonModeResult)).not.toContain("sk-secret");

    resetObsidianMockState();
    queueAiResponse(JSON.stringify({ models: [] }));
    queueAiResponse("plain text");
    const nonJsonResult = await testProviderConnection(
      mergeSettings({
        providerType: "local-openai-compatible",
        apiBaseUrl: "http://127.0.0.1:11434/v1",
        model: "qwen3:4b",
        supportsJsonMode: false
      })
    );
    expect(nonJsonResult).toMatchObject({
      ok: false,
      modelsEndpoint: "available",
      errorKind: "non-json-response"
    });
  });

  it.each([
    ["401 unauthorized", "auth-error"],
    ["404 model not found", "model-error"],
    ["Failed to fetch: connect ECONNREFUSED", "endpoint-unreachable"]
  ] as const)("classifies provider test failure: %s", async (message, errorKind) => {
    queueAiError(new Error("models unavailable"));
    queueAiError(new Error(message));

    const result = await testProviderConnection({ ...DEFAULT_SETTINGS, apiKey: "sk-secret" });

    expect(result).toMatchObject({
      ok: false,
      errorKind
    });
    expect(JSON.stringify(result)).not.toContain("sk-secret");
  });

  it("reports a successful test with provider type, endpoint, model, and JSON mode state", async () => {
    queueAiResponse(JSON.stringify({ models: [] }));
    queueAiResponse(JSON.stringify({ ok: true }));
    const result = await testProviderConnection(
      mergeSettings({
        providerType: "local-openai-compatible",
        apiBaseUrl: "http://127.0.0.1:11434/v1",
        model: "qwen3:4b",
        supportsJsonMode: false
      })
    );

    expect(result).toMatchObject({
      ok: true,
      providerType: "local-openai-compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "qwen3:4b",
      supportsJsonMode: false,
      modelsEndpoint: "available"
    });
  });

  it("reports provider-test stages without sending requests before validation", async () => {
    const stages: string[] = [];
    const invalid = await testProviderConnection(
      mergeSettings({ providerType: "local-openai-compatible", apiBaseUrl: "", model: "qwen3.8:27b" }),
      { onStage: (stage) => stages.push(stage) }
    );

    expect(stages).toEqual(["validating"]);
    expect(invalid).toMatchObject({ ok: false, errorKind: "missing-base-url" });
    expect(requestUrlMock).not.toHaveBeenCalled();

    queueAiResponse(JSON.stringify({ models: [] }));
    queueAiResponse(JSON.stringify({ ok: true }));
    const successStages: string[] = [];
    await testProviderConnection(
      mergeSettings({
        providerType: "local-openai-compatible",
        apiBaseUrl: "http://127.0.0.1:11434/v1",
        model: "qwen3.8:27b"
      }),
      { onStage: (stage) => successStages.push(stage) }
    );
    expect(successStages).toEqual(["validating", "probing-models", "testing-chat"]);
  });

  it("stops before chat completion when cancellation is observed after the model probe", async () => {
    queueAiResponse(JSON.stringify({ models: [] }));
    let cancellationChecks = 0;

    const result = await testProviderConnection(
      mergeSettings({
        providerType: "local-openai-compatible",
        apiBaseUrl: "http://127.0.0.1:11434/v1",
        model: "qwen3.8:27b"
      }),
      { isCancelled: () => ++cancellationChecks >= 2 }
    );

    expect(result).toMatchObject({
      ok: false,
      errorKind: "cancelled",
      modelsEndpoint: "available"
    });
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
  });
});
