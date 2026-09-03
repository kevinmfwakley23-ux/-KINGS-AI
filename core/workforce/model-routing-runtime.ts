import type { ID } from "./types";
import type { ModelRoutingMetrics } from "./model-routing";

export interface ModelRoutingRuntimeOptions {
  ewmaAlpha: number;
  failureThreshold: number;
  baseCooldownMs: number;
  maximumCooldownMs: number;
}

export interface ModelRoutingObservation {
  modelId: ID;
  providerId: ID;
  success: boolean;
  retryable: boolean;
  latencyMs: number;
  timestampEpochMs: number;
  estimatedCost?: number;
  tokensPerSecond?: number;
  quotaRemainingRatio?: number;
}

export interface ModelRoutingRuntimeSnapshot {
  modelId: ID;
  providerId: ID;
  reliability: number;
  latencyMs: number;
  tokensPerSecond?: number;
  quotaRemainingRatio?: number;
  recentFailureCount: number;
  cooldownUntilEpochMs?: number;
  lastSuccessEpochMs?: number;
}

export class ModelRoutingRuntimeTelemetry {
  private readonly state = new Map<ID, ModelRoutingRuntimeSnapshot>();

  constructor(
    private readonly options: ModelRoutingRuntimeOptions = {
      ewmaAlpha: 0.25,
      failureThreshold: 3,
      baseCooldownMs: 30_000,
      maximumCooldownMs: 300_000,
    },
  ) {
    if (options.ewmaAlpha <= 0 || options.ewmaAlpha > 1) throw new Error("K.I.N.G.S. Routing Telemetry: ewmaAlpha must be greater than 0 and at most 1");
    if (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1) throw new Error("K.I.N.G.S. Routing Telemetry: failureThreshold must be an integer of at least 1");
    if (options.baseCooldownMs < 1 || options.maximumCooldownMs < options.baseCooldownMs) throw new Error("K.I.N.G.S. Routing Telemetry: cooldown bounds are invalid");
  }

  record(observation: ModelRoutingObservation): ModelRoutingRuntimeSnapshot {
    this.validateObservation(observation);
    const previous = this.state.get(observation.modelId);
    const reliabilityBase = previous?.reliability ?? 100;
    const reliability = this.ewma(reliabilityBase, observation.success ? 100 : 0);
    const latencyMs = this.ewma(previous?.latencyMs ?? observation.latencyMs, observation.latencyMs);
    const tokensPerSecond = observation.tokensPerSecond === undefined
      ? previous?.tokensPerSecond
      : this.ewma(previous?.tokensPerSecond ?? observation.tokensPerSecond, observation.tokensPerSecond);

    let recentFailureCount = previous?.recentFailureCount ?? 0;
    let cooldownUntilEpochMs = previous?.cooldownUntilEpochMs;
    let lastSuccessEpochMs = previous?.lastSuccessEpochMs;

    if (observation.success) {
      recentFailureCount = 0;
      cooldownUntilEpochMs = undefined;
      lastSuccessEpochMs = observation.timestampEpochMs;
    } else if (observation.retryable) {
      recentFailureCount += 1;
      if (recentFailureCount >= this.options.failureThreshold) {
        const exponent = recentFailureCount - this.options.failureThreshold;
        const cooldown = Math.min(this.options.maximumCooldownMs, this.options.baseCooldownMs * (2 ** exponent));
        cooldownUntilEpochMs = observation.timestampEpochMs + cooldown;
      }
    }

    const snapshot: ModelRoutingRuntimeSnapshot = {
      modelId: observation.modelId,
      providerId: observation.providerId,
      reliability: Number(reliability.toFixed(4)),
      latencyMs: Number(latencyMs.toFixed(4)),
      tokensPerSecond: tokensPerSecond === undefined ? undefined : Number(tokensPerSecond.toFixed(4)),
      quotaRemainingRatio: observation.quotaRemainingRatio ?? previous?.quotaRemainingRatio,
      recentFailureCount,
      cooldownUntilEpochMs,
      lastSuccessEpochMs,
    };

