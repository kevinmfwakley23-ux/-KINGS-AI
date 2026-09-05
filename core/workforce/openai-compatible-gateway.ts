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

export interface OpenAICompatibleGatewayConfig {
  providerId: ID;
  name: string;
  baseUrl: string;
  apiKey?: string;
  providerKind?: IntelligenceProviderKind;
  models: readonly OpenAICompatibleModelConfig[];
  extraHeaders?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

export interface OpenAICompatibleModelConfig {
  id: ID;
  displayName?: string;
  capabilities?: readonly IntelligenceCapability[];
  contextWindowTokens?: number;
  supportsToolCalling?: boolean;
  supportsStructuredOutput?: boolean;
  available?: boolean;
}

interface ChatCompletionPayload {
  id?: unknown;
  choices?: unknown;
  usage?: unknown;
  error?: unknown;
}

function normalizedBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("K.I.N.G.S. Gateway: baseUrl must use http or https");
  }
  return trimmed;
}

function renderPrivateBaseUrl(hostport: string | undefined): string | undefined {
  const value = hostport?.trim();
  if (!value) return undefined;
  if (value.includes("://") || value.includes("/") || /\s/.test(value)) {
    throw new Error("K.I.N.G.S. Gateway: private hostport must use host:port format");
  }
  return `http://${value}/v1`;
}

