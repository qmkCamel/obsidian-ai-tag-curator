import { requestUrl } from "obsidian";
import type { AiProvider, ChatMessage } from "./AiProvider";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider";
import type { TagCuratorSettings } from "../settings/PluginSettings";

export type ProviderConfigIssue = "missing-base-url" | "invalid-base-url" | "missing-model" | "missing-api-key";
export type ProviderEndpointBoundary = "loopback" | "custom" | "remote";
export type ProviderTestErrorKind =
  | ProviderConfigIssue
  | "endpoint-unreachable"
  | "auth-error"
  | "model-error"
  | "json-mode-unsupported"
  | "non-json-response"
  | "empty-response"
  | "provider-error";

export interface ProviderCapabilities {
  requiresApiKey: boolean;
  supportsJsonMode: boolean;
  providerConcurrency: 1 | 2;
  promptProfile: TagCuratorSettings["promptProfile"];
  boundary: ProviderEndpointBoundary;
  endpointHost: string;
}

export type ProviderConfigState =
  | {
      ok: true;
      capabilities: ProviderCapabilities;
    }
  | {
      ok: false;
      issue: ProviderConfigIssue;
    };

export interface ProviderTestResult {
  ok: boolean;
  providerType: TagCuratorSettings["providerType"];
  baseUrl: string;
  model: string;
  supportsJsonMode: boolean;
  modelsEndpoint: "available" | "unavailable" | "not-tested";
  errorKind?: ProviderTestErrorKind;
  message: string;
}

interface ModelsProbeResult {
  status: ProviderTestResult["modelsEndpoint"];
}

export function createAiProvider(settings: TagCuratorSettings): AiProvider {
  const state = validateProviderSettings(settings);
  if (!state.ok) {
    throw new Error(providerConfigIssueMessage(state.issue));
  }
  return new OpenAICompatibleProvider(settings, {
    supportsJsonMode: state.capabilities.supportsJsonMode
  });
}

export function validateProviderSettings(settings: TagCuratorSettings): ProviderConfigState {
  if (!settings.apiBaseUrl.trim()) {
    return { ok: false, issue: "missing-base-url" };
  }
  if (!parseHttpUrl(settings.apiBaseUrl)) {
    return { ok: false, issue: "invalid-base-url" };
  }
  if (!settings.model.trim()) {
    return { ok: false, issue: "missing-model" };
  }
  const capabilities = getProviderCapabilities(settings);
  if (capabilities.requiresApiKey && !settings.apiKey.trim()) {
    return { ok: false, issue: "missing-api-key" };
  }
  return { ok: true, capabilities };
}

export function getProviderCapabilities(settings: TagCuratorSettings): ProviderCapabilities {
  const url = parseHttpUrl(settings.apiBaseUrl);
  return {
    requiresApiKey: settings.providerType === "openai-compatible",
    supportsJsonMode: settings.supportsJsonMode,
    providerConcurrency: settings.providerConcurrency,
    promptProfile: settings.promptProfile,
    boundary: deriveEndpointBoundary(settings, url),
    endpointHost: url?.host ?? ""
  };
}

export function describeProviderEndpoint(settings: TagCuratorSettings): {
  boundary: ProviderEndpointBoundary;
  host: string;
} {
  const capabilities = getProviderCapabilities(settings);
  return {
    boundary: capabilities.boundary,
    host: capabilities.endpointHost || settings.apiBaseUrl.trim()
  };
}

