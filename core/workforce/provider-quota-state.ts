import type { ModelRoutingCandidate } from "./model-routing";

export interface ProviderQuotaObservation {
  providerId: string;
  modelId?: string;
  observedAt: string;
  remainingRequests?: number;
  remainingTokens?: number;
  resetAt?: string;
  retryAfterMs?: number;
  statusCode?: number;
}

export interface ProviderQuotaState {
  providerId: string;
  modelId?: string;
  remainingRequests?: number;
  remainingTokens?: number;
  exhausted: boolean;
  cooldownUntil?: string;
  observedAt: string;
  reason: string;
}

export interface QuotaAwareCandidateDecision {
  candidates: ModelRoutingCandidate[];
  excluded: Array<{
    providerId: string;
    modelId: string;
    reason: string;
  }>;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function key(providerId: string, modelId?: string): string {
  return `${providerId}::${modelId ?? "*"}`;
}

export class ProviderQuotaAuthority {
  private readonly states = new Map<string, ProviderQuotaState>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly defaultRateLimitCooldownMs = 60_000,
  ) {
    if (!finiteNonNegative(defaultRateLimitCooldownMs)) {
      throw new Error("K.I.N.G.S. Provider Quota: default cooldown must be finite and non-negative.");
    }
  }

  observe(observation: ProviderQuotaObservation): ProviderQuotaState {
    if (!observation.providerId.trim()) {
      throw new Error("K.I.N.G.S. Provider Quota: provider id is required.");
    }
    if (observation.modelId !== undefined && !observation.modelId.trim()) {
      throw new Error("K.I.N.G.S. Provider Quota: model id cannot be empty when supplied.");
    }
    const observedAtMs = Date.parse(observation.observedAt);
    if (!Number.isFinite(observedAtMs)) {
      throw new Error("K.I.N.G.S. Provider Quota: observedAt must be a valid timestamp.");
    }
    for (const [name, value] of [
      ["remainingRequests", observation.remainingRequests],
      ["remainingTokens", observation.remainingTokens],
      ["retryAfterMs", observation.retryAfterMs],
    ] as const) {
      if (value !== undefined && !finiteNonNegative(value)) {
        throw new Error(`K.I.N.G.S. Provider Quota: ${name} must be finite and non-negative.`);
      }
    }

    const resetAtMs = observation.resetAt === undefined
      ? undefined
      : Date.parse(observation.resetAt);
    if (resetAtMs !== undefined && !Number.isFinite(resetAtMs)) {
      throw new Error("K.I.N.G.S. Provider Quota: resetAt must be a valid timestamp when supplied.");
    }

    const rateLimited = observation.statusCode === 429;
    const exhausted =
      observation.remainingRequests === 0 ||
      observation.remainingTokens === 0 ||
      rateLimited;
    const cooldownUntilMs = exhausted
      ? resetAtMs ?? (observedAtMs + (observation.retryAfterMs ?? this.defaultRateLimitCooldownMs))
      : undefined;
    const state: ProviderQuotaState = {
      providerId: observation.providerId,
      modelId: observation.modelId,
      remainingRequests: observation.remainingRequests,
      remainingTokens: observation.remainingTokens,
      exhausted,
      cooldownUntil: cooldownUntilMs === undefined
        ? undefined
        : new Date(cooldownUntilMs).toISOString(),
      observedAt: new Date(observedAtMs).toISOString(),
      reason: rateLimited
        ? "Provider returned HTTP 429; route is cooling down."
        : exhausted
          ? "Provider quota reports zero remaining capacity; route is withheld until reset."
          : "Provider quota reports remaining capacity.",
    };
    this.states.set(key(state.providerId, state.modelId), state);
    return { ...state };
  }

  state(providerId: string, modelId?: string): ProviderQuotaState | undefined {
    const exact = this.states.get(key(providerId, modelId));
    const provider = modelId === undefined
      ? undefined
      : this.states.get(key(providerId));
    const refreshedExact = exact ? this.refresh(exact) : undefined;
    const refreshedProvider = provider ? this.refresh(provider) : undefined;

    // Provider-wide exhaustion is authoritative across every model. A narrower
    // model record may add an additional block, but it may never hide a newer
    // provider-wide 429/quota exhaustion event.
    if (refreshedProvider?.exhausted) return refreshedProvider;
    if (refreshedExact?.exhausted) return refreshedExact;
    return refreshedExact ?? refreshedProvider;
  }

  filter(candidates: readonly ModelRoutingCandidate[]): QuotaAwareCandidateDecision {
    const available: ModelRoutingCandidate[] = [];
    const excluded: QuotaAwareCandidateDecision["excluded"] = [];
    for (const candidate of candidates) {
      const state = this.state(candidate.providerId, candidate.modelId);
      if (state?.exhausted) {
        excluded.push({
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          reason: `${state.reason}${state.cooldownUntil ? ` Retry after ${state.cooldownUntil}.` : ""}`,
        });
        continue;
      }
      available.push(candidate);
    }
    return {
      candidates: available,
      excluded,
    };
  }

  private refresh(state: ProviderQuotaState): ProviderQuotaState {
    if (!state.exhausted || !state.cooldownUntil) return { ...state };
    const cooldown = Date.parse(state.cooldownUntil);
    if (cooldown > this.now()) return { ...state };
    const refreshed: ProviderQuotaState = {
      ...state,
      exhausted: false,
      cooldownUntil: undefined,
      reason: "Provider quota cooldown expired; route may be probed again.",
    };
    this.states.set(key(refreshed.providerId, refreshed.modelId), refreshed);
    return { ...refreshed };
  }
}
