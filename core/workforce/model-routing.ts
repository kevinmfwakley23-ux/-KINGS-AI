import type { ID } from "./types";
import type {
  IntelligenceCapability,
  IntelligenceModality,
} from "./model-interface";
import type {
  ModelCapabilityRegistry,
  ModelCapabilityMatch,
} from "./model-capability-registry";

export type ModelCostBasis =
  | "verified-free"
  | "provider-reported"
  | "configured-estimate"
  | "unknown";

export interface ModelRoutingRequest {
  requiredCapabilities: IntelligenceCapability[];
  minimumCapabilityStrength?: number;
  requiredInputModality?: IntelligenceModality;
  requiredOutputModality?: IntelligenceModality;
  requireStructuredOutput?: boolean;
  requireToolCalling?: boolean;
  preferInternal?: boolean;
  preferExternal?: boolean;
  preferredProviderId?: ID;
  preferredModelId?: ID;
  allowUnverifiedExplicitSelection?: boolean;
  maximumEstimatedCost?: number;
}

export interface ModelRoutingMetrics {
  estimatedCost?: number;
  costBasis?: ModelCostBasis;
  latencyMs: number;
  reliability: number;
}

export interface ModelRoutingCandidate {
  modelId: ID;
  providerId: ID;
  capabilityStrength: number;
  estimatedCost: number | null;
  costBasis: ModelCostBasis;
  latencyMs: number;
  reliability: number;
  internal: boolean;
}

export interface ModelRoutingDecision {
  selected: boolean;
  modelId?: ID;
  providerId?: ID;
  reason: string;
  candidates: ModelRoutingCandidate[];
}

export function modelRoutingMetricKey(
  providerId: ID,
  modelId: ID,
): string {
  return `${providerId}::${modelId}`;
}

export class ModelRouter {
  constructor(
    private readonly capabilityRegistry: ModelCapabilityRegistry,
    private readonly metrics: ReadonlyMap<ID, ModelRoutingMetrics>,
  ) {}

  route(request: ModelRoutingRequest): ModelRoutingDecision {
    this.validateRequest(request);

    const explicitSelection = Boolean(
      request.preferredProviderId || request.preferredModelId,
    );

    const matches = this.capabilityRegistry.discover({
      requiredCapabilities: request.requiredCapabilities,
      minimumStrength: request.minimumCapabilityStrength ?? 0,
      verifiedOnly:
        !(explicitSelection && request.allowUnverifiedExplicitSelection),
      availableOnly: true,
      providerId: request.preferredProviderId,
      modelId: request.preferredModelId,
    });

    const candidates = matches
      .filter((match) =>
        this.supportsModalities(match, request) &&
        this.supportsStructuredOutput(match, request) &&
        this.supportsToolCalling(match, request),
      )
      .map((match) => this.toCandidate(match))
      .filter((candidate) => {
        if (request.maximumEstimatedCost === undefined) return true;
        // Unknown price is never treated as free or within a numeric budget.
        return candidate.estimatedCost !== null &&
          candidate.estimatedCost <= request.maximumEstimatedCost;
      })
      .sort((left, right) =>
        this.compareCandidates(left, right, request),
      );

    if (candidates.length === 0) {
      const requested = [
        request.preferredProviderId,
        request.preferredModelId,
      ].filter(Boolean).join("/");
      return {
        selected: false,
        reason: requested
          ? `Requested model route "${requested}" is unavailable or does not satisfy the routing requirements.`
          : request.maximumEstimatedCost !== undefined
            ? "No available verified model with known cost satisfies the routing requirements and cost ceiling."
            : "No available verified model satisfies the routing requirements.",
        candidates: [],
      };
    }

    const selected = candidates[0];
    return {
      selected: true,
      modelId: selected.modelId,
      providerId: selected.providerId,
      reason: this.buildReason(selected, request),
      candidates,
    };
  }

  private toCandidate(match: ModelCapabilityMatch): ModelRoutingCandidate {
    const metric =
      this.metrics.get(modelRoutingMetricKey(
        match.model.providerId,
        match.model.modelId,
      )) ??
      this.metrics.get(match.model.modelId);
    const estimatedCost =
      metric?.estimatedCost !== undefined && Number.isFinite(metric.estimatedCost)
        ? metric.estimatedCost
        : null;

    return {
      modelId: match.model.modelId,
      providerId: match.model.providerId,
      capabilityStrength: match.weakestRequiredStrength,
      estimatedCost,
      costBasis: metric?.costBasis ??
        (estimatedCost === null ? "unknown" : "configured-estimate"),
      latencyMs: metric?.latencyMs ?? Number.MAX_SAFE_INTEGER,
      reliability: metric?.reliability ?? 0,
      internal:
        match.model.providerKind === "internal-local" ||
        match.model.providerKind === "internal-self-hosted",
    };
  }

