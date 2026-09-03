import type { ID } from "./types";
import type {
  IntelligenceCapability,
  IntelligenceModel,
  IntelligenceProviderKind,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
  ModelToolCallProposal,
} from "./model-interface";
import type {
  ProviderAdapter,
  ProviderDescriptor,
} from "./provider-adapters";

export type OpenAiCompatibleGatewayKind =
  | "omniroute"
  | "9router"
  | "litellm"
  | "openrouter"
  | "openai-compatible";

export const DEFAULT_GATEWAY_CODING_CAPABILITIES = [
  "reasoning",
  "planning",
  "coding",
  "debugging",
  "research",
  "source-inspection",
  "tool-use",
  "structured-output",
  "long-context",
  "verification",
  "recovery",
] as const satisfies readonly IntelligenceCapability[];

export interface OpenAiCompatibleGatewayModelDefinition {
  modelId: ID;
  displayName?: string;
  capabilities: readonly IntelligenceCapability[];
  contextWindowTokens?: number;
  supportsToolCalling?: boolean;
  supportsStructuredOutput?: boolean;
}

export interface OpenAiCompatibleGatewayConfig {
  id: ID;
  name: string;
  gatewayKind: OpenAiCompatibleGatewayKind;
  baseUrl: string;
  apiKey?: string;
  providerKind?: IntelligenceProviderKind;
  models?: readonly OpenAiCompatibleGatewayModelDefinition[];
  requestTimeoutMs?: number;
  available?: boolean;
  discoverModels?: boolean;
  allowDynamicModels?: boolean;
  discoveredModelCapabilities?: readonly IntelligenceCapability[];
}

export interface OpenAiCompatibleGatewayHttpResponse {
  status: number;
  body: unknown;
  text: string;
}

export interface OpenAiCompatibleGatewayTransport {
  request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<OpenAiCompatibleGatewayHttpResponse>;
}

export interface OpenAiCompatibleGatewayHealth {
  ok: boolean;
  gatewayId: ID;
  gatewayKind: OpenAiCompatibleGatewayKind;
  status?: number;
  models: string[];
  codingModels: string[];
  message: string;
}

interface OpenAiChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cached_tokens?: number;
    saved_tokens?: number;
    tokens_saved?: number;
    cost?: number;
    cost_usd?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
  cost?: number;
  cost_usd?: number;
  compression?: {
    saved_tokens?: number;
    tokens_saved?: number;
  };
}

interface OpenAiModelListResponse {
  data?: Array<{ id?: string; kind?: string; owned_by?: string }>;
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("K.I.N.G.S. OpenAI Gateway: base URL is required");
  }
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function toErrorMessage(response: OpenAiCompatibleGatewayHttpResponse): string {
  if (response.body && typeof response.body === "object") {
    const body = response.body as {
      error?: { message?: unknown };
      message?: unknown;
    };
    if (body.error && typeof body.error.message === "string") {
      return body.error.message;
    }
    if (typeof body.message === "string") return body.message;
  }
  return response.text || `HTTP ${response.status}`;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 ||
    status === 429 || status >= 500;
}

function looksLikeNonChatModel(modelId: string): boolean {
  const value = modelId.toLowerCase();
  return [
    "embedding", "embed-", "/embed", "rerank", "whisper",
    "tts", "speech", "audio", "music", "video", "image",
    "flux", "stable-diffusion", "dall-e",
  ].some((token) => value.includes(token));
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function firstReportedNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const number = nonNegativeNumber(value);
    if (number !== undefined) return number;
  }
  return undefined;
}

function parseToolCalls(
  response: OpenAiChatCompletionResponse,
): ModelToolCallProposal[] {
  const calls = response.choices?.[0]?.message?.tool_calls ?? [];
  return calls
    .map((call, index) => {
      const toolId = call.function?.name?.trim();
      if (!toolId) return undefined;
      let argumentsValue: Record<string, unknown> = {};
      const rawArguments = call.function?.arguments;
      if (rawArguments) {
        try {
          const parsed = JSON.parse(rawArguments) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            argumentsValue = parsed as Record<string, unknown>;
          }
        } catch {
          argumentsValue = { raw: rawArguments };
        }
      }
      return {
        id: call.id ?? `tool-call-${index + 1}`,
        toolId,
        arguments: argumentsValue,
      };
    })
    .filter((proposal): proposal is ModelToolCallProposal => proposal !== undefined);
}

