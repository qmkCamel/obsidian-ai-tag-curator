import http from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.MOCK_PROVIDER_PORT ?? 18765);
const delayMs = Number(process.env.MOCK_PROVIDER_DELAY_MS ?? 1800);
const recommendationBody = JSON.stringify({
  recommendations: [
    {
      tag: "release-ready",
      type: "existing",
      confidence: "high",
      reason: "Reuse the vault release taxonomy."
    },
    {
      tag: "reviewed",
      type: "new",
      confidence: "medium",
      reason: "Mark notes included in the release review."
    }
  ],
  warnings: []
});
const healthAnalysisBody = JSON.stringify({
  summary: "优先合并仅分隔符不同的机器学习标签。",
  priorities: [
    {
      issueType: "nearDuplicates",
      tags: ["ml_notes", "ml-notes"],
      severity: "high",
      confidence: "high",
      diagnosis: "#ml_notes 与 #ml-notes 表达同一分类，仅分隔符不同。",
      suggestedAction: "merge",
      targetTag: "ml-notes",
      reason: "复用出现次数更多的 #ml-notes 可统一检索入口。",
      riskNote: "仅写入用户逐项确认且位置精确匹配的 frontmatter 与 inline token。"
    }
  ]
});

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  let requestBody = "";
  request.on("data", (chunk) => {
    requestBody += chunk;
  });
  request.on("end", () => {
    setTimeout(() => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          id: "release-mock-response",
          model: "deterministic-local-mock",
          choices: [{ message: { role: "assistant", content: responseContentFor(requestBody) } }]
        })
      );
    }, delayMs);
  });
});

server.listen(port, host, () => {
  console.log(`Deterministic mock provider listening on http://${host}:${port}/v1`);
  console.log(`Response delay: ${delayMs}ms`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

function responseContentFor(requestBody) {
  try {
    const parsed = JSON.parse(requestBody);
    const userMessage = parsed.messages?.find((message) => message.role === "user")?.content;
    if (
      typeof userMessage === "string" &&
      userMessage.includes("Enhance a read-only Obsidian tag health report.")
    ) {
      return healthAnalysisBody;
    }
  } catch {
    // Invalid requests still receive the deterministic recommendation fixture.
  }

  return recommendationBody;
}
