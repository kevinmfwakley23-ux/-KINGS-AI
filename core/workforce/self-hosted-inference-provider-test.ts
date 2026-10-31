import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { ModelExecutionRequest } from "./model-interface";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { createConfiguredSelfHostedAdapter } from "./self-hosted-inference-provider";
import { registerConfiguredKingsInference, resolveKingsProviderOrder } from "./inference-sovereignty";

function request(): ModelExecutionRequest {
  return {
    id: "owner-hosted-request",
    taskId: "owner-hosted-task",
    missionId: "owner-hosted-mission",
    messages: [{ role: "user", content: "Analyze this card without inventing comparable sales." }],
    requiredCapabilities: ["reasoning", "research", "verification"],
    inputModalities: ["text"],
    outputModality: "text",
    maxOutputTokens: 192,
    temperature: 0.2,
    allowToolProposals: false,
  };
}

async function main(): Promise<void> {
  assert.equal(createConfiguredSelfHostedAdapter({}), undefined,
    "No owner-hosted inference must be registered without explicit configuration");
  assert.throws(() => createConfiguredSelfHostedAdapter({
    KINGS_SELF_HOSTED_BASE_URL: "http://127.0.0.1:9000/v1",
  }), /must both be configured/);
  assert.throws(() => createConfiguredSelfHostedAdapter({
    KINGS_SELF_HOSTED_MODEL: "kings-weights",
  }), /must both be configured/);
  assert.throws(() => createConfiguredSelfHostedAdapter({
    KINGS_SELF_HOSTED_BASE_URL: "https://api.some-cloud.ai/v1",
    KINGS_SELF_HOSTED_MODEL: "auto",
  }), /exact local model/);
  assert.throws(() => createConfiguredSelfHostedAdapter({
    KINGS_SELF_HOSTED_BASE_URL: "http://127.0.0.1:9000/v2",
    KINGS_SELF_HOSTED_MODEL: "kings-weights",
  }), /clean HTTP\(S\) \/v1 model endpoint/);
  assert.throws(() => createConfiguredSelfHostedAdapter({
    KINGS_SELF_HOSTED_BASE_URL: "http://127.0.0.1:9000/v1",
    KINGS_SELF_HOSTED_MODEL: "kings-weights",
    KINGS_SELF_HOSTED_CAPABILITIES: "reasoning,vision",
  }), /unsupported capability/);
  assert.throws(() => createConfiguredSelfHostedAdapter({
    KINGS_SELF_HOSTED_BASE_URL: "http://127.0.0.1:9000/v1",
    KINGS_SELF_HOSTED_MODEL: "kings-weights",
    KINGS_SELF_HOSTED_CONTEXT_TOKENS: "9999999999",
  }), /CONTEXT_TOKENS/);
  assert.throws(() => createConfiguredSelfHostedAdapter({
    KINGS_SELF_HOSTED_BASE_URL: "http://127.0.0.1:9000/v1",
    KINGS_SELF_HOSTED_MODEL: "kings-weights",
    KINGS_SELF_HOSTED_TOOL_CALLING: "true",
  }), /requires verified tool-use/);

  let hits = 0;
  const server = createServer(async (req, res) => {
    hits += 1;
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/v1/chat/completions", "owner-hosted model must use exact private endpoint");
    assert.equal(req.headers.authorization, "Bearer local-owner-only-test");
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
    };
    assert.equal(body.model, "kings-owned-v1");
    assert.equal(body.messages.at(-1)?.role, "user");
    assert.equal(body.max_tokens, 192);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "local-inference-001",
      choices: [{ message: { content: "Evidence only: no completed sales data provided." } }],
      usage: { prompt_tokens: 18, completion_tokens: 12, total_tokens: 30 },
    }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address() as AddressInfo;
    const env: NodeJS.ProcessEnv = {
      KINGS_INTELLIGENCE_MODE: "sovereign",
      KINGS_SELF_HOSTED_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
      KINGS_SELF_HOSTED_MODEL: "kings-owned-v1",
      KINGS_SELF_HOSTED_CAPABILITIES: "reasoning,research,verification",
      KINGS_SELF_HOSTED_CONTEXT_TOKENS: "65536",
      KINGS_SELF_HOSTED_API_KEY: "local-owner-only-test",
      KINGS_OMNIROUTE_MODELS: "should-never-register",
    };
    const providers = new ProviderAdapterRegistry();
    registerConfiguredKingsInference(providers, env);
    assert.deepEqual(providers.list().map((p) => p.id), ["kings-self-hosted"],
      "sovereign runtime must register only owner-operated inference");
    assert.deepEqual(resolveKingsProviderOrder(env, "sovereign"), ["kings-self-hosted", "ollama-internal"]);
    const model = providers.get("kings-self-hosted")?.listModels()[0];
    assert.equal(model?.providerKind, "internal-self-hosted");
    assert.equal(model?.contextWindowTokens, 65536);
    assert.deepEqual(model?.capabilities, ["reasoning", "research", "verification"],
      "unverified specialist capabilities must not be fabricated");
    assert.equal(model?.supportsToolCalling, false);
    assert.equal(model?.supportsStructuredOutput, false);
    const result = await providers.execute("kings-self-hosted", "kings-owned-v1", request());
    assert.equal(result.success, true);
    assert.equal(result.response?.model.providerId, "kings-self-hosted");
    assert.equal(result.response?.content, "Evidence only: no completed sales data provided.");
    assert.equal(result.response?.usage.tokensUsed, 30);
    assert.equal(result.response?.usage.estimatedCost, 0);
    assert.equal(hits, 1, "actual self-hosted HTTP inference must execute exactly once");
    assert.throws(() => registerConfiguredKingsInference(new ProviderAdapterRegistry(), {
      ...env,
      KINGS_SELF_HOSTED_BASE_URL: "https://thirdparty.example/v1",
    }), /private or explicitly owner-allowlisted/);
    assert.throws(() => registerConfiguredKingsInference(new ProviderAdapterRegistry(), {
      ...env,
      KINGS_SELF_HOSTED_BASE_URL: "http://approved.example/v1",
      KINGS_SOVEREIGN_INFERENCE_HOSTS: "approved.example",
    }), /must use HTTPS/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  console.log("K.I.N.G.S. owner-hosted inference provider: SUCCESS");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
