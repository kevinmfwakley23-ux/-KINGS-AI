import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import type { ModelExecutionRequest, ModelIdentity } from "../../core/workforce/model-interface";
import type { ProviderAdapter } from "../../core/workforce/provider-adapters";
import { ProviderAdapterRegistry } from "../../core/workforce/provider-adapters";
import { createAppRouterRuntime } from "./server";

const identity: ModelIdentity = {
  providerId: "test-provider",
  modelId: "creative-route",
  displayName: "Test Creative Route",
  providerKind: "internal-self-hosted",
  capabilities: ["reasoning", "planning", "coding", "research"],
  inputModalities: ["text"],
  outputModalities: ["text"],
  contextWindowTokens: 128_000,
  supportsToolCalling: true,
  supportsStructuredOutput: true,
  available: true,
};

async function main(): Promise<void> {
  let capturedRequest: ModelExecutionRequest | undefined;
  const adapter: ProviderAdapter = {
    descriptor: {
      id: "test-provider",
      name: "Test Provider",
      kind: "internal-self-hosted",
      available: true,
    },
    listModels: () => [identity],
    getModel: () => undefined,
    execute: async (modelId, request) => {
      assert.equal(modelId, "creative-route");
      capturedRequest = request;
      const now = new Date().toISOString();
      return {
        success: true,
        response: {
          requestId: request.id,
          model: identity,
          content: "Forge bridge verified.",
          toolCallProposals: [],
          usage: {
            elapsedMs: 3,
            tokensUsed: 12,
            iterationsUsed: 1,
            estimatedCost: 0,
            inputTokens: 8,
            outputTokens: 4,
          },
          metadata: {
            requestId: request.id,
            startedAt: now,
            completedAt: now,
            latencyMs: 3,
          },
        },
      };
    },
  };

  const providers = new ProviderAdapterRegistry();
  providers.register(adapter);
  const server = createAppRouterRuntime({
    host: "127.0.0.1",
    port: 8790,
    accessToken: "test-router-token",
    providerOrder: ["test-provider"],
    researchMaxSources: 8,
    researchMaxResponseBytes: 512 * 1024,
    researchTimeoutMs: 15_000,
  }, providers);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const unauthorized = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "creative-route", input: "hello" }),
    });
    assert.equal(unauthorized.status, 401, "Responses bridge must preserve router bearer-token protection");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-router-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "creative-route",
        input: [
          { role: "system", content: "Preserve author intent." },
          { role: "user", content: "Improve this paragraph." },
        ],
        temperature: 0.6,
        max_output_tokens: 777,
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      id: string;
      status: string;
      model: string;
      provider: string;
      output_text: string;
      usage: { input_tokens: number; output_tokens: number; total_tokens: number };
    };
    assert.equal(payload.status, "completed");
    assert.equal(payload.model, "creative-route");
    assert.equal(payload.provider, "test-provider");
    assert.equal(payload.output_text, "Forge bridge verified.");
    assert.deepEqual(payload.usage, { input_tokens: 8, output_tokens: 4, total_tokens: 12 });
    assert.ok(payload.id);

    assert.ok(capturedRequest, "Responses bridge must route a real model execution request");
    assert.equal(capturedRequest.maxOutputTokens, 777);
    assert.equal(capturedRequest.temperature, 0.6);
    assert.deepEqual(capturedRequest.messages, [
      { role: "system", content: "Preserve author intent." },
      { role: "user", content: "Improve this paragraph." },
    ]);

    const invalid = await fetch(`${base}/responses`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-router-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "creative-route", input: [] }),
    });
    assert.equal(invalid.status, 400, "Invalid Responses input must fail closed");

    console.log("K.I.N.G.S. Forge Responses bridge: SUCCESS");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