export class FetchOpenAiCompatibleGatewayTransport
  implements OpenAiCompatibleGatewayTransport
{
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(
    baseUrl: string,
    apiKey?: string,
    private readonly requestTimeoutMs = 120_000,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey?.trim() || undefined;
  }

  async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<OpenAiCompatibleGatewayHttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (body !== undefined) headers["content-type"] = "application/json";
      if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
      const response = await fetch(
        `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
        {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        },
      );
      const text = await response.text();
      let parsed: unknown;
      if (text) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          parsed = undefined;
        }
      }
      return { status: response.status, body: parsed, text };
    } finally {
      clearTimeout(timeout);
    }
  }
}

class OpenAiCompatibleGatewayModel implements IntelligenceModel {
  readonly identity: ModelIdentity;

  constructor(
    private readonly gatewayId: ID,
    private readonly transport: OpenAiCompatibleGatewayTransport,
    definition: OpenAiCompatibleGatewayModelDefinition,
    providerKind: IntelligenceProviderKind,
  ) {
    this.identity = {
      providerId: gatewayId,
      modelId: definition.modelId,
      displayName: definition.displayName ?? `${gatewayId}: ${definition.modelId}`,
      providerKind,
      capabilities: [...definition.capabilities],
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      contextWindowTokens: definition.contextWindowTokens ?? 128_000,
      supportsToolCalling: definition.supportsToolCalling ?? true,
      supportsStructuredOutput: definition.supportsStructuredOutput ?? true,
      available: true,
    };
  }

  canHandle(request: ModelExecutionRequest): boolean {
    if (request.outputModality !== "text") return false;
    if (request.inputModalities.some(
      (modality) => !this.identity.inputModalities.includes(modality),
    )) return false;
    if (request.requireStructuredOutput && !this.identity.supportsStructuredOutput) {
      return false;
    }
    if (request.allowToolProposals && !this.identity.supportsToolCalling) return false;
    return request.requiredCapabilities.every(
      (capability) => this.identity.capabilities.includes(capability),
    );
  }

  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const startedAt = new Date();
    if (!this.canHandle(request)) {
      return this.failure(
        request,
        startedAt,
        "CAPABILITY_MISMATCH",
        "Configured gateway model cannot satisfy this request.",
        false,
      );
    }

    try {
      const response = await this.transport.request("POST", "/chat/completions", {
        model: this.identity.modelId,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        stream: false,
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        response_format: request.requireStructuredOutput
          ? { type: "json_object" }
          : undefined,
      });

      if (response.status < 200 || response.status >= 300) {
        return this.failure(
          request,
          startedAt,
          `GATEWAY_HTTP_${response.status}`,
          toErrorMessage(response),
          isRetryableStatus(response.status),
        );
      }
      if (!response.body || typeof response.body !== "object") {
        return this.failure(
          request,
          startedAt,
          "GATEWAY_INVALID_RESPONSE",
          "Gateway returned a non-JSON or empty response.",
          true,
        );
      }

      const payload = response.body as OpenAiChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        return this.failure(
          request,
          startedAt,
          "GATEWAY_MISSING_CONTENT",
          "Gateway response did not contain assistant text content.",
          true,
        );
      }

      const completedAt = new Date();
      const inputTokens = nonNegativeNumber(payload.usage?.prompt_tokens) ?? 0;
      const outputTokens = nonNegativeNumber(payload.usage?.completion_tokens) ?? 0;
      const reportedTotal = nonNegativeNumber(payload.usage?.total_tokens);
      const totalTokens = Math.max(
        inputTokens + outputTokens,
        reportedTotal ?? inputTokens + outputTokens,
      );
      const cachedTokens = firstReportedNumber(
        payload.usage?.prompt_tokens_details?.cached_tokens,
        payload.usage?.cached_tokens,
      );
      const savedTokens = firstReportedNumber(
        payload.usage?.saved_tokens,
        payload.usage?.tokens_saved,
        payload.compression?.saved_tokens,
        payload.compression?.tokens_saved,
      );
      const reportedCostUsd = firstReportedNumber(
        payload.usage?.cost_usd,
        payload.usage?.cost,
        payload.cost_usd,
        payload.cost,
      );

      return {
        success: true,
        response: {
          requestId: request.id,
          model: this.identity,
          content,
          toolCallProposals: request.allowToolProposals
            ? parseToolCalls(payload)
            : [],
          usage: {
            elapsedMs: completedAt.getTime() - startedAt.getTime(),
            tokensUsed: totalTokens,
            iterationsUsed: 1,
            estimatedCost: reportedCostUsd,
            inputTokens,
            outputTokens,
            cachedTokens,
            savedTokens,
            reportedCostUsd,
          },
          metadata: {
            requestId: request.id,
            providerRequestId: payload.id,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            latencyMs: completedAt.getTime() - startedAt.getTime(),
          },
        },
      };
    } catch (error) {
      return this.failure(
        request,
        startedAt,
        error instanceof Error && error.name === "AbortError"
          ? "GATEWAY_TIMEOUT"
          : "GATEWAY_TRANSPORT_ERROR",
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }

  private failure(
    request: ModelExecutionRequest,
    startedAt: Date,
    code: string,
    message: string,
    retryable: boolean,
  ): ModelExecutionResult {
    const completedAt = new Date();
    return {
      success: false,
      failure: {
        requestId: request.id,
        providerId: this.gatewayId,
        modelId: this.identity.modelId,
        retryable,
        code,
        message,
        metadata: {
          requestId: request.id,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          latencyMs: completedAt.getTime() - startedAt.getTime(),
        },
      },
    };
  }
}

export class OpenAiCompatibleGatewayAdapter implements ProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  readonly gatewayKind: OpenAiCompatibleGatewayKind;

  private readonly transport: OpenAiCompatibleGatewayTransport;
  private readonly models = new Map<ID, IntelligenceModel>();
  private readonly discoverModelsEnabled: boolean;
  private readonly allowDynamicModels: boolean;
  private readonly discoveredModelCapabilities: readonly IntelligenceCapability[];
  private remoteCatalog: string[] = [];

  constructor(
    config: OpenAiCompatibleGatewayConfig,
    transport?: OpenAiCompatibleGatewayTransport,
  ) {
    this.gatewayKind = config.gatewayKind;
    this.descriptor = {
      id: config.id,
      name: config.name,
      kind: config.providerKind ?? "external-routed",
      available: config.available ?? true,
    };
    this.discoverModelsEnabled = config.discoverModels ?? true;
    this.allowDynamicModels = config.allowDynamicModels ?? true;
    this.discoveredModelCapabilities =
      config.discoveredModelCapabilities ?? DEFAULT_GATEWAY_CODING_CAPABILITIES;
    this.transport = transport ?? new FetchOpenAiCompatibleGatewayTransport(
      config.baseUrl,
      config.apiKey,
      config.requestTimeoutMs,
    );

    for (const definition of config.models ?? []) {
      this.registerModel(definition);
    }
  }

  listModels(): readonly ModelIdentity[] {
    return Array.from(this.models.values())
      .map((model) => model.identity)
      .sort((left, right) => left.modelId.localeCompare(right.modelId));
  }

  listRemoteCatalog(): readonly string[] {
    return [...this.remoteCatalog];
  }

  getModel(modelId: ID): IntelligenceModel | undefined {
    return this.models.get(modelId);
  }

  async refreshModels(): Promise<OpenAiCompatibleGatewayHealth> {
    if (!this.discoverModelsEnabled) {
      return {
        ok: true,
        gatewayId: this.descriptor.id,
        gatewayKind: this.gatewayKind,
        models: this.listModels().map((model) => model.modelId),
        codingModels: this.listModels().map((model) => model.modelId),
        message: "Live model discovery is disabled; configured models are available.",
      };
    }

    try {
      const response = await this.transport.request("GET", "/models");
      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          gatewayId: this.descriptor.id,
          gatewayKind: this.gatewayKind,
          status: response.status,
          models: [],
          codingModels: [],
          message: toErrorMessage(response),
        };
      }

      const payload = response.body as OpenAiModelListResponse | undefined;
      const models = Array.from(new Set(
        (payload?.data ?? [])
          .map((model) => model.id?.trim())
          .filter((id): id is string => Boolean(id)),
      )).sort();
      this.remoteCatalog = models;

      const codingModels = models.filter((modelId) => !looksLikeNonChatModel(modelId));
      for (const modelId of codingModels) {
        if (!this.models.has(modelId)) {
          this.registerModel({
            modelId,
            capabilities: this.discoveredModelCapabilities,
          });
        }
      }

      return {
        ok: true,
        gatewayId: this.descriptor.id,
        gatewayKind: this.gatewayKind,
        status: response.status,
        models,
        codingModels,
        message:
          `Gateway reachable; ${models.length} total models discovered, ${codingModels.length} eligible for text/coding execution.`,
      };
    } catch (error) {
      return {
        ok: false,
        gatewayId: this.descriptor.id,
        gatewayKind: this.gatewayKind,
        models: [],
        codingModels: [],
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  execute(
    modelId: ID,
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    let model = this.models.get(modelId);
    if (!model && this.allowDynamicModels && !looksLikeNonChatModel(modelId)) {
      this.registerModel({
        modelId,
        capabilities: this.discoveredModelCapabilities,
      });
      model = this.models.get(modelId);
    }

    if (!model) {
      const now = new Date().toISOString();
      return Promise.resolve({
        success: false,
        failure: {
          requestId: request.id,
          providerId: this.descriptor.id,
          modelId,
          retryable: false,
          code: "MODEL_NOT_REGISTERED",
          message: `Model "${modelId}" is not available as a chat/coding model on gateway "${this.descriptor.id}".`,
          metadata: {
            requestId: request.id,
            startedAt: now,
            completedAt: now,
            latencyMs: 0,
          },
        },
      });
    }
    return model.execute(request);
  }

  health(): Promise<OpenAiCompatibleGatewayHealth> {
    return this.refreshModels();
  }

  private registerModel(definition: OpenAiCompatibleGatewayModelDefinition): void {
    if (this.models.has(definition.modelId)) return;
    const model = new OpenAiCompatibleGatewayModel(
      this.descriptor.id,
      this.transport,
      definition,
      this.descriptor.kind,
    );
    this.models.set(model.identity.modelId, model);
  }
}
