import type {
  ID,
} from "./types";

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
  models: readonly OpenAiCompatibleGatewayModelDefinition[];
  requestTimeoutMs?: number;
  available?: boolean;
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
  message: string;
}

interface OpenAiChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface OpenAiModelListResponse {
  data?: Array<{
    id?: string;
  }>;
}

function normalizeBaseUrl(
  baseUrl: string,
): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error(
      "K.I.N.G.S. OpenAI Gateway: base URL is required",
    );
  }

  return normalized.endsWith("/v1")
    ? normalized
    : `${normalized}/v1`;
}

function toErrorMessage(
  response: OpenAiCompatibleGatewayHttpResponse,
): string {
  if (
    response.body &&
    typeof response.body === "object"
  ) {
    const body = response.body as {
      error?: {
        message?: unknown;
      };
      message?: unknown;
    };

    if (
      body.error &&
      typeof body.error.message === "string"
    ) {
      return body.error.message;
    }

    if (typeof body.message === "string") {
      return body.message;
    }
  }

  return response.text || `HTTP ${response.status}`;
}

function isRetryableStatus(
  status: number,
): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function parseToolCalls(
  response: OpenAiChatCompletionResponse,
): ModelToolCallProposal[] {
  const calls = response.choices?.[0]?.message?.tool_calls ?? [];

  return calls
    .map((call, index) => {
      const toolId = call.function?.name?.trim();
      if (!toolId) {
        return undefined;
      }

      let argumentsValue: Record<string, unknown> = {};
      const rawArguments = call.function?.arguments;

      if (rawArguments) {
        try {
          const parsed = JSON.parse(rawArguments) as unknown;
          if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
          ) {
            argumentsValue = parsed as Record<string, unknown>;
          }
        } catch {
          argumentsValue = {
            raw: rawArguments,
          };
        }
      }

      return {
        id: call.id ?? `tool-call-${index + 1}`,
        toolId,
        arguments: argumentsValue,
      };
    })
    .filter(
      (
        proposal,
      ): proposal is ModelToolCallProposal =>
        proposal !== undefined,
    );
}