  private supportsModalities(
    match: ModelCapabilityMatch,
    request: ModelRoutingRequest,
  ): boolean {
    if (
      request.requiredInputModality &&
      !match.model.inputModalities.includes(request.requiredInputModality)
    ) return false;
    if (
      request.requiredOutputModality &&
      !match.model.outputModalities.includes(request.requiredOutputModality)
    ) return false;
    return true;
  }

  private supportsStructuredOutput(
    match: ModelCapabilityMatch,
    request: ModelRoutingRequest,
  ): boolean {
    return !request.requireStructuredOutput ||
      match.model.supportsStructuredOutput;
  }

  private supportsToolCalling(
    match: ModelCapabilityMatch,
    request: ModelRoutingRequest,
  ): boolean {
    return !request.requireToolCalling || match.model.supportsToolCalling;
  }

  private compareCandidates(
    left: ModelRoutingCandidate,
    right: ModelRoutingCandidate,
    request: ModelRoutingRequest,
  ): number {
    if (request.preferExternal && left.internal !== right.internal) {
      return left.internal ? 1 : -1;
    }
    if (request.preferInternal && left.internal !== right.internal) {
      return left.internal ? -1 : 1;
    }

    const leftCostKnown = left.estimatedCost !== null;
    const rightCostKnown = right.estimatedCost !== null;
    if (leftCostKnown && rightCostKnown && left.estimatedCost !== right.estimatedCost) {
      return (left.estimatedCost as number) - (right.estimatedCost as number);
    }
    // Known verified-free routes sort ahead of unknown-price routes. Unknown prices
    // are not assigned an invented numeric value.
    if (left.costBasis === "verified-free" && right.costBasis !== "verified-free") {
      return -1;
    }
    if (right.costBasis === "verified-free" && left.costBasis !== "verified-free") {
      return 1;
    }
    if (left.reliability !== right.reliability) {
      return right.reliability - left.reliability;
    }
    if (left.capabilityStrength !== right.capabilityStrength) {
      return right.capabilityStrength - left.capabilityStrength;
    }
    if (left.latencyMs !== right.latencyMs) {
      return left.latencyMs - right.latencyMs;
    }
    if (left.providerId !== right.providerId) {
      return left.providerId.localeCompare(right.providerId);
    }
    return left.modelId.localeCompare(right.modelId);
  }

  private buildReason(
    candidate: ModelRoutingCandidate,
    request: ModelRoutingRequest,
  ): string {
    const cost = candidate.estimatedCost === null
      ? "cost unknown (not treated as free)"
      : `estimated cost ${candidate.estimatedCost} (${candidate.costBasis})`;
    if (request.preferredProviderId || request.preferredModelId) {
      const verification = request.allowUnverifiedExplicitSelection
        ? "explicit live-catalog selection under post-generation verification"
        : "explicit verified model selection";
      return `${verification} ${candidate.providerId}/${candidate.modelId}; ${cost}; reliability ${candidate.reliability}; capability strength ${candidate.capabilityStrength}`;
    }
    const preference = request.preferExternal && !candidate.internal
      ? "preferred external gateway intelligence"
      : request.preferInternal && candidate.internal
        ? "preferred internal intelligence"
        : "capable available verified model";
    return `${preference}; ${cost}; reliability ${candidate.reliability}; capability strength ${candidate.capabilityStrength}`;
  }

  private validateRequest(request: ModelRoutingRequest): void {
    if (request.requiredCapabilities.length === 0) {
      throw new Error(
        "K.I.N.G.S. Model Router: at least one capability is required",
      );
    }
    if (request.preferInternal && request.preferExternal) {
      throw new Error(
        "K.I.N.G.S. Model Router: internal and external routing cannot both be preferred",
      );
    }
    const minimumStrength = request.minimumCapabilityStrength ?? 0;
    if (minimumStrength < 0 || minimumStrength > 100) {
      throw new Error(
        "K.I.N.G.S. Model Router: minimum capability strength must be between 0 and 100",
      );
    }
    if (
      request.maximumEstimatedCost !== undefined &&
      request.maximumEstimatedCost < 0
    ) {
      throw new Error(
        "K.I.N.G.S. Model Router: maximum estimated cost cannot be negative",
      );
    }
    if (
      request.allowUnverifiedExplicitSelection &&
      !request.preferredProviderId &&
      !request.preferredModelId
    ) {
      throw new Error(
        "K.I.N.G.S. Model Router: unverified routing is only allowed for an explicit provider/model selection",
      );
    }
  }
}