export async function testProviderConnection(settings: TagCuratorSettings): Promise<ProviderTestResult> {
  const state = validateProviderSettings(settings);
  if (!state.ok) {
    return {
      ok: false,
      providerType: settings.providerType,
      baseUrl: settings.apiBaseUrl,
      model: settings.model,
      supportsJsonMode: settings.supportsJsonMode,
      modelsEndpoint: "not-tested",
      errorKind: state.issue,
      message: providerConfigIssueMessage(state.issue)
    };
  }

  const modelsProbe = await probeModelsEndpoint(settings);
  const provider = createAiProvider(settings);
  try {
    const raw = await provider.completeJson(providerTestMessages());
    const parsed = parseProviderJson(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        providerType: settings.providerType,
        baseUrl: settings.apiBaseUrl,
        model: settings.model,
        supportsJsonMode: settings.supportsJsonMode,
        modelsEndpoint: modelsProbe.status,
        errorKind: parsed.errorKind,
        message: parsed.message
      };
    }
    return {
      ok: true,
      providerType: settings.providerType,
      baseUrl: settings.apiBaseUrl,
      model: settings.model,
      supportsJsonMode: settings.supportsJsonMode,
      modelsEndpoint: modelsProbe.status,
      message: "Provider test succeeded."
    };
  } catch (error) {
    const classified = classifyProviderError(error, settings);
    return {
      ok: false,
      providerType: settings.providerType,
      baseUrl: settings.apiBaseUrl,
      model: settings.model,
      supportsJsonMode: settings.supportsJsonMode,
      modelsEndpoint: modelsProbe.status,
      errorKind: classified.kind,
      message: classified.message
    };
  }
}

export function providerConfigIssueMessage(issue: ProviderConfigIssue): string {
  switch (issue) {
    case "missing-base-url":
      return "AI provider base URL is not configured.";
    case "invalid-base-url":
      return "AI provider base URL must be an http or https URL.";
    case "missing-model":
      return "AI provider model is not configured.";
    case "missing-api-key":
      return "API key is not configured.";
  }
}

export function sanitizeProviderErrorMessage(message: string, settings?: TagCuratorSettings): string {
  let sanitized = message;
  const key = settings?.apiKey.trim();
  if (key) {
    sanitized = sanitized.split(key).join("[redacted]");
  }
  return sanitized;
}

export function buildOpenAICompatibleHeaders(settings: TagCuratorSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const key = settings.apiKey.trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

export function buildChatCompletionsUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function deriveEndpointBoundary(settings: TagCuratorSettings, url: URL | null): ProviderEndpointBoundary {
  if (settings.providerType === "openai-compatible") {
    return "remote";
  }
  if (!url) {
    return "custom";
  }
  return isLoopbackHost(url.hostname) ? "loopback" : "custom";
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

async function probeModelsEndpoint(settings: TagCuratorSettings): Promise<ModelsProbeResult> {
  try {
    await requestUrl({
      url: `${settings.apiBaseUrl.replace(/\/+$/, "")}/models`,
      method: "GET",
      headers: buildOpenAICompatibleHeaders(settings)
    });
    return { status: "available" };
  } catch {
    return { status: "unavailable" };
  }
}

function providerTestMessages(): ChatMessage[] {
  return [
    {
      role: "system",
      content: "Return only valid JSON. Do not include Markdown."
    },
    {
      role: "user",
      content: 'Return exactly this JSON object: {"ok":true}'
    }
  ];
}

function parseProviderJson(raw: string):
  | { ok: true }
  | {
      ok: false;
      errorKind: ProviderTestErrorKind;
      message: string;
    } {
  try {
    const parsed = JSON.parse(raw) as { ok?: unknown };
    if (parsed && typeof parsed === "object" && parsed.ok === true) {
      return { ok: true };
    }
  } catch {
    return {
      ok: false,
      errorKind: "non-json-response",
      message: "Provider returned content that is not valid JSON."
    };
  }

  return {
    ok: false,
    errorKind: "non-json-response",
    message: "Provider returned JSON in an unsupported shape."
  };
}

function classifyProviderError(error: unknown, settings: TagCuratorSettings): { kind: ProviderTestErrorKind; message: string } {
  const message = sanitizeProviderErrorMessage(error instanceof Error ? error.message : String(error), settings);
  const lower = message.toLowerCase();
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    return { kind: "auth-error", message };
  }
  if (lower.includes("404") || lower.includes("model")) {
    return { kind: "model-error", message };
  }
  if (lower.includes("response_format") || lower.includes("json mode") || lower.includes("json_object")) {
    return { kind: "json-mode-unsupported", message };
  }
  if (lower.includes("empty response")) {
    return { kind: "empty-response", message };
  }
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("connect")) {
    return { kind: "endpoint-unreachable", message };
  }
  return { kind: "provider-error", message };
}