function failure(
  request: ModelExecutionRequest,
  model: ModelIdentity,
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
      providerId: model.providerId,
      modelId: model.modelId,
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

class OpenAICompatibleModel implements IntelligenceModel {
  constructor(
    readonly identity: ModelIdentity,
    private readonly run: (request: ModelExecutionRequest) => Promise<ModelExecutionResult>,
  ) {}

  canHandle(request: ModelExecutionRequest): boolean {
    if (!this.identity.available) return false;
    if (!request.requiredCapabilities.every((capability) =>
      this.identity.capabilities.includes(capability))) return false;
    if (!request.inputModalities.every((modality) =>
      this.identity.inputModalities.includes(modality))) return false;
    if (!this.identity.outputModalities.includes(request.outputModality)) return false;
    if (request.requireStructuredOutput && !this.identity.supportsStructuredOutput) return false;
    if (request.allowToolProposals && !this.identity.supportsToolCalling) {
      // Tool proposals are optional at this boundary; a model may still answer normally.
    }
    return true;
  }

  execute(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    if (!this.canHandle(request)) {
      const startedAt = new Date();
      return Promise.resolve(failure(
        request, this.identity, startedAt,
        "GATEWAY_MODEL_CAPABILITY_MISMATCH",
        `Model "${this.identity.modelId}" cannot satisfy the request.`,
        false,
      ));
    }
    return this.run(request);
  }
}

/**
 * Provider-neutral adapter for OpenAI-compatible gateways such as OmniRoute
 * and 9Router. It intentionally leaves provider-side routing/caching/fallback
 * intact by sending the configured virtual model id unchanged.
 */
export class OpenAICompatibleGatewayAdapter implements ProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly extraHeaders: Readonly<Record<string, string>>;
  private readonly timeoutMs: number;
  private readonly models = new Map<ID, OpenAICompatibleModel>();

  constructor(config: OpenAICompatibleGatewayConfig) {
    if (!config.providerId.trim()) throw new Error("K.I.N.G.S. Gateway: providerId is required");
    if (!config.name.trim()) throw new Error("K.I.N.G.S. Gateway: name is required");
    this.baseUrl = normalizedBaseUrl(config.baseUrl);
    this.apiKey = config.apiKey?.trim() || undefined;
    this.extraHeaders = { ...(config.extraHeaders ?? {}) };
    this.timeoutMs = config.timeoutMs ?? 60_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1) {
      throw new Error("K.I.N.G.S. Gateway: timeoutMs must be positive");
    }
    this.descriptor = {
      id: config.providerId,
      name: config.name,
      kind: config.providerKind ?? "external-free",
      available: config.models.some((model) => model.available !== false),
    };

    for (const model of config.models) {
      if (!model.id.trim()) throw new Error("K.I.N.G.S. Gateway: model id is required");
      if (this.models.has(model.id)) {
        throw new Error(`K.I.N.G.S. Gateway: duplicate model "${model.id}"`);
      }
      const identity: ModelIdentity = {
        providerId: config.providerId,
        modelId: model.id,
        displayName: model.displayName ?? `${config.name}: ${model.id}`,
        providerKind: config.providerKind ?? "external-free",
        capabilities: model.capabilities ?? [
          "reasoning", "planning", "coding", "debugging", "research",
          "web-learning", "source-inspection", "tool-use", "structured-output",
          "long-context", "verification", "recovery",
        ],
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindowTokens: model.contextWindowTokens ?? 128_000,
        supportsToolCalling: model.supportsToolCalling ?? true,
        supportsStructuredOutput: model.supportsStructuredOutput ?? true,
        available: model.available ?? true,
      };
      this.models.set(model.id, new OpenAICompatibleModel(
        identity,
        (request) => this.executeHttp(identity, request),
      ));
    }
  }

  listModels(): readonly ModelIdentity[] {
    return [...this.models.values()].map((model) => model.identity)
      .sort((a, b) => a.modelId.localeCompare(b.modelId));
  }

  getModel(modelId: ID): IntelligenceModel | undefined {
    return this.models.get(modelId);
  }

  execute(modelId: ID, request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const model = this.models.get(modelId);
    if (!model) {
      const identity: ModelIdentity = {
        providerId: this.descriptor.id, modelId,
        displayName: modelId, providerKind: this.descriptor.kind,
        capabilities: [], inputModalities: ["text"], outputModalities: ["text"],
        contextWindowTokens: 1, supportsToolCalling: false,
        supportsStructuredOutput: false, available: false,
      };
      return Promise.resolve(failure(
        request, identity, new Date(), "GATEWAY_MODEL_NOT_REGISTERED",
        `Model "${modelId}" is not registered for ${this.descriptor.name}.`, false,
      ));
    }
    return model.execute(request);
  }

  private async executeHttp(
    model: ModelIdentity,
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    const startedAt = new Date();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...this.extraHeaders,
      };
      if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: model.modelId,
          messages: request.messages,
          stream: false,
          ...(request.maxOutputTokens !== undefined
            ? { max_tokens: request.maxOutputTokens } : {}),
          ...(request.temperature !== undefined
            ? { temperature: request.temperature } : {}),
          ...(request.requireStructuredOutput
            ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      const raw = await response.text();
      let payload: ChatCompletionPayload;
      try {
        payload = JSON.parse(raw) as ChatCompletionPayload;
      } catch {
        return failure(request, model, startedAt, "GATEWAY_INVALID_JSON",
          `Gateway returned invalid JSON (HTTP ${response.status}).`, response.status >= 500);
      }
      if (!response.ok) {
        const errorObject = payload.error && typeof payload.error === "object"
          ? payload.error as { message?: unknown } : undefined;
        const message = typeof errorObject?.message === "string"
          ? errorObject.message : `Gateway request failed with HTTP ${response.status}.`;
        return failure(request, model, startedAt, "GATEWAY_HTTP_ERROR",
          message, response.status === 408 || response.status === 429 || response.status >= 500);
      }

      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const first = choices[0] as { message?: { content?: unknown; tool_calls?: unknown } } | undefined;
      const content = first?.message?.content;
      if (typeof content !== "string") {
        return failure(request, model, startedAt, "GATEWAY_MISSING_CONTENT",
          "Gateway response did not contain assistant text.", false);
      }

      const usage = payload.usage && typeof payload.usage === "object"
        ? payload.usage as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown }
        : {};
      const inputTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
      const outputTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
      const totalTokens = typeof usage.total_tokens === "number"
        ? usage.total_tokens : inputTokens + outputTokens;
      const completedAt = new Date();

      return {
        success: true,
        response: {
          requestId: request.id,
          model,
          content,
          toolCallProposals: this.parseToolCalls(first?.message?.tool_calls),
          usage: {
            elapsedMs: completedAt.getTime() - startedAt.getTime(),
            tokensUsed: totalTokens,
            iterationsUsed: 1,
            inputTokens,
            outputTokens,
            estimatedCost: 0,
          },
          metadata: {
            requestId: request.id,
            providerRequestId: typeof payload.id === "string" ? payload.id : undefined,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            latencyMs: completedAt.getTime() - startedAt.getTime(),
          },
        },
      };
    } catch (error) {
      const timeout = error instanceof Error && error.name === "AbortError";
      return failure(
        request, model, startedAt,
        timeout ? "GATEWAY_TIMEOUT" : "GATEWAY_TRANSPORT_ERROR",
        timeout ? `Gateway request exceeded ${this.timeoutMs}ms.`
          : error instanceof Error ? error.message : String(error),
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private parseToolCalls(value: unknown): readonly ModelToolCallProposal[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const call = item as {
        id?: unknown;
        function?: { name?: unknown; arguments?: unknown };
      };
      if (typeof call.function?.name !== "string") return [];
      let args: Record<string, unknown> = {};
      if (typeof call.function.arguments === "string") {
        try {
          const parsed = JSON.parse(call.function.arguments) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
          args = { raw: call.function.arguments };
        }
      }
      return [{
        id: typeof call.id === "string" ? call.id : `tool-${index}`,
        toolId: call.function.name,
        arguments: args,
      }];
    });
  }
}