    this.state.set(observation.modelId, snapshot);
    return { ...snapshot };
  }

  updateQuota(modelId: ID, providerId: ID, quotaRemainingRatio: number): ModelRoutingRuntimeSnapshot {
    if (quotaRemainingRatio < 0 || quotaRemainingRatio > 1 || !Number.isFinite(quotaRemainingRatio)) {
      throw new Error("K.I.N.G.S. Routing Telemetry: quota remaining ratio must be between 0 and 1");
    }
    const current = this.state.get(modelId) ?? {
      modelId,
      providerId,
      reliability: 100,
      latencyMs: Number.MAX_SAFE_INTEGER,
      recentFailureCount: 0,
    };
    const next = { ...current, providerId, quotaRemainingRatio };
    this.state.set(modelId, next);
    return { ...next };
  }

  get(modelId: ID): ModelRoutingRuntimeSnapshot | undefined {
    const value = this.state.get(modelId);
    return value ? { ...value } : undefined;
  }

  list(): ModelRoutingRuntimeSnapshot[] {
    return Array.from(this.state.values()).map((item) => ({ ...item })).sort((left, right) => left.modelId.localeCompare(right.modelId));
  }

  mergeMetrics(
    baseMetrics: ReadonlyMap<ID, ModelRoutingMetrics>,
    nowEpochMs: number = Date.now(),
  ): ReadonlyMap<ID, ModelRoutingMetrics> {
    const merged = new Map<ID, ModelRoutingMetrics>();
    const modelIds = new Set<ID>([...baseMetrics.keys(), ...this.state.keys()]);

    for (const modelId of modelIds) {
      const base = baseMetrics.get(modelId);
      const runtime = this.state.get(modelId);
      if (!base && !runtime) continue;

      const cooldownActive = runtime?.cooldownUntilEpochMs !== undefined && runtime.cooldownUntilEpochMs > nowEpochMs;
      merged.set(modelId, {
        estimatedCost: base?.estimatedCost ?? 0,
        latencyMs: runtime?.latencyMs ?? base?.latencyMs ?? Number.MAX_SAFE_INTEGER,
        reliability: runtime?.reliability ?? base?.reliability ?? 0,
        tokensPerSecond: runtime?.tokensPerSecond ?? base?.tokensPerSecond,
        quotaRemainingRatio: runtime?.quotaRemainingRatio ?? base?.quotaRemainingRatio,
        coveredBySubscription: base?.coveredBySubscription,
        providerHealthy: cooldownActive ? false : (base?.providerHealthy ?? true),
        recentFailureCount: runtime?.recentFailureCount ?? base?.recentFailureCount ?? 0,
        cooldownUntilEpochMs: runtime?.cooldownUntilEpochMs ?? base?.cooldownUntilEpochMs,
        lastSuccessEpochMs: runtime?.lastSuccessEpochMs ?? base?.lastSuccessEpochMs,
      });
    }

    return merged;
  }

  private ewma(previous: number, observed: number): number {
    return (this.options.ewmaAlpha * observed) + ((1 - this.options.ewmaAlpha) * previous);
  }

  private validateObservation(observation: ModelRoutingObservation): void {
    if (!Number.isFinite(observation.latencyMs) || observation.latencyMs < 0) throw new Error("K.I.N.G.S. Routing Telemetry: latency must be a non-negative finite number");
    if (!Number.isFinite(observation.timestampEpochMs) || observation.timestampEpochMs < 0) throw new Error("K.I.N.G.S. Routing Telemetry: timestamp must be a non-negative finite number");
    if (observation.tokensPerSecond !== undefined && (!Number.isFinite(observation.tokensPerSecond) || observation.tokensPerSecond < 0)) throw new Error("K.I.N.G.S. Routing Telemetry: tokens per second must be non-negative");
    if (observation.quotaRemainingRatio !== undefined && (!Number.isFinite(observation.quotaRemainingRatio) || observation.quotaRemainingRatio < 0 || observation.quotaRemainingRatio > 1)) throw new Error("K.I.N.G.S. Routing Telemetry: quota remaining ratio must be between 0 and 1");
  }
}
