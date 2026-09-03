import type { ID } from "./types";
import type { ModelExecutionFailure, ModelExecutionRequest, ModelExecutionResult } from "./model-interface";
import type { ProviderAdapterRegistry } from "./provider-adapters";
import type { ModelRoutingCandidate, ModelRoutingDecision } from "./model-routing";
import type { ModelRoutingRuntimeTelemetry } from "./model-routing-runtime";

export interface ResilientModelExecutionAttempt {
  providerId: ID;
  modelId: ID;
  success: boolean;
  retryable: boolean;
  code?: string;
  latencyMs: number;
}

export interface ResilientModelExecutionRequest {
  request: ModelExecutionRequest;
  routing: ModelRoutingDecision;
  continueOnNonRetryable?: boolean;
  nowEpochMs?: number;
}

export interface ResilientModelExecutionResult {
  routing: ModelRoutingDecision;
  result: ModelExecutionResult;
  attempts: ResilientModelExecutionAttempt[];
  usedFallback: boolean;
}

export class ResilientModelExecutionAuthority {
  constructor(
    private readonly providers: ProviderAdapterRegistry,
    private readonly telemetry?: ModelRoutingRuntimeTelemetry,
  ) {}

  async execute(input: ResilientModelExecutionRequest): Promise<ResilientModelExecutionResult> {
    const orderedCandidates = this.orderedCandidates(input.routing);
    if (!input.routing.selected || orderedCandidates.length === 0) {
      return {
        routing: input.routing,
        result: this.failure(input.request, "ROUTING_NOT_SELECTED", "No governed model route was selected.", false),
        attempts: [],
        usedFallback: false,
      };
    }

    const attempts: ResilientModelExecutionAttempt[] = [];
    let lastResult: ModelExecutionResult | undefined;

    for (let index = 0; index < orderedCandidates.length; index += 1) {
      const candidate = orderedCandidates[index];
      const startedAt = Date.now();
      const result = await this.providers.execute(candidate.providerId, candidate.modelId, input.request);
      const latencyMs = this.resolveLatency(result, Date.now() - startedAt);
      const retryable = result.failure?.retryable ?? false;

      attempts.push({
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        success: result.success,
        retryable,
        code: result.failure?.code,
        latencyMs,
      });

      this.recordTelemetry(candidate, result, latencyMs, input.nowEpochMs ?? Date.now());
      lastResult = result;

      if (result.success && result.response) {
        return {
          routing: input.routing,
          result,
          attempts,
          usedFallback: index > 0,
        };
      }

      if (!retryable && input.continueOnNonRetryable !== true) break;
    }

    return {
      routing: input.routing,
      result: lastResult ?? this.failure(input.request, "ROUTING_EXHAUSTED", "The governed model fallback chain was exhausted.", false),
      attempts,
      usedFallback: attempts.length > 1,
    };
  }

  private orderedCandidates(routing: ModelRoutingDecision): ModelRoutingCandidate[] {
    const source = routing.fallbackChain && routing.fallbackChain.length > 0 ? routing.fallbackChain : routing.candidates;
    const seen = new Set<string>();
    const ordered: ModelRoutingCandidate[] = [];

    for (const candidate of source) {
      const key = `${candidate.providerId}::${candidate.modelId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(candidate);
    }

    return ordered;
  }

  private recordTelemetry(
    candidate: ModelRoutingCandidate,
    result: ModelExecutionResult,
    latencyMs: number,
    timestampEpochMs: number,
  ): void {
    if (!this.telemetry) return;
    const outputTokens = result.response?.usage.outputTokens ?? 0;
    const tokensPerSecond = latencyMs > 0 && outputTokens > 0 ? outputTokens / (latencyMs / 1000) : undefined;

    this.telemetry.record({
      modelId: candidate.modelId,
      providerId: candidate.providerId,
      success: result.success && result.response !== undefined,
      retryable: result.failure?.retryable ?? false,
      latencyMs,
      timestampEpochMs,
      estimatedCost: result.response?.usage.estimatedCost,
      tokensPerSecond,
      quotaRemainingRatio: candidate.quotaRemainingRatio,
    });
  }

  private resolveLatency(result: ModelExecutionResult, measuredLatencyMs: number): number {
    const providerLatency = result.response?.metadata.latencyMs ?? result.failure?.metadata.latencyMs;
    return providerLatency !== undefined && Number.isFinite(providerLatency) && providerLatency >= 0
      ? providerLatency
      : Math.max(0, measuredLatencyMs);
  }

  private failure(
    request: ModelExecutionRequest,
    code: string,
    message: string,
    retryable: boolean,
  ): ModelExecutionResult {
    const now = new Date().toISOString();
    const failure: ModelExecutionFailure = {
      requestId: request.id,
      providerId: "routing-authority",
      modelId: "none",
      retryable,
      code,
      message,
      metadata: {
        requestId: request.id,
        startedAt: now,
        completedAt: now,
        latencyMs: 0,
      },
    };
    return { success: false, failure };
  }
}
