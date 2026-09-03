import type { ID } from "./types";
import type {
  IntelligenceCapability,
  IntelligenceModality,
  IntelligenceProviderKind,
} from "./model-interface";
import type {
  ModelCapabilityRegistry,
  ModelCapabilityMatch,
} from "./model-capability-registry";

export type ModelRoutingMode =
  | "legacy"
  | "balanced"
  | "auto"
  | "smart"
  | "coding"
  | "cheap"
  | "fast"
  | "quota-first"
  | "offline";

export interface ModelRoutingRequest {
  requiredCapabilities: IntelligenceCapability[];
  minimumCapabilityStrength?: number;
  requiredInputModality?: IntelligenceModality;
  requiredOutputModality?: IntelligenceModality;
  requireStructuredOutput?: boolean;
  preferInternal?: boolean;
  maximumEstimatedCost?: number;
  mode?: ModelRoutingMode;
  requiredContextTokens?: number;
  maximumLatencyMs?: number;
  minimumReliability?: number;
  minimumQuotaRemainingRatio?: number;
  allowPaidFallback?: boolean;
  routingKey?: string;
  explorationRate?: number;
  nowEpochMs?: number;
  fallbackLimit?: number;
}

export interface ModelRoutingMetrics {
  estimatedCost: number;
  latencyMs: number;
  reliability: number;
  tokensPerSecond?: number;
  quotaRemainingRatio?: number;
  coveredBySubscription?: boolean;
  providerHealthy?: boolean;
  recentFailureCount?: number;
  cooldownUntilEpochMs?: number;
  lastSuccessEpochMs?: number;
}

export interface ModelRoutingScoreBreakdown {
  capability: number;
  reliability: number;
  cost: number;
  latency: number;
  throughput: number;
  quota: number;
  context: number;
  subscription: number;
  health: number;
}

export interface ModelRoutingCandidate {
  modelId: ID;
  providerId: ID;
  providerKind: IntelligenceProviderKind;
  capabilityStrength: number;
  estimatedCost: number;
  latencyMs: number;
  reliability: number;
  internal: boolean;
  contextWindowTokens: number;
  tokensPerSecond?: number;
  quotaRemainingRatio?: number;
  coveredBySubscription: boolean;
  providerHealthy: boolean;
  recentFailureCount: number;
  cooldownUntilEpochMs?: number;
  lastSuccessEpochMs?: number;
  metricsAvailable: boolean;
  routingScore?: number;
  scoreBreakdown?: ModelRoutingScoreBreakdown;
}

export interface ModelRoutingDecision {
  selected: boolean;
  modelId?: ID;
  providerId?: ID;
  reason: string;
  candidates: ModelRoutingCandidate[];
  fallbackChain?: ModelRoutingCandidate[];
  mode?: ModelRoutingMode;
  explored?: boolean;
}

type ScoreDimension = keyof ModelRoutingScoreBreakdown;
type ScoreWeights = Record<ScoreDimension, number>;

const SCORE_WEIGHTS: Record<Exclude<ModelRoutingMode, "legacy">, ScoreWeights> = {
  balanced: { capability: 20, reliability: 20, cost: 15, latency: 10, throughput: 5, quota: 10, context: 10, subscription: 5, health: 5 },
  auto: { capability: 25, reliability: 20, cost: 12, latency: 8, throughput: 5, quota: 8, context: 10, subscription: 5, health: 7 },
  smart: { capability: 25, reliability: 20, cost: 12, latency: 8, throughput: 5, quota: 8, context: 10, subscription: 5, health: 7 },
  coding: { capability: 30, reliability: 20, cost: 10, latency: 5, throughput: 5, quota: 5, context: 10, subscription: 5, health: 10 },
  cheap: { capability: 10, reliability: 10, cost: 25, latency: 5, throughput: 0, quota: 15, context: 5, subscription: 25, health: 5 },
  fast: { capability: 10, reliability: 15, cost: 5, latency: 30, throughput: 25, quota: 0, context: 5, subscription: 0, health: 10 },
  "quota-first": { capability: 5, reliability: 10, cost: 15, latency: 0, throughput: 0, quota: 30, context: 0, subscription: 30, health: 10 },
  offline: { capability: 30, reliability: 20, cost: 0, latency: 10, throughput: 5, quota: 10, context: 10, subscription: 0, health: 15 },
};

