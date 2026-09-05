import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";
import type {
  ProviderAdapter,
  ProviderDescriptor,
} from "./provider-adapters";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  ModelRouter,
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";
import { AdaptiveModelRoutingAuthority } from "./adaptive-model-routing";
import { ResilientModelExecutionAuthority } from "./resilient-model-execution";

function identity(providerId: string, modelId: string): ModelIdentity {
  return {
    providerId,
    modelId,
    displayName: `${providerId}/${modelId}`,
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
    id: "adaptive-resilient-request",
    taskId: "adaptive-resilient-task",
    missionId: "adaptive-resilient-mission",
    messages: [{ role: "user", content: "Build real code." }],
    requiredCapabilities: ["coding"],
    inputModalities: ["text"],
    outputModality: "text",
    allowToolProposals: false,
  };
}

class ResultProvider implements ProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  constructor(
    id: string,
    readonly model: ModelIdentity,
    private readonly successful: boolean,
    private readonly latencyMs: number,
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

  async execute(
    _modelId: string,
    executionRequest: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    const now = new Date(0).toISOString();
    if (!this.successful) {
      return {
        success: false,
        failure: {
          requestId: executionRequest.id,
          providerId: this.descriptor.id,
          modelId: this.model.modelId,
          retryable: true,
          code: "GATEWAY_HTTP_503",
          message: "temporary gateway failure",
          metadata: {
            requestId: executionRequest.id,
            startedAt: now,
            completedAt: now,
            latencyMs: this.latencyMs,
          },
        },
      };
    }

    return {
      success: true,
      response: {
        requestId: executionRequest.id,
        model: this.model,
        content: "FILE: src/adaptive.ts [create]\nexport const adaptive = true;",
        toolCallProposals: [],
        usage: {
          elapsedMs: this.latencyMs,
          tokensUsed: 20,
          iterationsUsed: 1,
          inputTokens: 10,
          outputTokens: 10,
        },
        metadata: {
          requestId: executionRequest.id,
          startedAt: now,
          completedAt: now,
          latencyMs: this.latencyMs,
        },
      },
    };
  }
}

async function main(): Promise<void> {
  const omni = identity("omniroute", "auto/coding");
  const nine = identity("9router", "provider/coder");
  const capabilities = new ModelCapabilityRegistry();
  for (const model of [omni, nine]) {
    capabilities.register({
      model,
      capabilities: [{
        capability: "coding",
        strength: 80,
        status: "unverified",
        evidenceReferences: [`${model.providerId}:live-catalog`],
      }],
    });
  }

  const metrics = new Map<string, ModelRoutingMetrics>([
    [
      modelRoutingMetricKey("omniroute", "auto/coding"),
      { costBasis: "unknown", latencyMs: 500, reliability: 96 },
    ],
    [
      modelRoutingMetricKey("9router", "provider/coder"),
      { costBasis: "unknown", latencyMs: 700, reliability: 90 },
    ],
  ]);
  const router = new ModelRouter(capabilities, metrics);
  const learning = new AdaptiveModelRoutingAuthority(metrics, {
    learningRate: 0.5,
  });

  const providers = new ProviderAdapterRegistry();
  providers.register(new ResultProvider("omniroute", omni, false, 1_400));
  providers.register(new ResultProvider("9router", nine, true, 350));

  const firstDecision = router.route({
    requiredCapabilities: ["coding"],
    preferExternal: true,
    allowUnverifiedUnderPostExecutionVerification: true,
  });
  assert.equal(firstDecision.providerId, "omniroute");
  assert.equal(firstDecision.candidates.length, 2);

  const resilient = new ResilientModelExecutionAuthority(providers, {
    failureThreshold: 1,
    cooldownMs: 30_000,
    observeResult(providerId, modelId, result) {
      learning.observe(providerId, modelId, result);
    },
  });
  const outcome = await resilient.execute(firstDecision.candidates, request());
  assert.equal(outcome.result.success, true);
  assert.equal(outcome.providerId, "9router");

  const nextDecision = router.route({
    requiredCapabilities: ["coding"],
    preferExternal: true,
    allowUnverifiedUnderPostExecutionVerification: true,
  });
  assert.equal(
    nextDecision.providerId,
    "9router",
    "the next route decision must reflect real previous execution evidence",
  );

  const controllerSource = await readFile(
    join(process.cwd(), "ui", "project-owner", "server-contract.ts"),
    "utf8",
  );
  assert.match(controllerSource, /AdaptiveModelRoutingAuthority/);
  assert.match(controllerSource, /ResilientModelExecutionAuthority/);
  assert.match(
    controllerSource,
    /observeResult\(providerId, observedModelId, result\)/,
  );
  assert.match(
    controllerSource,
    /adaptiveRouting\.observe\(\s*providerId,\s*observedModelId,\s*result,?\s*\)/,
    "adaptive observer wiring should be detected independent of source formatting",
  );

  console.log("K.I.N.G.S. SUPERHOST → LIVE FAILURE EVIDENCE LEARNED: SUCCESS");
  console.log("K.I.N.G.S. SUPERHOST → LIVE SUCCESS EVIDENCE LEARNED: SUCCESS");
  console.log("K.I.N.G.S. SUPERHOST → NEXT MISSION ROUTE ADAPTS: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → ADAPTIVE ROUTING WIRED: SUCCESS");
  console.log("TREE-KCM-ADAPTIVE-RESILIENT-ROUTING: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-ADAPTIVE-RESILIENT-ROUTING: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