function csv(value: string | undefined, fallback: readonly string[]): string[] {
  const models = value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  return models.length ? models : [...fallback];
}

export function createOmniRouteAdapter(
  env: NodeJS.ProcessEnv = process.env,
): OpenAICompatibleGatewayAdapter {
  return new OpenAICompatibleGatewayAdapter({
    providerId: "omniroute",
    name: "OmniRoute",
    baseUrl: env.KINGS_OMNIROUTE_BASE_URL ?? renderPrivateBaseUrl(env.KINGS_OMNIROUTE_HOSTPORT) ?? "http://127.0.0.1:20128/v1",
    apiKey: env.KINGS_OMNIROUTE_API_KEY,
    models: csv(env.KINGS_OMNIROUTE_MODELS, ["auto/coding", "auto/cheap"]).map((id) => ({ id })),
    extraHeaders: env.KINGS_OMNIROUTE_NO_CACHE === "true"
      ? { "X-OmniRoute-No-Cache": "true" } : undefined,
  });
}

export function createNineRouterAdapter(
  env: NodeJS.ProcessEnv = process.env,
): OpenAICompatibleGatewayAdapter {
  return new OpenAICompatibleGatewayAdapter({
    providerId: "9router",
    name: "9Router",
    baseUrl: env.KINGS_9ROUTER_BASE_URL ?? renderPrivateBaseUrl(env.KINGS_9ROUTER_HOSTPORT) ?? "http://127.0.0.1:20128/v1",
    apiKey: env.KINGS_9ROUTER_API_KEY,
    models: csv(env.KINGS_9ROUTER_MODELS, ["auto"]).map((id) => ({ id })),
  });
}

export function createConfiguredGatewayAdapters(
  env: NodeJS.ProcessEnv = process.env,
): OpenAICompatibleGatewayAdapter[] {
  const adapters: OpenAICompatibleGatewayAdapter[] = [];
  const omniConfigured = Boolean(
    env.KINGS_OMNIROUTE_BASE_URL?.trim() ||
    env.KINGS_OMNIROUTE_HOSTPORT?.trim() ||
    env.KINGS_OMNIROUTE_MODELS?.trim(),
  );
  const nineConfigured = Boolean(
    env.KINGS_9ROUTER_BASE_URL?.trim() ||
    env.KINGS_9ROUTER_HOSTPORT?.trim() ||
    env.KINGS_9ROUTER_MODELS?.trim(),
  );

  if (omniConfigured) adapters.push(createOmniRouteAdapter(env));
  if (nineConfigured) adapters.push(createNineRouterAdapter(env));
  return adapters;
}
