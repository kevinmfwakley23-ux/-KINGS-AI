import { randomUUID } from "node:crypto";

import type {
  IntelligenceCapability,
  ModelExecutionRequest,
  ModelRequestMessage,
  ModelToolCallProposal,
  ModelToolDefinition,
} from "./model-interface";
import {
  estimateModelContextCapacity,
  type ModelContextCapacityEstimate,
} from "./model-context-capacity";
import type {
  ModelCostPreference,
  ModelRoutingCandidate,
  ModelRoutingRequest,
} from "./model-routing";
import { ModelRouter } from "./model-routing";
import {
  ResilientModelExecutionAuthority,
  type ModelRouteAttempt,
} from "./resilient-model-execution";

const APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const MESSAGE_ROLES = new Set(["system", "user", "assistant", "tool"]);
const CAPABILITIES = new Set<IntelligenceCapability>([
  "reasoning",
  "planning",
  "coding",
  "debugging",
  "research",
  "web-learning",
  "source-inspection",
  "tool-use",
  "structured-output",
  "vision",
  "audio",
  "long-context",
  "memory",
  "verification",
  "recovery",
]);

export interface AppMegaRouterRequest {
  appId: string;
  requestId?: string;
  messages: readonly ModelRequestMessage[];
  requiredCapabilities?: readonly IntelligenceCapability[];
  maxOutputTokens?: number;
  temperature?: number;
  requireStructuredOutput?: boolean;
  allowToolProposals?: boolean;
  toolDefinitions?: readonly ModelToolDefinition[];
  minimumCapabilityStrength?: number;
  minimumContextTokens?: number;
  costPreference?: ModelCostPreference;
  preferInternal?: boolean;
  preferExternal?: boolean;
  preferredProviderId?: string;
  preferredModelId?: string;
  allowUnverifiedExplicitSelection?: boolean;
  allowUnverifiedUnderPostExecutionVerification?: boolean;
  maximumEstimatedCost?: number;
  minimumReliability?: number;
  maximumLatencyMs?: number;
  allowedProviderIds?: readonly string[];
  deniedProviderIds?: readonly string[];
}

export interface AppMegaRouterCandidateEvidence {
  providerId: string;
  modelId: string;
  capabilityStrength: number;
  estimatedCost: number | null;
  costBasis: ModelRoutingCandidate["costBasis"];
  latencyMs: number;
  reliability: number;
  contextWindowTokens?: number;
  internal: boolean;
  zeroMarginalCost?: boolean;
}

export interface AppMegaRouterSuccess {
  success: true;
  appId: string;
  requestId: string;
  providerId: string;
  modelId: string;
  content: string;
  toolCallProposals: readonly ModelToolCallProposal[];
  routeReason: string;
  context: ModelContextCapacityEstimate;
  candidates: readonly AppMegaRouterCandidateEvidence[];
  attempts: readonly ModelRouteAttempt[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens?: number;
    savedTokens?: number;
    reportedCostUsd?: number;
    elapsedMs: number;
  };
}

export interface AppMegaRouterFailure {
  success: false;
  appId: string;
  requestId: string;
  code: string;
  message: string;
  routeReason: string;
  context: ModelContextCapacityEstimate;
  candidates: readonly AppMegaRouterCandidateEvidence[];
  attempts: readonly ModelRouteAttempt[];
}

export type AppMegaRouterResult = AppMegaRouterSuccess | AppMegaRouterFailure;

export class AppMegaRouterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "AppMegaRouterError";
  }
}

function requireFiniteRange(
  value: number | undefined,
  name: string,
  minimum: number,
  maximum: number,
): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < minimum || value > maximum)
  ) {
    throw new AppMegaRouterError(
      `INVALID_${name.toUpperCase()}`,
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }
}

function requirePositiveInteger(
  value: number | undefined,
  name: string,
  maximum: number,
): void {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || value < 1 || value > maximum)
  ) {
    throw new AppMegaRouterError(
      `INVALID_${name.toUpperCase()}`,
      `${name} must be an integer between 1 and ${maximum}.`,
    );
  }
}

function cleanProviderIds(
  values: readonly string[] | undefined,
  name: string,
): string[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length > 64) {
    throw new AppMegaRouterError(
      `INVALID_${name.toUpperCase()}`,
      `${name} must contain at most 64 provider ids.`,
    );
  }
  const cleaned: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) {
      throw new AppMegaRouterError(
        `INVALID_${name.toUpperCase()}`,
        `${name} must contain only non-empty provider ids.`,
      );
    }
    const id = value.trim();
    if (!cleaned.includes(id)) cleaned.push(id);
  }
  return cleaned;
}

