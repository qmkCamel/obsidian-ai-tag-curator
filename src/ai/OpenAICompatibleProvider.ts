// Calls any OpenAI-compatible chat completions endpoint and returns JSON text.
import { requestUrl } from "obsidian";
import type { TagCuratorSettings } from "../settings/PluginSettings";
import type { AiProvider, ChatMessage } from "./AiProvider";

export interface OpenAICompatibleProviderOptions {
  supportsJsonMode: boolean;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OpenAICompatibleProvider implements AiProvider {
  constructor(
    private readonly settings: TagCuratorSettings,
    private readonly options: OpenAICompatibleProviderOptions = { supportsJsonMode: true }
  ) {}

  async completeJson(messages: ChatMessage[]): Promise<string> {
    const response = await requestUrl({
      url: `${this.settings.apiBaseUrl.replace(/\/$/, "")}/chat/completions`,
      method: "POST",
      headers: buildHeaders(this.settings.apiKey),
      body: JSON.stringify(buildRequestBody(this.settings.model, messages, this.options.supportsJsonMode))
    }).catch((error: unknown) => {
      throw new Error(redactApiKey(errorMessage(error), this.settings.apiKey));
    });

    const json = response.json as OpenAIChatResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI provider returned an empty response.");
    }

    return content;
  }
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const trimmedKey = apiKey.trim();
  if (trimmedKey) {
    headers.Authorization = `Bearer ${trimmedKey}`;
  }
  return headers;
}

function buildRequestBody(model: string, messages: ChatMessage[], supportsJsonMode: boolean): Record<string, unknown> {
  return {
    model,
    messages,
    temperature: 0.2,
    ...(supportsJsonMode ? { response_format: { type: "json_object" } } : {})
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactApiKey(message: string, apiKey: string): string {
  const trimmedKey = apiKey.trim();
  return trimmedKey ? message.split(trimmedKey).join("[redacted]") : message;
}
