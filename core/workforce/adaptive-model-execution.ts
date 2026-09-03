import type { ID } from "./types";
import type { ModelExecutionRequest } from "./model-interface";
import type { ModelCapabilityRegistry } from "./model-capability-registry";
import type { ProviderAdapterRegistry } from "./provider-adapters";
import {
  ModelRouter,
  type ModelRoutingDecision,
  type ModelRoutingMetrics,
  type ModelRoutingRequest,
  type ModelRoutingMode,
} from "./model-routing";
import { ModelRoutingRuntimeTelemetry } from "./model-routing-runtime";
import {
  ModelTaskComplexityClassifier,
  type ModelTaskComplexityDecision,
} from "./model-task-complexity";
import {
  ResilientModelExecutionAuthority,
  type ResilientModelExecutionResult,
} from "./resilient-model-execution";

export interface AdaptiveModelExecutionRequest {
  routing: ModelRoutingRequest;
  execution: ModelExecutionRequest;
  nowEpochMs?: number;
  continueOnNonRetryable?: boolean;
}

export interface AdaptiveModelExecutionResult {
  routing: ModelRoutingDecision;
  execution: ResilientModelExecutionResult;
  requestedMode: ModelRoutingMode;
  complexity?: ModelTaskComplexityDecision;
}

export class AdaptiveModelExecutionCoordinator {
  private readonly resilient: ResilientModelExecutionAuthority;
  private readonly complexity = new ModelTaskComplexityClassifier();

  constructor(
    private readonly capabilityRegistry: ModelCapabilityRegistry,
    private readonly baseMetrics: ReadonlyMap<ID, ModelRoutingMetrics>,
    providers: ProviderAdapterRegistry,
    private readonly telemetry: ModelRoutingRuntimeTelemetry = new ModelRoutingRuntimeTelemetry(),
  ) {
    this.resilient = new ResilientModelExecutionAuthority(providers, telemetry);
  }

  async execute(input: AdaptiveModelExecutionRequest): Promise<AdaptiveModelExecutionResult> {
    const nowEpochMs = input.nowEpochMs ?? Date.now();
    const requestedMode = input.routing.mode ?? "legacy";
    const complexity = requestedMode === "auto"
      ? this.complexity.classify(input.execution)
      : undefined;
    const routingRequest = complexity
      ? this.resolveAutoRouting(input.routing, complexity)
      : input.routing;
    const metrics = this.telemetry.mergeMetrics(this.baseMetrics, nowEpochMs);
    const router = new ModelRouter(this.capabilityRegistry, metrics);
    const routing = router.route({ ...routingRequest, nowEpochMs });
    const execution = await this.resilient.execute({
      request: input.execution,
      routing,
      continueOnNonRetryable: input.continueOnNonRetryable,
      nowEpochMs,
    });
    return { routing, execution, requestedMode, complexity };
  }

  routingTelemetry(): ModelRoutingRuntimeTelemetry {
    return this.telemetry;
  }

  private resolveAutoRouting(
    routing: ModelRoutingRequest,
    complexity: ModelTaskComplexityDecision,
  ): ModelRoutingRequest {
    let mode: ModelRoutingMode;

    switch (complexity.tier) {
      case "simple":
        mode = "cheap";
        break;
      case "medium":
        mode = "balanced";
        break;
      case "complex":
        mode = routing.requiredCapabilities.some((capability) => capability === "coding" || capability === "debugging")
          ? "coding"
          : "balanced";
        break;
      case "reasoning":
        mode = "smart";
        break;
    }

    return {
      ...routing,
      mode,
    };
  }
}
