import type { ID } from "./types";
import type { ModelExecutionRequest } from "./model-interface";
import type { ModelCapabilityRegistry } from "./model-capability-registry";
import type { ProviderAdapterRegistry } from "./provider-adapters";
import {
  ModelRouter,
  type ModelRoutingDecision,
  type ModelRoutingMetrics,
  type ModelRoutingRequest,
} from "./model-routing";
import { ModelRoutingRuntimeTelemetry } from "./model-routing-runtime";
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
}

export class AdaptiveModelExecutionCoordinator {
  private readonly resilient: ResilientModelExecutionAuthority;

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
    const metrics = this.telemetry.mergeMetrics(this.baseMetrics, nowEpochMs);
    const router = new ModelRouter(this.capabilityRegistry, metrics);
    const routing = router.route({ ...input.routing, nowEpochMs });
    const execution = await this.resilient.execute({
      request: input.execution,
      routing,
      continueOnNonRetryable: input.continueOnNonRetryable,
      nowEpochMs,
    });
    return { routing, execution };
  }

  routingTelemetry(): ModelRoutingRuntimeTelemetry {
    return this.telemetry;
  }
}
