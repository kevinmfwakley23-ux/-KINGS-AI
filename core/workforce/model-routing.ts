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

export type ModelCostPreference =
  | "economy"
  | "free-only"
  | "local-only"
  | "quality";

export interface ModelRoutingRequest {
  requiredCapabilities: IntelligenceCapability[];
  minimumCapabilityStrength?: number;
  requiredInputModality?: IntelligenceModality;
  requiredOutputModality?: IntelligenceModality;
  requireStructuredOutput?: boolean;
  requireToolCalling?: boolean;
  /**
   * Minimum model context window required for the assembled execution request.
   * This is a hard capacity boundary: K.I.N.G.S. must not knowingly route a
   * request to a model that cannot fit the required context.
   */
  requiredContextTokens?: number;
  /**
   * Owner cost policy. Economy is the default and prefers zero-marginal-cost
   * local/verified-free routes before the cheapest known paid route. Free-only
   * and local-only are hard filters. Quality intentionally ranks capability and
   * reliability before price while retaining every other policy boundary.
   */
  costPreference?: ModelCostPreference;
  preferInternal?: boolean;
  preferExternal?: boolean;
  preferredProviderId?: ID;
  preferredModelId?: ID;
  /**
   * Explicit owner model selection may choose a model below an automatic
   * capability-strength floor. Required capability names, modality, context,
   * provider policy, tool compatibility, sandboxing, and post-execution
   * verification remain authoritative.
   */
  allowUnverifiedExplicitSelection?: boolean;
  /**
   * Allows a live, available, capability-matched model whose benchmark status is
   * still unverified to participate in automatic routing only when the caller
   * has an independent post-execution verification boundary. This does not
   * promote the capability to verified and does not bypass cost ceilings.
   */
  allowUnverifiedUnderPostExecutionVerification?: boolean;
  maximumEstimatedCost?: number;
  /** Minimum learned/configured route reliability on the K.I.N.G.S. 0-100 scale. */
  minimumReliability?: number;
  /** Maximum learned/configured route latency. Unknown latency fails this policy closed. */
  maximumLatencyMs?: number;
  /** Optional provider allow-list. When supplied, every candidate must be listed. */
  allowedProviderIds?: ID[];
  /** Optional provider deny-list, applied even to an explicitly selected route. */
  deniedProviderIds?: ID[];
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
  contextWindowTokens: number;
  internal: boolean;
  zeroMarginalCost: boolean;
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
    const unverifiedSelectionAllowed =
      request.allowUnverifiedUnderPostExecutionVerification === true ||
      (
        explicitSelection &&
        request.allowUnverifiedExplicitSelection === true
      );
    const automaticStrengthFloor =
      request.minimumCapabilityStrength ?? 0;
    const effectiveMinimumStrength =
      explicitSelection &&
      request.allowUnverifiedExplicitSelection === true
        ? 0
        : automaticStrengthFloor;

    const matches = this.capabilityRegistry.discover({
      requiredCapabilities: request.requiredCapabilities,
      minimumStrength: effectiveMinimumStrength,
      verifiedOnly: !unverifiedSelectionAllowed,
      availableOnly: true,
      providerId: request.preferredProviderId,
      modelId: request.preferredModelId,
    });

    const candidates = matches
      .filter((match) =>
        this.supportsModalities(match, request) &&
        this.supportsStructuredOutput(match, request) &&
        this.supportsToolCalling(match, request) &&
        this.supportsContextWindow(match, request),
      )
      .map((match) => this.toCandidate(match))
      .filter((candidate) =>
        this.satisfiesRoutePolicy(candidate, request) &&
        this.satisfiesCostPreference(candidate, request.costPreference ?? "economy"),
      )
      .filter((candidate) => {
        if (request.maximumEstimatedCost === undefined) return true;
        if (candidate.estimatedCost !== null) {
          return candidate.estimatedCost <= request.maximumEstimatedCost;
        }
        // Only an explicit live-catalog choice may pass an unknown KINGS-side
        // price through a caller-supplied cost ceiling. Automatic routing must
        // not silently treat an unknown price as affordable.
        return explicitSelection && request.allowUnverifiedExplicitSelection === true;
      })
      .sort((left, right) =>
        this.compareCandidates(left, right, request),
      );

