import type { ID } from "./types";
import type {
  IntelligenceCapability,
  IntelligenceModality,
} from "./model-interface";
import type {
  ModelCapabilityRegistry,
  ModelCapabilityMatch,
} from "./model-capability-registry";

export interface ModelRoutingRequest {
  requiredCapabilities: IntelligenceCapability[];
  minimumCapabilityStrength?: number;
  requiredInputModality?: IntelligenceModality;
  requiredOutputModality?: IntelligenceModality;
  requireStructuredOutput?: boolean;
  requireToolCalling?: boolean;
  preferInternal?: boolean;
  preferredProviderId?: ID;
  preferredModelId?: ID;
  allowUnverifiedExplicitSelection?: boolean;
  maximumEstimatedCost?: number;
}

export interface ModelRoutingMetrics {
  estimatedCost: number;
  latencyMs: number;
  reliability: number;
}

export interface ModelRoutingCandidate {
  modelId: ID;
  providerId: ID;
  capabilityStrength: number;
  estimatedCost: number;
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
      .filter((candidate) =>
        request.maximumEstimatedCost === undefined ||
        candidate.estimatedCost <= request.maximumEstimatedCost,
      )
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

    return {
      modelId: match.model.modelId,
      providerId: match.model.providerId,
      capabilityStrength: match.weakestRequiredStrength,
      estimatedCost: metric?.estimatedCost ?? 0,
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
    if (request.preferInternal && left.internal !== right.internal) {
      return left.internal ? -1 : 1;
    }
    if (left.estimatedCost !== right.estimatedCost) {
      return left.estimatedCost - right.estimatedCost;
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
    if (request.preferredProviderId || request.preferredModelId) {
      const verification = request.allowUnverifiedExplicitSelection
        ? "explicit catalog selection under post-generation verification"
        : "explicit verified model selection";
      return `${verification} ${candidate.providerId}/${candidate.modelId}; estimated cost ${candidate.estimatedCost}; reliability ${candidate.reliability}; capability strength ${candidate.capabilityStrength}`;
    }
    const internalReason = request.preferInternal && candidate.internal
      ? "preferred internal intelligence"
      : "capable available verified model";
    return `${internalReason}; estimated cost ${candidate.estimatedCost}; reliability ${candidate.reliability}; capability strength ${candidate.capabilityStrength}`;
  }

  private validateRequest(request: ModelRoutingRequest): void {
    if (request.requiredCapabilities.length === 0) {
      throw new Error(
        "K.I.N.G.S. Model Router: at least one capability is required",
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
