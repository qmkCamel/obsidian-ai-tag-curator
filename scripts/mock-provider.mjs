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
const healthBody = JSON.stringify({
  summary: "Local mock health summary.",
  priorities: [
    {
      issueType: "nearDuplicates",
      tags: ["ml_notes", "ml-notes"],
      severity: "high",
      confidence: "high",
      diagnosis: "These tags represent the same taxonomy entry.",
      suggestedAction: "merge",
      targetTag: "ml_notes",
      reason: "Keep one spelling for the same topic.",
      riskNote: "Review affected files before applying."
    }
  ]
});
const connectionTestBody = JSON.stringify({ ok: true });

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "GET" && request.url === "/v1/models") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "deterministic-local-mock" }] }));
    return;
  }

  let requestBody = "";
  request.on("data", (chunk) => {
    requestBody += chunk;
  });
  request.on("end", () => {
    setTimeout(() => {
      const content = chooseResponseContent(requestBody);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          id: "release-mock-response",
          model: "deterministic-local-mock",
          choices: [{ message: { role: "assistant", content } }]
        })
      );
    }, delayMs);
  });
});

function chooseResponseContent(requestBody) {
  if (requestBody.includes("Enhance a read-only Obsidian tag health report")) {
    return healthBody;
  }
  if (requestBody.includes("Return exactly this JSON object")) {
    return connectionTestBody;
  }
  return recommendationBody;
}

server.listen(port, host, () => {
  console.log(`Deterministic mock provider listening on http://${host}:${port}/v1`);
  console.log(`Response delay: ${delayMs}ms`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
