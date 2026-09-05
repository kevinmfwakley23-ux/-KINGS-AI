import { randomUUID } from "node:crypto";

import type { ID } from "./types";
import type {
  IntelligenceCapability,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelRequestMessage,
  ModelToolCallProposal,
} from "./model-interface";
import type { ProviderAdapterRegistry } from "./provider-adapters";

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
const MESSAGE_ROLES = new Set(["system", "user", "assistant", "tool"]);
const APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export interface AppAiRouteRequest {
  appId: string;
  requestId?: ID;
  messages: readonly ModelRequestMessage[];
  requiredCapabilities?: readonly IntelligenceCapability[];
  maxOutputTokens?: number;
  temperature?: number;
  requireStructuredOutput?: boolean;
  allowToolProposals?: boolean;
  providerId?: ID;
  modelId?: ID;
  preferProviders?: readonly ID[];
}

export interface AppAiRouteAttempt {
  providerId: ID;
  modelId: ID;
  success: boolean;
  code?: string;
  retryable?: boolean;
}

export interface AppAiRouteSuccess {
  success: true;
  requestId: ID;
  appId: string;
  providerId: ID;
  modelId: ID;
  content: string;
  toolCallProposals: readonly ModelToolCallProposal[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
    elapsedMs: number;
  };
  attempts: readonly AppAiRouteAttempt[];
}

export interface AppAiRouteFailure {
  success: false;
  requestId: ID;
  appId: string;
  code: string;
  message: string;
  attempts: readonly AppAiRouteAttempt[];
}

export type AppAiRouteResult = AppAiRouteSuccess | AppAiRouteFailure;

export class AppAiRouterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "AppAiRouterError";
  }
}

function cleanIds(values: readonly ID[] | undefined): ID[] {
  if (!values) return [];
  const result: ID[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) {
      throw new AppAiRouterError("INVALID_PROVIDER_PREFERENCE", "Provider preferences must contain non-empty ids.");
    }
    const id = value.trim();
    if (!result.includes(id)) result.push(id);
  }
  if (result.length > 16) {
    throw new AppAiRouterError("TOO_MANY_PROVIDER_PREFERENCES", "At most 16 provider preferences may be supplied.");
  }
  return result;
}

function validateRequest(input: AppAiRouteRequest): void {
  if (typeof input?.appId !== "string" || !APP_ID_PATTERN.test(input.appId)) {
    throw new AppAiRouterError(
      "INVALID_APP_ID",
      "appId must be 2 to 64 lowercase letters, numbers, dots, underscores, or hyphens.",
    );
  }
  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 100) {
    throw new AppAiRouterError("INVALID_MESSAGES", "messages must contain between 1 and 100 entries.");
  }
  for (const message of input.messages) {
    if (!message || typeof message !== "object") {
      throw new AppAiRouterError("INVALID_MESSAGE", "Every message must be an object.");
    }
    if (!MESSAGE_ROLES.has(message.role)) {
      throw new AppAiRouterError("INVALID_MESSAGE_ROLE", "Message role is not supported.");
    }
    if (typeof message.content !== "string" || message.content.length < 1 || message.content.length > 100_000) {
      throw new AppAiRouterError("INVALID_MESSAGE_CONTENT", "Message content must contain 1 to 100000 characters.");
    }
  }
  const capabilities = input.requiredCapabilities ?? ["reasoning"];
  if (!Array.isArray(capabilities) || capabilities.length < 1 || capabilities.length > 16) {
    throw new AppAiRouterError("INVALID_CAPABILITIES", "At least one and at most 16 capabilities are required.");
  }
  for (const capability of capabilities) {
    if (!CAPABILITIES.has(capability)) {
      throw new AppAiRouterError("INVALID_CAPABILITY", `Unsupported capability: ${String(capability)}`);
    }
  }
  if (input.maxOutputTokens !== undefined &&
      (!Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > 65_536)) {
    throw new AppAiRouterError("INVALID_MAX_OUTPUT_TOKENS", "maxOutputTokens must be an integer between 1 and 65536.");
  }
  if (input.temperature !== undefined &&
      (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2)) {
    throw new AppAiRouterError("INVALID_TEMPERATURE", "temperature must be between 0 and 2.");
  }
  if (input.requireStructuredOutput !== undefined && typeof input.requireStructuredOutput !== "boolean") {
    throw new AppAiRouterError("INVALID_STRUCTURED_OUTPUT", "requireStructuredOutput must be boolean.");
  }
  if (input.allowToolProposals !== undefined && typeof input.allowToolProposals !== "boolean") {
    throw new AppAiRouterError("INVALID_TOOL_PROPOSALS", "allowToolProposals must be boolean.");
  }
  if (input.providerId !== undefined && (typeof input.providerId !== "string" || !input.providerId.trim())) {
    throw new AppAiRouterError("INVALID_PROVIDER_ID", "providerId must be a non-empty string.");
  }
  if (input.modelId !== undefined && (typeof input.modelId !== "string" || !input.modelId.trim())) {
    throw new AppAiRouterError("INVALID_MODEL_ID", "modelId must be a non-empty string.");
  }
  cleanIds(input.preferProviders);
}

