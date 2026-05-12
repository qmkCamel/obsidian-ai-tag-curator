// Calls any OpenAI-compatible chat completions endpoint and returns JSON text.
import { requestUrl } from "obsidian";
import type { TagCuratorSettings } from "../settings/PluginSettings";
import type { AiProvider, ChatMessage } from "./AiProvider";

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OpenAICompatibleProvider implements AiProvider {
  constructor(private readonly settings: TagCuratorSettings) {}

  async completeJson(messages: ChatMessage[]): Promise<string> {
    if (!this.settings.apiKey) {
      throw new Error("API key is not configured.");
    }

    const response = await requestUrl({
      url: `${this.settings.apiBaseUrl.replace(/\/$/, "")}/chat/completions`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.settings.model,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });

    const json = response.json as OpenAIChatResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI provider returned an empty response.");
    }

    return content;
  }
}