export class ModelRouter {
  constructor(
    private readonly capabilityRegistry: ModelCapabilityRegistry,
    private readonly metrics: ReadonlyMap<ID, ModelRoutingMetrics>,
  ) {}

  route(request: ModelRoutingRequest): ModelRoutingDecision {
    this.validateRequest(request);
    const mode = request.mode ?? "legacy";
    const nowEpochMs = request.nowEpochMs ?? Date.now();

    const matches = this.capabilityRegistry.discover({
      requiredCapabilities: request.requiredCapabilities,
      minimumStrength: request.minimumCapabilityStrength ?? 0,
      verifiedOnly: true,
      availableOnly: true,
    });

    let candidates = matches
      .filter((match) => this.supportsModalities(match, request) && this.supportsStructuredOutput(match, request))
      .map((match) => this.toCandidate(match))
      .filter((candidate) => this.passesHardConstraints(candidate, request, mode, nowEpochMs));

    if (mode === "legacy") {
      candidates.sort((left, right) => this.compareLegacyCandidates(left, right, request));
    } else {
      candidates = this.rankAdaptiveCandidates(candidates, request, mode);
    }

    if (candidates.length === 0) {
      return {
        selected: false,
        reason: "No available model satisfies the routing requirements.",
        candidates: [],
        fallbackChain: [],
        mode,
        explored: false,
      };
    }

    const exploration = this.applyDeterministicExploration(candidates, request, mode);
    candidates = exploration.candidates;
    const selected = candidates[0];
    const fallbackLimit = Math.min(request.fallbackLimit ?? 3, candidates.length);

    return {
      selected: true,
      modelId: selected.modelId,
      providerId: selected.providerId,
      reason: this.buildReason(selected, request, mode, exploration.explored),
      candidates,
      fallbackChain: candidates.slice(0, fallbackLimit),
      mode,
      explored: exploration.explored,
    };
  }

  private toCandidate(match: ModelCapabilityMatch): ModelRoutingCandidate {
    const metric = this.metrics.get(match.model.modelId);
    const internal = match.model.providerKind === "internal-local" || match.model.providerKind === "internal-self-hosted";
    const coveredBySubscription = internal || match.model.providerKind === "external-free" || metric?.coveredBySubscription === true;

    return {
      modelId: match.model.modelId,
      providerId: match.model.providerId,
      providerKind: match.model.providerKind,
      capabilityStrength: match.weakestRequiredStrength,
      estimatedCost: metric?.estimatedCost ?? 0,
      latencyMs: metric?.latencyMs ?? Number.MAX_SAFE_INTEGER,
      reliability: metric?.reliability ?? 0,
      internal,
      contextWindowTokens: match.model.contextWindowTokens,
      tokensPerSecond: metric?.tokensPerSecond,
      quotaRemainingRatio: metric?.quotaRemainingRatio,
      coveredBySubscription,
      providerHealthy: metric?.providerHealthy ?? true,
      recentFailureCount: metric?.recentFailureCount ?? 0,
      cooldownUntilEpochMs: metric?.cooldownUntilEpochMs,
      lastSuccessEpochMs: metric?.lastSuccessEpochMs,
      metricsAvailable: metric !== undefined,
    };
  }

  private passesHardConstraints(
    candidate: ModelRoutingCandidate,
    request: ModelRoutingRequest,
    mode: ModelRoutingMode,
    nowEpochMs: number,
  ): boolean {
    if (request.maximumEstimatedCost !== undefined && candidate.estimatedCost > request.maximumEstimatedCost) return false;
    if (request.maximumLatencyMs !== undefined && candidate.latencyMs > request.maximumLatencyMs) return false;
    if (request.minimumReliability !== undefined && candidate.reliability < request.minimumReliability) return false;
    if (request.requiredContextTokens !== undefined && candidate.contextWindowTokens < request.requiredContextTokens) return false;
    if (request.minimumQuotaRemainingRatio !== undefined && (candidate.quotaRemainingRatio ?? 0) < request.minimumQuotaRemainingRatio) return false;
    if (request.allowPaidFallback === false && candidate.providerKind === "external-paid") return false;
    if (mode === "offline" && !candidate.internal) return false;
    if (!candidate.providerHealthy) return false;
    if (candidate.cooldownUntilEpochMs !== undefined && candidate.cooldownUntilEpochMs > nowEpochMs) return false;
    return true;
  }