export class AppAiRouter {
  constructor(
    private readonly providers: ProviderAdapterRegistry,
    private readonly defaultProviderOrder: readonly ID[] = [],
  ) {}

  async route(input: AppAiRouteRequest): Promise<AppAiRouteResult> {
    validateRequest(input);
    const requestId = input.requestId?.trim() || randomUUID();
    const requiredCapabilities = [...(input.requiredCapabilities ?? ["reasoning"])] as IntelligenceCapability[];
    const request: ModelExecutionRequest = {
      id: requestId,
      taskId: `app:${input.appId}:${requestId}`,
      missionId: `app:${input.appId}`,
      messages: input.messages.map((message) => ({ ...message })),
      requiredCapabilities,
      inputModalities: ["text"],
      outputModality: "text",
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
      requireStructuredOutput: input.requireStructuredOutput,
      allowToolProposals: input.allowToolProposals ?? false,
    };

    const candidates = this.resolveCandidates(input, request);
    const attempts: AppAiRouteAttempt[] = [];

    if (candidates.length === 0) {
      return {
        success: false,
        requestId,
        appId: input.appId,
        code: "NO_ROUTABLE_MODEL",
        message: "No configured K.I.N.G.S. provider/model can satisfy this request.",
        attempts,
      };
    }

    for (const candidate of candidates) {
      const result: ModelExecutionResult = await this.providers.execute(
        candidate.providerId,
        candidate.modelId,
        request,
      );
      attempts.push({
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        success: result.success,
        code: result.failure?.code,
        retryable: result.failure?.retryable,
      });
      if (result.success && result.response) {
        const response = result.response;
        return {
          success: true,
          requestId,
          appId: input.appId,
          providerId: response.model.providerId,
          modelId: response.model.modelId,
          content: response.content,
          toolCallProposals: response.toolCallProposals,
          usage: {
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            totalTokens: response.usage.inputTokens + response.usage.outputTokens,
            estimatedCost: response.usage.estimatedCost ?? 0,
            elapsedMs: response.usage.elapsedMs,
          },
          attempts,
        };
      }
      if (input.providerId) break;
    }

    const last = attempts.at(-1);
    return {
      success: false,
      requestId,
      appId: input.appId,
      code: last?.code ?? "MODEL_EXECUTION_FAILED",
      message: "All eligible K.I.N.G.S. AI routing attempts failed.",
      attempts,
    };
  }

  private resolveCandidates(
    input: AppAiRouteRequest,
    request: ModelExecutionRequest,
  ): Array<{ providerId: ID; modelId: ID }> {
    const preferred = input.providerId
      ? [input.providerId.trim()]
      : cleanIds(input.preferProviders).length
        ? cleanIds(input.preferProviders)
        : this.defaultProviderOrder.length
          ? cleanIds(this.defaultProviderOrder)
          : this.providers.listAvailable().map((provider) => provider.id);

    const knownAvailable = this.providers.listAvailable().map((provider) => provider.id);
    for (const providerId of knownAvailable) {
      if (!preferred.includes(providerId)) preferred.push(providerId);
    }

    const candidates: Array<{ providerId: ID; modelId: ID }> = [];
    for (const providerId of preferred) {
      const adapter = this.providers.get(providerId);
      if (!adapter || !adapter.descriptor.available) continue;
      const models = adapter.listModels().filter((model) => {
        if (!model.available) return false;
        if (input.modelId && model.modelId !== input.modelId.trim()) return false;
        if (!request.requiredCapabilities.every((capability) => model.capabilities.includes(capability))) return false;
        if (!request.inputModalities.every((modality) => model.inputModalities.includes(modality))) return false;
        if (!model.outputModalities.includes(request.outputModality)) return false;
        if (request.requireStructuredOutput && !model.supportsStructuredOutput) return false;
        return true;
      });
      for (const model of models) candidates.push({ providerId, modelId: model.modelId });
      if (input.providerId && candidates.length) break;
    }
    return candidates;
  }
}