export class FetchOpenAiCompatibleGatewayTransport
  implements OpenAiCompatibleGatewayTransport
{
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly requestTimeoutMs: number;

  constructor(
    baseUrl: string,
    apiKey?: string,
    requestTimeoutMs = 120_000,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey?.trim() || undefined;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<OpenAiCompatibleGatewayHttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    try {
      const headers: Record<string, string> = {
        accept: "application/json",
      };

      if (body !== undefined) {
        headers["content-type"] = "application/json";
      }

      if (this.apiKey) {
        headers.authorization = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(
        `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
        {
          method,
          headers,
          body:
            body === undefined
              ? undefined
              : JSON.stringify(body),
          signal: controller.signal,
        },
      );

      const text = await response.text();
      let parsed: unknown = undefined;

      if (text) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          parsed = undefined;
        }
      }

      return {
        status: response.status,
        body: parsed,
        text,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

class OpenAiCompatibleGatewayModel
  implements IntelligenceModel
{
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
      displayName:
        definition.displayName ??
        `${gatewayId}: ${definition.modelId}`,
      providerKind,
      capabilities: [
        ...definition.capabilities,
      ],
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      contextWindowTokens:
        definition.contextWindowTokens ?? 128_000,
      supportsToolCalling:
        definition.supportsToolCalling ?? true,
      supportsStructuredOutput:
        definition.supportsStructuredOutput ?? true,
      available: true,
    };
  }

  canHandle(
    request: ModelExecutionRequest,
  ): boolean {
    if (
      request.outputModality !== "text" ||
      request.inputModalities.some(
        (modality) =>
          !this.identity.inputModalities.includes(
            modality,
          ),
      )
    ) {
      return false;
    }

    if (
      request.requireStructuredOutput &&
      !this.identity.supportsStructuredOutput
    ) {
      return false;
    }

    if (
      request.allowToolProposals &&
      !this.identity.supportsToolCalling
    ) {
      return false;
    }

    return request.requiredCapabilities.every(
      (capability) =>
        this.identity.capabilities.includes(
          capability,
        ),
    );
  }

  async execute(
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
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
      const response = await this.transport.request(
        "POST",
        "/chat/completions",
        {
          model: this.identity.modelId,
          messages: request.messages.map(
            (message) => ({
              role: message.role,
              content: message.content,
            }),
          ),
          stream: false,
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
          response_format:
            request.requireStructuredOutput
              ? { type: "json_object" }
              : undefined,
        },
      );

      if (
        response.status < 200 ||
        response.status >= 300
      ) {
        return this.failure(
          request,
          startedAt,
          `GATEWAY_HTTP_${response.status}`,
          toErrorMessage(response),
          isRetryableStatus(response.status),
        );
      }

      if (
        !response.body ||
        typeof response.body !== "object"
      ) {
        return this.failure(
          request,
          startedAt,
          "GATEWAY_INVALID_RESPONSE",
          "Gateway returned a non-JSON or empty response.",
          true,
        );
      }

      const payload =
        response.body as OpenAiChatCompletionResponse;
      const content =
        payload.choices?.[0]?.message?.content;

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
      const inputTokens =
        payload.usage?.prompt_tokens ?? 0;
      const outputTokens =
        payload.usage?.completion_tokens ?? 0;
      const totalTokens =
        payload.usage?.total_tokens ??
        inputTokens + outputTokens;

      return {
        success: true,
        response: {
          requestId: request.id,
          model: this.identity,
          content,
          toolCallProposals:
            request.allowToolProposals
              ? parseToolCalls(payload)
              : [],
          usage: {
            elapsedMs:
              completedAt.getTime() -
              startedAt.getTime(),
            tokensUsed: totalTokens,
            iterationsUsed: 1,
            inputTokens,
            outputTokens,
          },
          metadata: {
            requestId: request.id,
            providerRequestId: payload.id,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            latencyMs:
              completedAt.getTime() -
              startedAt.getTime(),
          },
        },
      };
    } catch (error) {
      return this.failure(
        request,
        startedAt,
        error instanceof Error &&
        error.name === "AbortError"
          ? "GATEWAY_TIMEOUT"
          : "GATEWAY_TRANSPORT_ERROR",
        error instanceof Error
          ? error.message
          : String(error),
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
          latencyMs:
            completedAt.getTime() -
            startedAt.getTime(),
        },
      },
    };
  }
}

export class OpenAiCompatibleGatewayAdapter
  implements ProviderAdapter
{
  readonly descriptor: ProviderDescriptor;
  readonly gatewayKind: OpenAiCompatibleGatewayKind;

  private readonly transport: OpenAiCompatibleGatewayTransport;
  private readonly models =
    new Map<ID, IntelligenceModel>();

  constructor(
    config: OpenAiCompatibleGatewayConfig,
    transport?: OpenAiCompatibleGatewayTransport,
  ) {
    if (config.models.length === 0) {
      throw new Error(
        `K.I.N.G.S. OpenAI Gateway: provider "${config.id}" requires at least one configured model`,
      );
    }

    this.gatewayKind = config.gatewayKind;
    this.descriptor = {
      id: config.id,
      name: config.name,
      kind: config.providerKind ?? "external-free",
      available: config.available ?? true,
    };

    this.transport =
      transport ??
      new FetchOpenAiCompatibleGatewayTransport(
        config.baseUrl,
        config.apiKey,
        config.requestTimeoutMs,
      );

    for (const definition of config.models) {
      if (this.models.has(definition.modelId)) {
        throw new Error(
          `K.I.N.G.S. OpenAI Gateway: duplicate model "${definition.modelId}" for provider "${config.id}"`,
        );
      }

      const model = new OpenAiCompatibleGatewayModel(
        config.id,
        this.transport,
        definition,
        this.descriptor.kind,
      );
      this.models.set(model.identity.modelId, model);
    }
  }

  listModels(): readonly ModelIdentity[] {
    return Array.from(this.models.values())
      .map((model) => model.identity)
      .sort(
        (left, right) =>
          left.modelId.localeCompare(right.modelId),
      );
  }

  getModel(
    modelId: ID,
  ): IntelligenceModel | undefined {
    return this.models.get(modelId);
  }

  execute(
    modelId: ID,
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    const model = this.models.get(modelId);

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
          message:
            `Model "${modelId}" is not registered with gateway "${this.descriptor.id}".`,
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

  async health(): Promise<OpenAiCompatibleGatewayHealth> {
    try {
      const response = await this.transport.request(
        "GET",
        "/models",
      );

      if (
        response.status < 200 ||
        response.status >= 300
      ) {
        return {
          ok: false,
          gatewayId: this.descriptor.id,
          gatewayKind: this.gatewayKind,
          status: response.status,
          models: [],
          message: toErrorMessage(response),
        };
      }

      const payload =
        response.body as OpenAiModelListResponse | undefined;
      const models = (payload?.data ?? [])
        .map((model) => model.id?.trim())
        .filter((id): id is string => Boolean(id))
        .sort();

      return {
        ok: true,
        gatewayId: this.descriptor.id,
        gatewayKind: this.gatewayKind,
        status: response.status,
        models,
        message:
          `Gateway reachable; ${models.length} model${models.length === 1 ? "" : "s"} reported.`,
      };
    } catch (error) {
      return {
        ok: false,
        gatewayId: this.descriptor.id,
        gatewayKind: this.gatewayKind,
        models: [],
        message:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }
}