function validateRequest(input: AppMegaRouterRequest): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AppMegaRouterError("INVALID_REQUEST", "App router request must be an object.");
  }
  if (typeof input.appId !== "string" || !APP_ID_PATTERN.test(input.appId)) {
    throw new AppMegaRouterError(
      "INVALID_APP_ID",
      "appId must be 2 to 64 lowercase letters, numbers, dots, underscores, or hyphens.",
    );
  }
  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 100) {
    throw new AppMegaRouterError("INVALID_MESSAGES", "messages must contain between 1 and 100 entries.");
  }
  for (const message of input.messages) {
    if (!message || typeof message !== "object" || !MESSAGE_ROLES.has(message.role)) {
      throw new AppMegaRouterError("INVALID_MESSAGE", "Every message must use a supported role.");
    }
    if (typeof message.content !== "string" || message.content.length < 1 || message.content.length > 100_000) {
      throw new AppMegaRouterError(
        "INVALID_MESSAGE_CONTENT",
        "Message content must contain between 1 and 100000 characters.",
      );
    }
  }

  const capabilities = input.requiredCapabilities ?? ["reasoning"];
  if (!Array.isArray(capabilities) || capabilities.length < 1 || capabilities.length > 16) {
    throw new AppMegaRouterError("INVALID_CAPABILITIES", "Between 1 and 16 capabilities are required.");
  }
  for (const capability of capabilities) {
    if (!CAPABILITIES.has(capability)) {
      throw new AppMegaRouterError(
        "INVALID_CAPABILITY",
        `Unsupported capability: ${String(capability)}.`,
      );
    }
  }

  requirePositiveInteger(input.maxOutputTokens, "max_output_tokens", 65_536);
  requirePositiveInteger(input.minimumContextTokens, "minimum_context_tokens", 4_000_000);
  requireFiniteRange(input.temperature, "temperature", 0, 2);
  requireFiniteRange(input.minimumCapabilityStrength, "minimum_capability_strength", 0, 100);
  requireFiniteRange(input.maximumEstimatedCost, "maximum_estimated_cost", 0, 1_000_000);
  requireFiniteRange(input.minimumReliability, "minimum_reliability", 0, 100);
  requireFiniteRange(input.maximumLatencyMs, "maximum_latency_ms", 0, 86_400_000);

  if (input.preferInternal && input.preferExternal) {
    throw new AppMegaRouterError(
      "CONFLICTING_PROVIDER_PREFERENCE",
      "preferInternal and preferExternal cannot both be true.",
    );
  }
  if (input.preferredProviderId !== undefined && !input.preferredProviderId.trim()) {
    throw new AppMegaRouterError("INVALID_PREFERRED_PROVIDER", "preferredProviderId must be non-empty.");
  }
  if (input.preferredModelId !== undefined && !input.preferredModelId.trim()) {
    throw new AppMegaRouterError("INVALID_PREFERRED_MODEL", "preferredModelId must be non-empty.");
  }
  if (input.toolDefinitions !== undefined && !Array.isArray(input.toolDefinitions)) {
    throw new AppMegaRouterError("INVALID_TOOL_DEFINITIONS", "toolDefinitions must be an array.");
  }
  if ((input.toolDefinitions?.length ?? 0) > 128) {
    throw new AppMegaRouterError("TOO_MANY_TOOL_DEFINITIONS", "At most 128 tool definitions may be advertised.");
  }

  const allowed = cleanProviderIds(input.allowedProviderIds, "allowed_provider_ids");
  const denied = cleanProviderIds(input.deniedProviderIds, "denied_provider_ids");
  if (allowed && denied) {
    const overlap = allowed.find((providerId) => denied.includes(providerId));
    if (overlap) {
      throw new AppMegaRouterError(
        "CONFLICTING_PROVIDER_POLICY",
        `Provider "${overlap}" cannot be both allowed and denied.`,
      );
    }
  }
}

function candidateEvidence(
  candidate: ModelRoutingCandidate,
): AppMegaRouterCandidateEvidence {
  return {
    providerId: candidate.providerId,
    modelId: candidate.modelId,
    capabilityStrength: candidate.capabilityStrength,
    estimatedCost: candidate.estimatedCost,
    costBasis: candidate.costBasis,
    latencyMs: candidate.latencyMs,
    reliability: candidate.reliability,
    contextWindowTokens: candidate.contextWindowTokens,
    internal: candidate.internal,
    zeroMarginalCost: candidate.zeroMarginalCost,
  };
}

