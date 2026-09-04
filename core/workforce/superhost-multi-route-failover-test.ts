import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  ModelRouter,
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";
import type {
  ProviderAdapter,
  ProviderDescriptor,
} from "./provider-adapters";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { ResilientModelExecutionAuthority } from "./resilient-model-execution";

function identity(
  providerId: string,
  modelId: string,
): ModelIdentity {
  return {
    providerId,
    modelId,
    displayName: `${providerId}: ${modelId}`,
    providerKind: "external-routed",
    capabilities: ["coding"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens: 128_000,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    available: true,
  };
}

function request(): ModelExecutionRequest {
  return {
    id: "superhost-failover-request",
    taskId: "superhost-failover-task",
    missionId: "superhost-failover-mission",
    messages: [{ role: "user", content: "Build verified code." }],
    requiredCapabilities: ["coding"],
    inputModalities: ["text"],
    outputModality: "text",
    allowToolProposals: false,
  };
}

function failure(
  providerId: string,
  modelId: string,
): ModelExecutionResult {
  const now = new Date(0).toISOString();
  return {
    success: false,
    failure: {
      requestId: "superhost-failover-request",
      providerId,
      modelId,
      retryable: true,
      code: "GATEWAY_HTTP_429",
      message: "primary gateway rate limited",
      metadata: {
        requestId: "superhost-failover-request",
        startedAt: now,
        completedAt: now,
        latencyMs: 1,
      },
    },
  };
}

function success(
  model: ModelIdentity,
): ModelExecutionResult {
  const now = new Date(0).toISOString();
  return {
    success: true,
    response: {
      requestId: "superhost-failover-request",
      model,
      content: "FILE: src/superhost.ts [create]\nexport const superhost = true;",
      toolCallProposals: [],
      usage: {
        elapsedMs: 1,
        tokensUsed: 12,
        iterationsUsed: 1,
        inputTokens: 6,
        outputTokens: 6,
      },
      metadata: {
        requestId: "superhost-failover-request",
        startedAt: now,
        completedAt: now,
        latencyMs: 1,
      },
    },
  };
}

class FakeProvider implements ProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  private calls = 0;

  constructor(
    id: string,
    private readonly model: ModelIdentity,
    private readonly result: ModelExecutionResult,
  ) {
    this.descriptor = {
      id,
      name: id,
      kind: "external-routed",
      available: true,
    };
  }

  listModels(): readonly ModelIdentity[] {
    return [this.model];
  }

  getModel(): IntelligenceModel | undefined {
    return undefined;
  }

  async execute(): Promise<ModelExecutionResult> {
    this.calls += 1;
    return this.result;
  }

  get callCount(): number {
    return this.calls;
  }
}

async function main(): Promise<void> {
  const omni = identity("omniroute", "auto/coding");
  const nine = identity("9router", "provider/coder-large");

  const capabilities = new ModelCapabilityRegistry();
  for (const model of [omni, nine]) {
    capabilities.register({
      model,
      capabilities: [{
        capability: "coding",
        strength: 82,
        status: "unverified",
        evidenceReferences: [`${model.providerId}:live-v1-models-catalog`],
      }],
    });
  }

  const metrics = new Map<string, ModelRoutingMetrics>([
    [
      modelRoutingMetricKey("omniroute", "auto/coding"),
      { costBasis: "unknown", latencyMs: 600, reliability: 95 },
    ],
    [
      modelRoutingMetricKey("9router", "provider/coder-large"),
      { costBasis: "unknown", latencyMs: 700, reliability: 90 },
    ],
  ]);

  const router = new ModelRouter(capabilities, metrics);
  const automatic = router.route({
    requiredCapabilities: ["coding"],
    preferExternal: true,
    allowUnverifiedUnderPostExecutionVerification: true,
  });

  assert.equal(automatic.selected, true);
  assert.equal(automatic.providerId, "omniroute");
  assert.equal(
    automatic.candidates.length,
    2,
    "KINGS Auto must preserve multiple healthy candidates for failover",
  );
  assert.deepEqual(
    automatic.candidates.map((candidate) => candidate.providerId),
    ["omniroute", "9router"],
  );

  const providers = new ProviderAdapterRegistry();
  const primary = new FakeProvider(
    "omniroute",
    omni,
    failure("omniroute", "auto/coding"),
  );
  const fallback = new FakeProvider(
    "9router",
    nine,
    success(nine),
  );
  providers.register(primary);
  providers.register(fallback);

  const resilient = new ResilientModelExecutionAuthority(providers, {
    failureThreshold: 1,
    cooldownMs: 30_000,
    maximumAttempts: 4,
  });
  const outcome = await resilient.execute(automatic.candidates, request());

  assert.equal(outcome.result.success, true);
  assert.equal(outcome.providerId, "9router");
  assert.equal(outcome.modelId, "provider/coder-large");
  assert.equal(primary.callCount, 1);
  assert.equal(fallback.callCount, 1);
  assert.equal(outcome.attempts.length, 2);
  assert.equal(outcome.attempts[0].failureCode, "GATEWAY_HTTP_429");
  assert.equal(outcome.attempts[1].success, true);

  const explicit = router.route({
    requiredCapabilities: ["coding"],
    preferredProviderId: "omniroute",
    preferredModelId: "auto/coding",
    allowUnverifiedExplicitSelection: true,
  });
  assert.equal(explicit.candidates.length, 1);
  assert.equal(explicit.providerId, "omniroute");

  const serverSource = await readFile(
    join(process.cwd(), "ui", "project-owner", "local-server.ts"),
    "utf8",
  );
  assert.match(
    serverSource,
    /controller\.handle\(incoming\)/,
    "owner HTTP Auto mode must pass unpinned requests to the core multi-route router",
  );
  assert.doesNotMatch(
    serverSource,
    /preferredProviderId:\s*route\.providerId/,
    "owner HTTP Auto mode must not collapse the superhost candidate pool to one route",
  );

  console.log("K.I.N.G.S. SUPERHOST → AUTO MULTI-ROUTE CANDIDATES: SUCCESS");
  console.log("K.I.N.G.S. SUPERHOST → OMNIROUTE FAILURE → 9ROUTER RECOVERY: SUCCESS");
  console.log("K.I.N.G.S. SUPERHOST → EXPLICIT MODEL REMAINS PINNED: SUCCESS");
  console.log("K.I.N.G.S. OWNER HTTP → AUTO DOES NOT PIN ONE MODEL: SUCCESS");
  console.log("TREE-KCM-SUPERHOST-MULTI-ROUTE-FAILOVER: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-SUPERHOST-MULTI-ROUTE-FAILOVER: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