    if (candidates.length === 0) {
      const requested = [
        request.preferredProviderId,
        request.preferredModelId,
      ].filter(Boolean).join("/");
      const preference = request.costPreference ?? "economy";
      return {
        selected: false,
        reason: requested
          ? `Requested model route "${requested}" is unavailable or does not satisfy the routing requirements and policy constraints.`
          : `No available model satisfies the verification, capability, context-window, provider, reliability, latency, cost, and ${preference} routing policies.`,
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
    const costBasis = metric?.costBasis ??
      (estimatedCost === null ? "unknown" : "configured-estimate");
    const internal =
      match.model.providerKind === "internal-local" ||
      match.model.providerKind === "internal-self-hosted";
    const zeroMarginalCost =
      internal ||
      costBasis === "verified-free" ||
      (estimatedCost === 0 && costBasis !== "unknown");

    return {
      modelId: match.model.modelId,
      providerId: match.model.providerId,
      capabilityStrength: match.weakestRequiredStrength,
      estimatedCost,
      costBasis,
      latencyMs: metric?.latencyMs ?? Number.MAX_SAFE_INTEGER,
      reliability: metric?.reliability ?? 0,
      contextWindowTokens: match.model.contextWindowTokens,
      internal,
      zeroMarginalCost,
    };
  }

  private satisfiesRoutePolicy(
    candidate: ModelRoutingCandidate,
    request: ModelRoutingRequest,
  ): boolean {
    if (
      request.allowedProviderIds !== undefined &&
      !request.allowedProviderIds.includes(candidate.providerId)
    ) {
      return false;
    }
    if (request.deniedProviderIds?.includes(candidate.providerId)) {
      return false;
    }
    if (
      request.minimumReliability !== undefined &&
      candidate.reliability < request.minimumReliability
    ) {
      return false;
    }
    if (
      request.maximumLatencyMs !== undefined &&
      candidate.latencyMs > request.maximumLatencyMs
    ) {
      return false;
    }
    return true;
  }

  private satisfiesCostPreference(
    candidate: ModelRoutingCandidate,
    preference: ModelCostPreference,
  ): boolean {
    if (preference === "local-only") {
      return candidate.internal;
    }
    if (preference === "free-only") {
      return candidate.zeroMarginalCost;
    }
    return true;
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

  private supportsContextWindow(
    match: ModelCapabilityMatch,
    request: ModelRoutingRequest,
  ): boolean {
    return request.requiredContextTokens === undefined ||
      match.model.contextWindowTokens >= request.requiredContextTokens;
  }

  private compareCandidates(
    left: ModelRoutingCandidate,
    right: ModelRoutingCandidate,
    request: ModelRoutingRequest,
  ): number {
    const preference = request.costPreference ?? "economy";

    if (preference === "quality") {
      if (request.preferExternal && left.internal !== right.internal) {
        return left.internal ? 1 : -1;
      }
      if (request.preferInternal && left.internal !== right.internal) {
        return left.internal ? -1 : 1;
      }
      if (left.capabilityStrength !== right.capabilityStrength) {
        return right.capabilityStrength - left.capabilityStrength;
      }
      if (left.reliability !== right.reliability) {
        return right.reliability - left.reliability;
      }
      const cost = this.compareCost(left, right);
      if (cost !== 0) return cost;
      if (left.latencyMs !== right.latencyMs) {
        return left.latencyMs - right.latencyMs;
      }
    } else {
      if (left.zeroMarginalCost !== right.zeroMarginalCost) {
        return left.zeroMarginalCost ? -1 : 1;
      }
      const cost = this.compareCost(left, right);
      if (cost !== 0) return cost;
      if (request.preferExternal && left.internal !== right.internal) {
        return left.internal ? 1 : -1;
      }
      if (request.preferInternal && left.internal !== right.internal) {
        return left.internal ? -1 : 1;
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
    }

    if (left.providerId !== right.providerId) {
      return left.providerId.localeCompare(right.providerId);
    }
    return left.modelId.localeCompare(right.modelId);
  }

  private compareCost(
    left: ModelRoutingCandidate,
    right: ModelRoutingCandidate,
  ): number {
    const leftKnown = left.estimatedCost !== null;
    const rightKnown = right.estimatedCost !== null;
    if (leftKnown !== rightKnown) {
      return leftKnown ? -1 : 1;
    }
    if (
      leftKnown &&
      rightKnown &&
      left.estimatedCost !== right.estimatedCost
    ) {
      return (left.estimatedCost as number) - (right.estimatedCost as number);
    }
    if (left.costBasis === "verified-free" && right.costBasis !== "verified-free") {
      return -1;
    }
    if (right.costBasis === "verified-free" && left.costBasis !== "verified-free") {
      return 1;
    }
    return 0;
  }

  private buildReason(
    candidate: ModelRoutingCandidate,
    request: ModelRoutingRequest,
  ): string {
    const cost = candidate.estimatedCost === null
      ? "cost unknown (not treated as free)"
      : `estimated cost ${candidate.estimatedCost} (${candidate.costBasis})`;
    const performance =
      `reliability ${candidate.reliability}; latency ${candidate.latencyMs}ms; context ${candidate.contextWindowTokens} tokens`;
    const economy =
      `cost preference ${request.costPreference ?? "economy"}; ${candidate.zeroMarginalCost ? "zero marginal token cost" : "metered route"}`;
    if (request.preferredProviderId || request.preferredModelId) {
      const verification = request.allowUnverifiedExplicitSelection
        ? "explicit owner model selection under post-generation verification"
        : "explicit verified model selection";
      return `${verification} ${candidate.providerId}/${candidate.modelId}; ${economy}; ${cost}; ${performance}; capability strength ${candidate.capabilityStrength}`;
    }
    if (request.allowUnverifiedUnderPostExecutionVerification) {
      return `governed model selection under independent post-execution verification; ${candidate.providerId}/${candidate.modelId}; ${economy}; ${cost}; ${performance}; capability strength ${candidate.capabilityStrength}`;
    }
    const providerPreference = request.preferExternal && !candidate.internal
      ? "preferred external intelligence"
      : request.preferInternal && candidate.internal
        ? "preferred internal intelligence"
        : "capable available verified model";
    return `${providerPreference}; ${economy}; ${cost}; ${performance}; capability strength ${candidate.capabilityStrength}`;
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
    if (
      request.costPreference !== undefined &&
      !["economy", "free-only", "local-only", "quality"].includes(
        request.costPreference,
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Model Router: unsupported cost preference",
      );
    }
    const minimumStrength = request.minimumCapabilityStrength ?? 0;
    if (minimumStrength < 0 || minimumStrength > 100) {
      throw new Error(
        "K.I.N.G.S. Model Router: minimum capability strength must be between 0 and 100",
      );
    }
    if (
      request.requiredContextTokens !== undefined &&
      (
        !Number.isFinite(request.requiredContextTokens) ||
        !Number.isInteger(request.requiredContextTokens) ||
        request.requiredContextTokens < 1
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Model Router: required context tokens must be a positive integer",
      );
    }
    if (
      request.maximumEstimatedCost !== undefined &&
      (
        !Number.isFinite(request.maximumEstimatedCost) ||
        request.maximumEstimatedCost < 0
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Model Router: maximum estimated cost must be finite and cannot be negative",
      );
    }
    if (
      request.minimumReliability !== undefined &&
      (
        !Number.isFinite(request.minimumReliability) ||
        request.minimumReliability < 0 ||
        request.minimumReliability > 100
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Model Router: minimum reliability must be between 0 and 100",
      );
    }
    if (
      request.maximumLatencyMs !== undefined &&
      (
        !Number.isFinite(request.maximumLatencyMs) ||
        request.maximumLatencyMs < 0
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Model Router: maximum latency must be a finite non-negative number",
      );
    }
    this.validateProviderPolicy(request.allowedProviderIds, "allowedProviderIds");
    this.validateProviderPolicy(request.deniedProviderIds, "deniedProviderIds");
    if (request.allowedProviderIds && request.deniedProviderIds) {
      const denied = new Set(request.deniedProviderIds);
      const overlap = request.allowedProviderIds.filter((id) => denied.has(id));
      if (overlap.length > 0) {
        throw new Error(
          `K.I.N.G.S. Model Router: provider ids cannot be both allowed and denied: ${overlap.join(", ")}`,
        );
      }
    }
    if (
      request.allowUnverifiedExplicitSelection &&
      !request.preferredProviderId &&
      !request.preferredModelId
    ) {
      throw new Error(
        "K.I.N.G.S. Model Router: unverified explicit routing requires an explicit provider/model selection",
      );
    }
  }

  private validateProviderPolicy(
    providerIds: ID[] | undefined,
    label: string,
  ): void {
    if (!providerIds) return;
    const seen = new Set<string>();
    for (const providerId of providerIds) {
      if (!providerId.trim()) {
        throw new Error(`K.I.N.G.S. Model Router: ${label} cannot contain an empty provider id`);
      }
      if (seen.has(providerId)) {
        throw new Error(`K.I.N.G.S. Model Router: ${label} contains duplicate provider id "${providerId}"`);
      }
      seen.add(providerId);
    }
  }
}
