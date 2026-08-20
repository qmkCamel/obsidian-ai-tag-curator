import { describe, expect, it } from "vitest";
import type { AiProvider, ChatMessage } from "../src/ai/AiProvider";
import { TagHealthAiAnalyzer } from "../src/health/TagHealthAiAnalyzer";
import { analyzeTagHealth } from "../src/health/TagHealthAnalyzer";
import type { TagIndex, TagUsage } from "../src/index/TagIndex";

describe("TagHealthAiAnalyzer", () => {
  it("requests provider JSON and parses AI health analysis", async () => {
    const provider = new CapturingProvider(
      JSON.stringify({
        summary: "建议优先处理重复标签。",
        priorities: [
          {
            issueType: "nearDuplicates",
            tags: ["AI", "ai"],
            severity: "high",
            confidence: "high",
            diagnosis: "语义重复。",
            suggestedAction: "merge",
            targetTag: "AI",
            reason: "合并入口。"
          }
        ]
      })
    );
    const index: TagIndex = {
      updatedAt: "2026-05-12T00:00:00.000Z",
      tags: {
        AI: usage("AI", 2),
        ai: usage("ai", 1)
      }
    };

    const analyzer = new TagHealthAiAnalyzer(provider, {
      allowNewTags: false,
      newTagStrictness: "strict",
      uiLanguage: "zh-CN",
      promptProfile: "default"
    });
    const analysis = await analyzer.analyze(analyzeTagHealth(index), index);

    expect(provider.messages[0].content).toContain("Simplified Chinese");
    expect(analysis.summary).toBe("建议优先处理重复标签。");
    expect(analysis.priorities[0].targetTag).toBe("AI");
  });
});

class CapturingProvider implements AiProvider {
  messages: ChatMessage[] = [];

  constructor(private readonly response: string) {}

  async completeJson(messages: ChatMessage[]): Promise<string> {
    this.messages = messages;
    return this.response;
  }
}

function usage(tag: string, count: number): TagUsage {
  return {
    tag,
    normalized: tag.toLowerCase(),
    count,
    files: [{ path: `${tag}.md`, count: 1, sources: ["metadata"] }],
    examples: [{ path: `${tag}.md`, snippet: tag }],
    namingSignals: { hasHierarchy: false, depth: 1 }
  };
}
