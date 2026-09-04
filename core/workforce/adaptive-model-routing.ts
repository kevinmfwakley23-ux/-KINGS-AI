import type { ModelExecutionResult } from "./model-interface";
import {
  modelRoutingMetricKey,
  type ModelRoutingMetrics,
} from "./model-routing";

export interface AdaptiveModelRoutingOptions {
  learningRate?: number;
  defaultLatencyMs?: number;
  defaultReliability?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export class AdaptiveModelRoutingAuthority {
  private readonly learningRate: number;
  private readonly defaultLatencyMs: number;
  private readonly defaultReliability: number;

  constructor(
    private readonly metrics: Map<string, ModelRoutingMetrics>,
    options: AdaptiveModelRoutingOptions = {},
  ) {
    this.learningRate = options.learningRate ?? 0.25;
    this.defaultLatencyMs = options.defaultLatencyMs ?? 1_200;
    this.defaultReliability = options.defaultReliability ?? 75;

    if (
      !Number.isFinite(this.learningRate) ||
      this.learningRate <= 0 ||
      this.learningRate > 1
    ) {
      throw new Error(
        "K.I.N.G.S. Adaptive Routing: learningRate must be greater than 0 and at most 1.",
      );
    }
    if (!finiteNonNegative(this.defaultLatencyMs)) {
      throw new Error(
        "K.I.N.G.S. Adaptive Routing: defaultLatencyMs must be finite and non-negative.",
      );
    }
    if (
      !Number.isFinite(this.defaultReliability) ||
      this.defaultReliability < 0 ||
      this.defaultReliability > 100
    ) {
      throw new Error(
        "K.I.N.G.S. Adaptive Routing: defaultReliability must be between 0 and 100.",
      );
    }
  }

  observe(
    providerId: string,
    modelId: string,
    result: ModelExecutionResult,
  ): ModelRoutingMetrics {
    const key = modelRoutingMetricKey(providerId, modelId);
    const existing = this.metrics.get(key) ?? {
      costBasis: "unknown" as const,
      latencyMs: this.defaultLatencyMs,
      reliability: this.defaultReliability,
    };

    const successful = Boolean(result.success && result.response);
    const targetReliability = successful ? 100 : 0;
    const reliability = clamp(
      Math.round(
        existing.reliability * (1 - this.learningRate) +
        targetReliability * this.learningRate,
      ),
      0,
      100,
    );

    const observedLatency = successful
      ? result.response?.metadata.latencyMs
      : result.failure?.metadata.latencyMs;
    const latencyMs =
      finiteNonNegative(observedLatency) && observedLatency > 0
        ? Math.round(
            existing.latencyMs * (1 - this.learningRate) +
            observedLatency * this.learningRate,
          )
        : existing.latencyMs;

    const reportedCostUsd = successful
      ? result.response?.usage.reportedCostUsd
      : undefined;
    const next: ModelRoutingMetrics = {
      estimatedCost: finiteNonNegative(reportedCostUsd)
        ? reportedCostUsd
        : existing.estimatedCost,
      costBasis: finiteNonNegative(reportedCostUsd)
        ? "provider-reported"
        : existing.costBasis,
      latencyMs,
      reliability,
    };

    this.metrics.set(key, next);
    return { ...next };
  }

  snapshot(
    providerId: string,
    modelId: string,
  ): ModelRoutingMetrics | undefined {
    const metric = this.metrics.get(modelRoutingMetricKey(providerId, modelId));
    return metric ? { ...metric } : undefined;
  }
}