  private rankAdaptiveCandidates(
    candidates: ModelRoutingCandidate[],
    request: ModelRoutingRequest,
    mode: Exclude<ModelRoutingMode, "legacy">,
  ): ModelRoutingCandidate[] {
    if (candidates.length === 0) return [];

    const knownCosts = candidates.filter((item) => item.metricsAvailable).map((item) => item.estimatedCost);
    const knownLatencies = candidates.filter((item) => item.metricsAvailable && item.latencyMs !== Number.MAX_SAFE_INTEGER).map((item) => item.latencyMs);
    const knownThroughputs = candidates.map((item) => item.tokensPerSecond).filter((value): value is number => value !== undefined && Number.isFinite(value));
    const minCost = knownCosts.length > 0 ? Math.min(...knownCosts) : 0;
    const maxCost = knownCosts.length > 0 ? Math.max(...knownCosts) : 0;
    const minLatency = knownLatencies.length > 0 ? Math.min(...knownLatencies) : 0;
    const maxLatency = knownLatencies.length > 0 ? Math.max(...knownLatencies) : 0;
    const minThroughput = knownThroughputs.length > 0 ? Math.min(...knownThroughputs) : 0;
    const maxThroughput = knownThroughputs.length > 0 ? Math.max(...knownThroughputs) : 0;
    const weights = SCORE_WEIGHTS[mode];

    return candidates
      .map((candidate) => {
        const scoreBreakdown: ModelRoutingScoreBreakdown = {
          capability: this.clamp(candidate.capabilityStrength),
          reliability: candidate.metricsAvailable ? this.clamp(candidate.reliability) : 50,
          cost: candidate.coveredBySubscription ? 100 : this.inverseNormalize(candidate.estimatedCost, minCost, maxCost, candidate.metricsAvailable),
          latency: this.inverseNormalize(candidate.latencyMs, minLatency, maxLatency, candidate.metricsAvailable && candidate.latencyMs !== Number.MAX_SAFE_INTEGER),
          throughput: this.normalize(candidate.tokensPerSecond, minThroughput, maxThroughput),
          quota: candidate.quotaRemainingRatio === undefined ? 50 : this.clamp(candidate.quotaRemainingRatio * 100),
          context: request.requiredContextTokens === undefined ? 50 : 100,
          subscription: candidate.coveredBySubscription ? 100 : 0,
          health: this.clamp(100 - (candidate.recentFailureCount * 15)),
        };

        let weightedTotal = 0;
        let totalWeight = 0;
        for (const dimension of Object.keys(weights) as ScoreDimension[]) {
          const weight = weights[dimension];
          weightedTotal += scoreBreakdown[dimension] * weight;
          totalWeight += weight;
        }

        return {
          ...candidate,
          routingScore: totalWeight === 0 ? 0 : Number((weightedTotal / totalWeight).toFixed(4)),
          scoreBreakdown,
        };
      })
      .sort((left, right) => {
        if ((left.routingScore ?? 0) !== (right.routingScore ?? 0)) return (right.routingScore ?? 0) - (left.routingScore ?? 0);
        return this.compareLegacyCandidates(left, right, request);
      });
  }

  private normalize(value: number | undefined, minimum: number, maximum: number): number {
    if (value === undefined || !Number.isFinite(value)) return 50;
    if (maximum <= minimum) return 100;
    return this.clamp(((value - minimum) / (maximum - minimum)) * 100);
  }

