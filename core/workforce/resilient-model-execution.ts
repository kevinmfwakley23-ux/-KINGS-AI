import type {
  ID,
} from "./types";

import type {
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

import type {
  ModelRoutingCandidate,
} from "./model-routing";

import type {
  ProviderAdapterRegistry,
} from "./provider-adapters";

export interface ModelRouteAttempt {
  providerId: ID;
  modelId: ID;
  success: boolean;
  skipped: boolean;
  failureCode?: string;
  retryable?: boolean;
  message?: string;
}

export interface ResilientModelExecutionOutcome {
  result: ModelExecutionResult;
  attempts: readonly ModelRouteAttempt[];
  providerId?: ID;
  modelId?: ID;
}

export type ModelRouteResultObserver = (
  providerId: ID,
  modelId: ID,
  result: ModelExecutionResult,
) => void | Promise<void>;

export interface ResilientModelExecutionOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  maximumAttempts?: number;
  now?: () => number;
  observeResult?: ModelRouteResultObserver;
}

interface CircuitState {
  failures: number;
  cooldownUntil: number;
}

function routeKey(
  providerId: ID,
  modelId: ID,
): string {
  return `${providerId}::${modelId}`;
}

export class ResilientModelExecutionAuthority {
  private readonly circuit =
    new Map<string, CircuitState>();

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly maximumAttempts: number;
  private readonly now: () => number;
  private readonly observeResult?: ModelRouteResultObserver;

  constructor(
    private readonly providers: ProviderAdapterRegistry,
    options: ResilientModelExecutionOptions = {},
  ) {
    this.failureThreshold =
      options.failureThreshold ?? 2;
    this.cooldownMs =
      options.cooldownMs ?? 30_000;
    this.maximumAttempts =
      options.maximumAttempts ?? 8;
    this.now = options.now ?? Date.now;
    this.observeResult = options.observeResult;

    if (
      this.failureThreshold < 1 ||
      !Number.isInteger(this.failureThreshold)
    ) {
      throw new Error(
        "K.I.N.G.S. Resilient Model Execution: failure threshold must be a positive integer",
      );
    }

    if (
      this.cooldownMs < 0 ||
      !Number.isFinite(this.cooldownMs)
    ) {
      throw new Error(
        "K.I.N.G.S. Resilient Model Execution: cooldown must be a non-negative finite number",
      );
    }

    if (
      this.maximumAttempts < 1 ||
      !Number.isInteger(this.maximumAttempts)
    ) {
      throw new Error(
        "K.I.N.G.S. Resilient Model Execution: maximum attempts must be a positive integer",
      );
    }
  }

  async execute(
    candidates: readonly ModelRoutingCandidate[],
    request: ModelExecutionRequest,
  ): Promise<ResilientModelExecutionOutcome> {
    if (candidates.length === 0) {
      return this.noRouteResult(request, []);
    }

    const attempts: ModelRouteAttempt[] = [];
    let executed = 0;
    let lastResult: ModelExecutionResult | undefined;

    for (const candidate of candidates) {
      if (executed >= this.maximumAttempts) {
        break;
      }

      const key = routeKey(
        candidate.providerId,
        candidate.modelId,
      );
      const circuit = this.circuit.get(key);
      const now = this.now();

      if (
        circuit &&
        circuit.cooldownUntil > now
      ) {
        attempts.push({
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          success: false,
          skipped: true,
          failureCode: "ROUTE_COOLDOWN",
          retryable: true,
          message:
            `Route is cooling down until ${new Date(circuit.cooldownUntil).toISOString()}.`,
        });
        continue;
      }

      if (
        circuit &&
        circuit.cooldownUntil > 0 &&
        circuit.cooldownUntil <= now
      ) {
        this.circuit.set(key, {
          failures: 0,
          cooldownUntil: 0,
        });
      }

      executed += 1;
      const result = await this.providers.execute(
        candidate.providerId,
        candidate.modelId,
        request,
      );
      lastResult = result;
      await this.observeSafely(
        candidate.providerId,
        candidate.modelId,
        result,
      );

      if (
        result.success &&
        result.response
      ) {
        this.circuit.delete(key);
        attempts.push({
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          success: true,
          skipped: false,
        });

        return {
          result,
          attempts,
          providerId: candidate.providerId,
          modelId: candidate.modelId,
        };
      }

      const failure = result.failure;
      attempts.push({
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        success: false,
        skipped: false,
        failureCode: failure?.code,
        retryable: failure?.retryable,
        message: failure?.message,
      });

      const previous = this.circuit.get(key) ?? {
        failures: 0,
        cooldownUntil: 0,
      };
      const failures = previous.failures + 1;

      this.circuit.set(key, {
        failures,
        cooldownUntil:
          failures >= this.failureThreshold
            ? now + this.cooldownMs
            : 0,
      });
    }

    if (lastResult) {
      return {
        result: lastResult,
        attempts,
      };
    }

    return this.noRouteResult(
      request,
      attempts,
    );
  }

  getCircuitState(
    providerId: ID,
    modelId: ID,
  ):
    Readonly<CircuitState> | undefined {
    const state = this.circuit.get(
      routeKey(providerId, modelId),
    );

    return state
      ? { ...state }
      : undefined;
  }

  reset(
    providerId?: ID,
    modelId?: ID,
  ): void {
    if (!providerId) {
      this.circuit.clear();
      return;
    }

    if (modelId) {
      this.circuit.delete(
        routeKey(providerId, modelId),
      );
      return;
    }

    for (const key of this.circuit.keys()) {
      if (key.startsWith(`${providerId}::`)) {
        this.circuit.delete(key);
      }
    }
  }

  private async observeSafely(
    providerId: ID,
    modelId: ID,
    result: ModelExecutionResult,
  ): Promise<void> {
    if (!this.observeResult) return;
    try {
      await this.observeResult(providerId, modelId, result);
    } catch {
      // Route-learning telemetry is advisory. It must never change or block
      // the governed execution result that produced the evidence.
    }
  }

  private noRouteResult(
    request: ModelExecutionRequest,
    attempts: ModelRouteAttempt[],
  ): ResilientModelExecutionOutcome {
    const timestamp = new Date(
      this.now(),
    ).toISOString();

    return {
      result: {
        success: false,
        failure: {
          requestId: request.id,
          providerId: "routing",
          modelId: "routing",
          retryable: true,
          code: "NO_EXECUTABLE_MODEL_ROUTE",
          message:
            "No model route could be executed; all candidates were unavailable, cooling down, or absent.",
          metadata: {
            requestId: request.id,
            startedAt: timestamp,
            completedAt: timestamp,
            latencyMs: 0,
          },
        },
      },
      attempts,
    };
  }
}
