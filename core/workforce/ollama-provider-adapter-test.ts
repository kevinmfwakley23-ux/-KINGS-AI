import assert from "node:assert/strict";

import type { ModelExecutionRequest } from "./model-interface";
import {
  OllamaProviderAdapter,
  createConfiguredOllamaAdapter,
} from "./ollama-provider-adapter";

function request(overrides: Partial<ModelExecutionRequest> = {}): ModelExecutionRequest {
  return {
    id: "ollama-provider-request",
    taskId: "ollama-provider-task",
    missionId: "ollama-provider-mission",
    messages: [{ role: "user", content: "Return a concise answer." }],
    requiredCapabilities: ["reasoning", "coding"],
    inputModalities: ["text"],
    outputModality: "text",
    maxOutputTokens: 321,
    temperature: 0.25,
    allowToolProposals: false,
    ...overrides,
  };
}

async function main(): Promise<void> {
  assert.equal(createConfiguredOllamaAdapter({}), undefined, "Ollama must not register unless explicitly configured");
  assert.throws(
    () => createConfiguredOllamaAdapter({ KINGS_OLLAMA_MODEL: "qwen2.5-coder:0.5b" }),
    /KINGS_OLLAMA_BASE_URL is required/,
  );
  assert.throws(
    () => createConfiguredOllamaAdapter({ KINGS_OLLAMA_BASE_URL: "http://127.0.0.1:11434" }),
    /KINGS_OLLAMA_MODEL or KINGS_OLLAMA_MODELS is required/,
  );

  const configured = createConfiguredOllamaAdapter({
    KINGS_OLLAMA_BASE_URL: "http://127.0.0.1:11434/",
    KINGS_OLLAMA_MODELS: "qwen2.5-coder:0.5b,qwen2.5-coder:1.5b,qwen2.5-coder:0.5b",
    KINGS_OLLAMA_TIMEOUT_MS: "5000",
  });
  assert.ok(configured);
  assert.deepEqual(configured.listModels().map((model) => model.modelId), [
    "qwen2.5-coder:0.5b",
    "qwen2.5-coder:1.5b",
  ]);
  const identity = configured.getModel("qwen2.5-coder:1.5b")?.identity;
  assert.equal(identity?.providerId, "ollama");
  assert.equal(identity?.providerKind, "internal-local");
  assert.equal(identity?.supportsToolCalling, false, "Adapter must not claim tool calls it cannot return");
  assert.equal(identity?.supportsStructuredOutput, false);
  assert.equal(configured.getModel("qwen2.5-coder:1.5b")?.canHandle(request({ requireStructuredOutput: true })), false);

  const originalFetch = global.fetch;
  let calledUrl = "";
  let calledBody: Record<string, unknown> | undefined;
  global.fetch = async (input, init) => {
    calledUrl = String(input);
    calledBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      response: "LOCAL_ROUTER_GREEN",
      done: true,
      prompt_eval_count: 11,
      eval_count: 7,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await configured.execute("qwen2.5-coder:0.5b", request());
    assert.equal(result.success, true);
    assert.equal(result.response?.content, "LOCAL_ROUTER_GREEN");
    assert.equal(result.response?.model.providerId, "ollama");
    assert.equal(result.response?.usage.inputTokens, 11);
    assert.equal(result.response?.usage.outputTokens, 7);
    assert.equal(result.response?.usage.estimatedCost, 0);
    assert.equal(calledUrl, "http://127.0.0.1:11434/api/generate");
    assert.equal(calledBody?.model, "qwen2.5-coder:0.5b");
    assert.deepEqual(calledBody?.options, { num_predict: 321, temperature: 0.25 });
  } finally {
    global.fetch = originalFetch;
  }

  const adapter = new OllamaProviderAdapter({
    baseUrl: "http://127.0.0.1:11434",
    models: ["local-test"],
    capabilities: ["reasoning"],
  });
  const unknown = await adapter.execute("missing-model", request({ requiredCapabilities: ["reasoning"] }));
  assert.equal(unknown.success, false);
  assert.equal(unknown.failure?.code, "OLLAMA_MODEL_NOT_REGISTERED");

  assert.throws(
    () => new OllamaProviderAdapter({
      baseUrl: "http://127.0.0.1:11434",
      models: ["local-test"],
      capabilities: ["reasoning", "tool-use"],
    }),
    /does not claim tool-use or structured-output support/,
  );

  console.log("K.I.N.G.S. local Ollama provider adapter: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