  private inverseNormalize(value: number, minimum: number, maximum: number, known: boolean): number {
    if (!known || !Number.isFinite(value)) return 50;
    if (maximum <= minimum) return 100;
    return this.clamp(100 - (((value - minimum) / (maximum - minimum)) * 100));
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, value));
  }

  private applyDeterministicExploration(
    candidates: ModelRoutingCandidate[],
    request: ModelRoutingRequest,
    mode: ModelRoutingMode,
  ): { candidates: ModelRoutingCandidate[]; explored: boolean } {
    const explorationRate = request.explorationRate ?? 0;
    if ((mode !== "auto" && mode !== "smart") || explorationRate <= 0 || !request.routingKey || candidates.length < 2) {
      return { candidates, explored: false };
    }

    const bucket = this.hashToUnitInterval(`${request.routingKey}|${request.requiredCapabilities.join(",")}|${mode}`);
    if (bucket >= explorationRate) return { candidates, explored: false };

    const explored = [...candidates];
    [explored[0], explored[1]] = [explored[1], explored[0]];
    return { candidates: explored, explored: true };
  }

  private hashToUnitInterval(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0x1_0000_0000;
  }

  private supportsModalities(match: ModelCapabilityMatch, request: ModelRoutingRequest): boolean {
    if (request.requiredInputModality && !match.model.inputModalities.includes(request.requiredInputModality)) return false;
    if (request.requiredOutputModality && !match.model.outputModalities.includes(request.requiredOutputModality)) return false;
    return true;
  }

  private supportsStructuredOutput(match: ModelCapabilityMatch, request: ModelRoutingRequest): boolean {
    return !(request.requireStructuredOutput && !match.model.supportsStructuredOutput);
  }

  private compareLegacyCandidates(left: ModelRoutingCandidate, right: ModelRoutingCandidate, request: ModelRoutingRequest): number {
    if (request.preferInternal && left.internal !== right.internal) return left.internal ? -1 : 1;
    if (left.estimatedCost !== right.estimatedCost) return left.estimatedCost - right.estimatedCost;
    if (left.reliability !== right.reliability) return right.reliability - left.reliability;
    if (left.capabilityStrength !== right.capabilityStrength) return right.capabilityStrength - left.capabilityStrength;
    if (left.latencyMs !== right.latencyMs) return left.latencyMs - right.latencyMs;
    if (left.providerId !== right.providerId) return left.providerId.localeCompare(right.providerId);
    return left.modelId.localeCompare(right.modelId);
  }

  private buildReason(candidate: ModelRoutingCandidate, request: ModelRoutingRequest, mode: ModelRoutingMode, explored: boolean): string {
    if (mode === "legacy") {
      const internalReason = request.preferInternal && candidate.internal ? "preferred internal intelligence" : "capable available model";
      return `${internalReason}; estimated cost ${candidate.estimatedCost}; reliability ${candidate.reliability}; capability strength ${candidate.capabilityStrength}`;
    }

    return `${mode} adaptive routing${explored ? " with bounded deterministic exploration" : ""}; score ${candidate.routingScore ?? 0}; estimated cost ${candidate.estimatedCost}; reliability ${candidate.reliability}; capability strength ${candidate.capabilityStrength}; quota ${candidate.quotaRemainingRatio ?? "unknown"}`;
  }

  private validateRequest(request: ModelRoutingRequest): void {
    if (request.requiredCapabilities.length === 0) throw new Error("K.I.N.G.S. Model Router: at least one capability is required");
    const minimumStrength = request.minimumCapabilityStrength ?? 0;
    if (minimumStrength < 0 || minimumStrength > 100) throw new Error("K.I.N.G.S. Model Router: minimum capability strength must be between 0 and 100");
    if (request.maximumEstimatedCost !== undefined && request.maximumEstimatedCost < 0) throw new Error("K.I.N.G.S. Model Router: maximum estimated cost cannot be negative");
    if (request.requiredContextTokens !== undefined && (!Number.isFinite(request.requiredContextTokens) || request.requiredContextTokens < 1)) throw new Error("K.I.N.G.S. Model Router: required context tokens must be at least 1");
    if (request.maximumLatencyMs !== undefined && (!Number.isFinite(request.maximumLatencyMs) || request.maximumLatencyMs < 0)) throw new Error("K.I.N.G.S. Model Router: maximum latency cannot be negative");
    if (request.minimumReliability !== undefined && (request.minimumReliability < 0 || request.minimumReliability > 100)) throw new Error("K.I.N.G.S. Model Router: minimum reliability must be between 0 and 100");
    if (request.minimumQuotaRemainingRatio !== undefined && (request.minimumQuotaRemainingRatio < 0 || request.minimumQuotaRemainingRatio > 1)) throw new Error("K.I.N.G.S. Model Router: minimum quota remaining ratio must be between 0 and 1");
    if (request.explorationRate !== undefined && (request.explorationRate < 0 || request.explorationRate > 1)) throw new Error("K.I.N.G.S. Model Router: exploration rate must be between 0 and 1");
    if (request.fallbackLimit !== undefined && (!Number.isInteger(request.fallbackLimit) || request.fallbackLimit < 1 || request.fallbackLimit > 10)) throw new Error("K.I.N.G.S. Model Router: fallback limit must be an integer between 1 and 10");
  }
}