export class AppMegaRouter {
  constructor(
    private readonly router: ModelRouter,
    private readonly executor: ResilientModelExecutionAuthority,
  ) {}

  async route(input: AppMegaRouterRequest): Promise<AppMegaRouterResult> {
    validateRequest(input);

    const requestId = input.requestId?.trim() || randomUUID();
    const requiredCapabilities = [
      ...(input.requiredCapabilities ?? ["reasoning"]),
    ] as IntelligenceCapability[];
    const request: ModelExecutionRequest = {
      id: requestId,
      taskId: `app:${input.appId}:${requestId}`,
      missionId: `app:${input.appId}`,
      messages: input.messages.map((message) => ({
        ...message,
        ...(message.toolCalls
          ? { toolCalls: message.toolCalls.map((toolCall) => ({ ...toolCall })) }
          : {}),
      })),
      requiredCapabilities,
      inputModalities: ["text"],
      outputModality: "text",
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
      requireStructuredOutput: input.requireStructuredOutput,
      allowToolProposals: input.allowToolProposals ?? false,
      toolDefinitions: input.toolDefinitions?.map((tool) => ({
        ...tool,
        inputSchema: { ...tool.inputSchema },
      })),
      parallelToolCalls: false,
    };

    const context = estimateModelContextCapacity(request);
    const requiredContextTokens = Math.max(
      context.requiredContextTokens,
      input.minimumContextTokens ?? 0,
    );
    const routingRequest: ModelRoutingRequest = {
      requiredCapabilities,
      minimumCapabilityStrength: input.minimumCapabilityStrength,
      requiredInputModality: "text",
      requiredOutputModality: "text",
      requireStructuredOutput: input.requireStructuredOutput,
      requireToolCalling: input.allowToolProposals === true,
      requiredContextTokens,
      costPreference: input.costPreference ?? "economy",
      preferInternal: input.preferInternal,
      preferExternal: input.preferExternal,
      preferredProviderId: input.preferredProviderId?.trim(),
      preferredModelId: input.preferredModelId?.trim(),
      allowUnverifiedExplicitSelection: input.allowUnverifiedExplicitSelection,
      allowUnverifiedUnderPostExecutionVerification:
        input.allowUnverifiedUnderPostExecutionVerification,
      maximumEstimatedCost: input.maximumEstimatedCost,
      minimumReliability: input.minimumReliability,
      maximumLatencyMs: input.maximumLatencyMs,
      allowedProviderIds: cleanProviderIds(input.allowedProviderIds, "allowed_provider_ids"),
      deniedProviderIds: cleanProviderIds(input.deniedProviderIds, "denied_provider_ids"),
    };

    const decision = this.router.route(routingRequest);
    const candidates = decision.candidates.map(candidateEvidence);

    if (!decision.selected || decision.candidates.length === 0) {
      return {
        success: false,
        appId: input.appId,
        requestId,
        code: "NO_ROUTABLE_MODEL",
        message: decision.reason,
        routeReason: decision.reason,
        context: {
          ...context,
          requiredContextTokens,
        },
        candidates,
        attempts: [],
      };
    }

    const outcome = await this.executor.execute(decision.candidates, request);
    const result = outcome.result;
    if (!result.success || !result.response) {
      return {
        success: false,
        appId: input.appId,
        requestId,
        code: result.failure?.code ?? "MODEL_EXECUTION_FAILED",
        message: result.failure?.message ?? "All eligible K.I.N.G.S. model routes failed.",
        routeReason: decision.reason,
        context: {
          ...context,
          requiredContextTokens,
        },
        candidates,
        attempts: outcome.attempts,
      };
    }

    const response = result.response;
    return {
      success: true,
      appId: input.appId,
      requestId,
      providerId: response.model.providerId,
      modelId: response.model.modelId,
      content: response.content,
      toolCallProposals: response.toolCallProposals.map((proposal) => ({
        ...proposal,
        arguments: { ...proposal.arguments },
      })),
      routeReason: decision.reason,
      context: {
        ...context,
        requiredContextTokens,
      },
      candidates,
      attempts: outcome.attempts,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.tokensUsed,
        cachedTokens: response.usage.cachedTokens,
        savedTokens: response.usage.savedTokens,
        reportedCostUsd: response.usage.reportedCostUsd,
        elapsedMs: response.usage.elapsedMs,
      },
    };
  }
}
