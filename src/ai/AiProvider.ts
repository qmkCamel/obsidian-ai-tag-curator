// Defines the minimal chat-provider contract used by recommendation services.
export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface AiProvider {
  completeJson(messages: ChatMessage[]): Promise<string>;
}
