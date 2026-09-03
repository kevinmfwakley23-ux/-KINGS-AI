import type { ID } from "./types";
import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
  ModelToolCallProposal,
} from "./model-interface";
import type {
  ProviderAdapter,
  ProviderDescriptor,
} from "./provider-adapters";

export interface OpenAICompatibleHttpResult {
  status: number;
  body: unknown;
}

export interface OpenAICompatibleHttpTransport {
  post(
    url: string,
    headers: Readonly<Record<string, string>>,
    body: unknown,
    timeoutMs: number,
  ): Promise<OpenAICompatibleHttpResult>;
}

export interface OpenAICompatibleProviderConfig {
  providerId: ID;
  name: string;
  baseUrl: string;
  models: readonly ModelIdentity[];
  apiKey?: string;
  available?: boolean;
  requestTimeoutMs?: number;
  headers?: Readonly<Record<string, string>>;
  descriptorKind?: ProviderDescriptor["kind"];
}

export class FetchOpenAICompatibleTransport
  implements OpenAICompatibleHttpTransport {
  async post(
    url: string,
    headers: Readonly<Record<string, string>>,
    body: unknown,
    timeoutMs: number,
  ): Promise<OpenAICompatibleHttpResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed: unknown = undefined;

      if (text.length > 0) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          parsed = text;
        }
      }

      return {
        status: response.status,
        body: parsed,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

class OpenAICompatibleModel implements IntelligenceModel {
  constructor(
    readonly identity: ModelIdentity,
    private readonly executor: (
      identity: ModelIdentity,
      request: ModelExecutionRequest,
    ) => Promise<ModelExecutionResult>,
  ) {}

  canHandle(request: ModelExecutionRequest): boolean {
    return supportsRequest(this.identity, request);
  }

  execute(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    return this.executor(this.identity, request);
  }
}

export class OpenAICompatibleProviderAdapter implements ProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  private readonly models = new Map<ID, OpenAICompatibleModel>();
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly config: OpenAICompatibleProviderConfig,
    private readonly transport: OpenAICompatibleHttpTransport = new FetchOpenAICompatibleTransport(),
  ) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.requestTimeoutMs = config.requestTimeoutMs ?? 120_000;

    if (!Number.isFinite(this.requestTimeoutMs) || this.requestTimeoutMs < 1) {
      throw new Error("K.I.N.G.S. OpenAI-Compatible Provider: request timeout must be at least 1ms");
    }

    this.descriptor = {
      id: config.providerId,
      name: config.name,
      kind: config.descriptorKind ?? "external-paid",
      available: config.available ?? true,
    };

    for (const identity of config.models) {
      this.registerModel(identity);
    }
  }

  listModels(): readonly ModelIdentity[] {
    return Array.from(this.models.values())
      .map((model) => model.identity)
      .sort((left, right) => left.modelId.localeCompare(right.modelId));
  }

  getModel(modelId: ID): IntelligenceModel | undefined {
    return this.models.get(modelId);
  }

  async execute(
    modelId: ID,
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    const model = this.models.get(modelId);
    const startedAt = new Date();

    if (!this.descriptor.available) {
      return this.failure(
        request,
        modelId,
        startedAt,
        "OPENAI_COMPATIBLE_PROVIDER_UNAVAILABLE",
        `Provider "${this.descriptor.id}" is unavailable.`,
        true,
      );
    }

    if (!model) {
      return this.failure(
        request,
        modelId,
        startedAt,
        "OPENAI_COMPATIBLE_MODEL_NOT_REGISTERED",
        `Model "${modelId}" is not registered with provider "${this.descriptor.id}".`,
        false,
      );
    }

    if (!model.identity.available) {
      return this.failure(
        request,
        modelId,
        startedAt,
        "OPENAI_COMPATIBLE_MODEL_UNAVAILABLE",
        `Model "${modelId}" is unavailable.`,
        true,
      );
    }

    if (!model.canHandle(request)) {
      return this.failure(
        request,
        modelId,
        startedAt,
        "OPENAI_COMPATIBLE_CAPABILITY_MISMATCH",
        `Model "${modelId}" cannot satisfy the requested capabilities, modalities, or structured-output contract.`,
        false,
      );
    }

    if (request.inputModalities.some((modality) => modality !== "text")) {
      return this.failure(
        request,
        modelId,
        startedAt,
        "OPENAI_COMPATIBLE_MULTIMODAL_ENCODING_UNAVAILABLE",
        "The current K.I.N.G.S. ModelRequestMessage contract carries text content only; non-text inputs are blocked rather than silently discarded.",
        false,
      );
    }

    const body: Record<string, unknown> = {
      model: model.identity.modelId,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream: false,
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens;
    if (request.requireStructuredOutput) {
      body.response_format = { type: "json_object" };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.config.headers ?? {}),
    };

    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    let http: OpenAICompatibleHttpResult;
    try {
      http = await this.transport.post(
        `${this.baseUrl}/chat/completions`,
        headers,
        body,
        this.requestTimeoutMs,
      );
    } catch (error: unknown) {
      const code = isAbortError(error)
        ? "OPENAI_COMPATIBLE_TIMEOUT"
        : "OPENAI_COMPATIBLE_TRANSPORT_ERROR";
      return this.failure(
        request,
        modelId,
        startedAt,
        code,
        error instanceof Error ? error.message : String(error),
        true,
      );
    }

    if (http.status < 200 || http.status >= 300) {
      return this.failure(
        request,
        modelId,
        startedAt,
        `OPENAI_COMPATIBLE_HTTP_${http.status}`,
        extractProviderError(http.body) ?? `Provider returned HTTP ${http.status}.`,
        isRetryableStatus(http.status),
      );
    }

    return this.parseSuccess(model.identity, request, startedAt, http.body);
  }

  private registerModel(identity: ModelIdentity): void {
    if (identity.providerId !== this.config.providerId) {
      throw new Error(
        `K.I.N.G.S. OpenAI-Compatible Provider: model "${identity.modelId}" must use provider "${this.config.providerId}"`,
      );
    }
    if (this.models.has(identity.modelId)) {
      throw new Error(
        `K.I.N.G.S. OpenAI-Compatible Provider: duplicate model id "${identity.modelId}"`,
      );
    }

    this.models.set(
      identity.modelId,
      new OpenAICompatibleModel(
        identity,
        (_identity, request) => this.execute(identity.modelId, request),
      ),
    );
  }

  private parseSuccess(
    identity: ModelIdentity,
    request: ModelExecutionRequest,
    startedAt: Date,
    body: unknown,
  ): ModelExecutionResult {
    if (!body || typeof body !== "object") {
      return this.failure(
        request,
        identity.modelId,
        startedAt,
        "OPENAI_COMPATIBLE_INVALID_RESPONSE",
        "Provider returned a non-object success response.",
        true,
      );
    }

    const payload = body as {
      id?: unknown;
      choices?: unknown;
      usage?: unknown;
    };
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = choices[0];

    if (!first || typeof first !== "object") {
      return this.failure(
        request,
        identity.modelId,
        startedAt,
        "OPENAI_COMPATIBLE_MISSING_CHOICE",
        "Provider success response did not contain a completion choice.",
        true,
      );
    }

    const message = (first as { message?: unknown }).message;
    if (!message || typeof message !== "object") {
      return this.failure(
        request,
        identity.modelId,
        startedAt,
        "OPENAI_COMPATIBLE_MISSING_MESSAGE",
        "Provider completion choice did not contain a message.",
        true,
      );
    }

    const messageRecord = message as {
      content?: unknown;
      tool_calls?: unknown;
    };
    const content = extractContent(messageRecord.content);
    const toolCalls = this.parseToolCalls(messageRecord.tool_calls);

    if (!toolCalls.valid) {
      return this.failure(
        request,
        identity.modelId,
        startedAt,
        "OPENAI_COMPATIBLE_INVALID_TOOL_CALL",
        toolCalls.error ?? "Provider returned an invalid tool-call proposal.",
        true,
      );
    }

    if (content === undefined && toolCalls.proposals.length === 0) {
      return this.failure(
        request,
        identity.modelId,
        startedAt,
        "OPENAI_COMPATIBLE_EMPTY_RESPONSE",
        "Provider returned neither text content nor a tool-call proposal.",
        true,
      );
    }

    if (!request.allowToolProposals && toolCalls.proposals.length > 0) {
      return this.failure(
        request,
        identity.modelId,
        startedAt,
        "OPENAI_COMPATIBLE_UNAUTHORIZED_TOOL_PROPOSAL",
        "Provider returned tool-call proposals for a request that does not authorize tool proposals.",
        false,
      );
    }

    const usage = parseUsage(payload.usage);
    const completedAt = new Date();
    return {
      success: true,
      response: {
        requestId: request.id,
        model: identity,
        content: content ?? "",
        toolCallProposals: toolCalls.proposals,
        usage: {
          elapsedMs: completedAt.getTime() - startedAt.getTime(),
          tokensUsed: usage.totalTokens,
          iterationsUsed: 1,
          estimatedCost: usage.estimatedCost,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
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
  }

  private parseToolCalls(value: unknown): {
    valid: boolean;
    proposals: ModelToolCallProposal[];
    error?: string;
  } {
    if (value === undefined || value === null) {
      return { valid: true, proposals: [] };
    }
    if (!Array.isArray(value)) {
      return { valid: false, proposals: [], error: "tool_calls was not an array." };
    }

    const proposals: ModelToolCallProposal[] = [];
    for (const raw of value) {
      if (!raw || typeof raw !== "object") {
        return { valid: false, proposals: [], error: "A tool call was not an object." };
      }
      const call = raw as {
        id?: unknown;
        function?: unknown;
      };
      const fn = call.function;
      if (typeof call.id !== "string" || !fn || typeof fn !== "object") {
        return { valid: false, proposals: [], error: "A tool call was missing its id or function." };
      }
      const functionCall = fn as { name?: unknown; arguments?: unknown };
      if (typeof functionCall.name !== "string" || typeof functionCall.arguments !== "string") {
        return { valid: false, proposals: [], error: "A tool call was missing a function name or JSON argument string." };
      }

      let args: unknown;
      try {
        args = JSON.parse(functionCall.arguments) as unknown;
      } catch {
        return { valid: false, proposals: [], error: `Tool call "${call.id}" contained invalid JSON arguments.` };
      }
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        return { valid: false, proposals: [], error: `Tool call "${call.id}" arguments must decode to an object.` };
      }

      proposals.push({
        id: call.id,
        toolId: functionCall.name,
        arguments: args as Record<string, unknown>,
      });
    }

    return { valid: true, proposals };
  }

  private failure(
    request: ModelExecutionRequest,
    modelId: ID,
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
        providerId: this.descriptor.id,
        modelId,
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

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("K.I.N.G.S. OpenAI-Compatible Provider: baseUrl must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("K.I.N.G.S. OpenAI-Compatible Provider: baseUrl must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("K.I.N.G.S. OpenAI-Compatible Provider: credentials must not be embedded in baseUrl");
  }
  return value.replace(/\/+$/, "");
}

function supportsRequest(identity: ModelIdentity, request: ModelExecutionRequest): boolean {
  if (!identity.available) return false;
  if (!request.requiredCapabilities.every((capability) => identity.capabilities.includes(capability))) return false;
  if (!request.inputModalities.every((modality) => identity.inputModalities.includes(modality))) return false;
  if (!identity.outputModalities.includes(request.outputModality)) return false;
  if (request.requireStructuredOutput && !identity.supportsStructuredOutput) return false;
  return true;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function extractProviderError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return typeof body === "string" && body.length > 0 ? body : undefined;
  }
  const direct = (body as { message?: unknown }).message;
  if (typeof direct === "string") return direct;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const nested = (error as { message?: unknown }).message;
    if (typeof nested === "string") return nested;
  }
  return undefined;
}

function extractContent(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return value === null || value === undefined ? undefined : String(value);

  const parts: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const text = (item as { text?: unknown }).text;
    if (typeof text === "string") parts.push(text);
  }
  return parts.length > 0 ? parts.join("") : undefined;
}

function parseUsage(value: unknown): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost?: number;
} {
  if (!value || typeof value !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  const usage = value as {
    prompt_tokens?: unknown;
    input_tokens?: unknown;
    completion_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
    cost?: unknown;
  };
  const inputTokens = numberOrZero(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = numberOrZero(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = numberOrZero(usage.total_tokens) || (inputTokens + outputTokens);
  const estimatedCost = typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0
    ? usage.cost
    : undefined;
  return { inputTokens, outputTokens, totalTokens, estimatedCost };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
