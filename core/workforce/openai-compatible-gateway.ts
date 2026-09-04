import { createHash } from "node:crypto";
import type { ID } from "./types";
import type {
  IntelligenceCapability,
  IntelligenceModality,
  IntelligenceModel,
  IntelligenceProviderKind,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
  ModelRequestMessage,
  ModelToolCallProposal,
  ModelToolDefinition,
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

export type GatewayModelMetadataSource =
  | "configured"
  | "gateway-reported";

export type GatewayModelOrigin =
  | "configured"
  | "discovered"
  | "dynamic";

export interface GatewayModelMetadataProvenance {
  inputModalities?: GatewayModelMetadataSource;
  contextWindowTokens?: GatewayModelMetadataSource;
  supportsToolCalling?: GatewayModelMetadataSource;
  supportsStructuredOutput?: GatewayModelMetadataSource;
}

export interface OpenAiCompatibleGatewayModelDefinition {
  modelId: ID;
  displayName?: string;
  capabilities: readonly IntelligenceCapability[];
  inputModalities?: readonly IntelligenceModality[];
  contextWindowTokens?: number;
  supportsToolCalling?: boolean;
  supportsStructuredOutput?: boolean;
  /**
   * Field-level evidence for capability metadata. Values without provenance are
   * intentionally treated as unverified hints and are not trusted by execution.
   */
  metadataProvenance?: GatewayModelMetadataProvenance;
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

export interface GatewayModelMetadataField<T> {
  value: T | null;
  source: GatewayModelMetadataSource | "unknown";
}

export interface OpenAiCompatibleGatewayModelMetadata {
  modelId: ID;
  origin: GatewayModelOrigin;
  inputModalities: GatewayModelMetadataField<readonly IntelligenceModality[]>;
  contextWindowTokens: GatewayModelMetadataField<number>;
  supportsToolCalling: GatewayModelMetadataField<boolean>;
  supportsStructuredOutput: GatewayModelMetadataField<boolean>;
}

interface OpenAiChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
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

interface OpenAiModelListEntry {
  id?: string;
  kind?: string;
  owned_by?: string;
  context_length?: unknown;
  supported_parameters?: unknown;
  architecture?: {
    input_modalities?: unknown;
  };
}

interface OpenAiModelListResponse {
  data?: OpenAiModelListEntry[];
}

interface ToolAliasMaps {
  internalToProvider: Map<string, string>;
  providerToInternal: Map<string, string>;
  providerTools: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
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

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
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

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeModalities(value: unknown): IntelligenceModality[] | undefined {
  const values = stringArray(value);
  if (!values) return undefined;
  const allowed = new Set<IntelligenceModality>(["text", "image", "audio", "video"]);
  const modalities = Array.from(new Set(
    values.filter((entry): entry is IntelligenceModality =>
      allowed.has(entry as IntelligenceModality)
    ),
  ));
  return modalities.length > 0 ? modalities : undefined;
}

function trustedSource(
  provenance: GatewayModelMetadataProvenance | undefined,
  field: keyof GatewayModelMetadataProvenance,
): GatewayModelMetadataSource | undefined {
  return provenance?.[field];
}

function normalizeDefinition(
  definition: OpenAiCompatibleGatewayModelDefinition,
): OpenAiCompatibleGatewayModelDefinition {
  const provenance = definition.metadataProvenance ?? {};
  const inputModalities = trustedSource(provenance, "inputModalities")
    ? normalizeModalities(definition.inputModalities)
    : undefined;
  const contextWindowTokens = trustedSource(provenance, "contextWindowTokens")
    ? positiveInteger(definition.contextWindowTokens)
    : undefined;
  const supportsToolCalling = trustedSource(provenance, "supportsToolCalling") &&
      typeof definition.supportsToolCalling === "boolean"
    ? definition.supportsToolCalling
    : undefined;
  const supportsStructuredOutput =
    trustedSource(provenance, "supportsStructuredOutput") &&
      typeof definition.supportsStructuredOutput === "boolean"
      ? definition.supportsStructuredOutput
      : undefined;

  const normalizedProvenance: GatewayModelMetadataProvenance = {};
  if (inputModalities) {
    normalizedProvenance.inputModalities = provenance.inputModalities;
  }
  if (contextWindowTokens !== undefined) {
    normalizedProvenance.contextWindowTokens = provenance.contextWindowTokens;
  }
  if (supportsToolCalling !== undefined) {
    normalizedProvenance.supportsToolCalling = provenance.supportsToolCalling;
  }
  if (supportsStructuredOutput !== undefined) {
    normalizedProvenance.supportsStructuredOutput =
      provenance.supportsStructuredOutput;
  }

  return {
    modelId: definition.modelId,
    displayName: definition.displayName,
    capabilities: [...definition.capabilities],
    inputModalities,
    contextWindowTokens,
    supportsToolCalling,
    supportsStructuredOutput,
    metadataProvenance: normalizedProvenance,
  };
}

function mergeDefinitions(
  existing: OpenAiCompatibleGatewayModelDefinition,
  incoming: OpenAiCompatibleGatewayModelDefinition,
): OpenAiCompatibleGatewayModelDefinition {
  const incomingProvenance = incoming.metadataProvenance ?? {};
  return normalizeDefinition({
    modelId: existing.modelId,
    displayName: existing.displayName ?? incoming.displayName,
    capabilities: existing.capabilities,
    inputModalities: incomingProvenance.inputModalities
      ? incoming.inputModalities
      : existing.inputModalities,
    contextWindowTokens: incomingProvenance.contextWindowTokens
      ? incoming.contextWindowTokens
      : existing.contextWindowTokens,
    supportsToolCalling: incomingProvenance.supportsToolCalling
      ? incoming.supportsToolCalling
      : existing.supportsToolCalling,
    supportsStructuredOutput: incomingProvenance.supportsStructuredOutput
      ? incoming.supportsStructuredOutput
      : existing.supportsStructuredOutput,
    metadataProvenance: {
      ...(existing.metadataProvenance ?? {}),
      ...incomingProvenance,
    },
  });
}

function discoveredDefinition(
  entry: OpenAiModelListEntry,
  capabilities: readonly IntelligenceCapability[],
): OpenAiCompatibleGatewayModelDefinition | undefined {
  const modelId = entry.id?.trim();
  if (!modelId) return undefined;

  const contextWindowTokens = positiveInteger(entry.context_length);
  const supportedParameters = stringArray(entry.supported_parameters);
  const inputModalities = normalizeModalities(entry.architecture?.input_modalities);
  const provenance: GatewayModelMetadataProvenance = {};

  if (contextWindowTokens !== undefined) {
    provenance.contextWindowTokens = "gateway-reported";
  }
  if (supportedParameters !== undefined) {
    provenance.supportsToolCalling = "gateway-reported";
    provenance.supportsStructuredOutput = "gateway-reported";
  }
  if (inputModalities !== undefined) {
    provenance.inputModalities = "gateway-reported";
  }

  const supportsToolCalling = supportedParameters === undefined
    ? undefined
    : supportedParameters.some((parameter) =>
      ["tools", "tool_choice", "parallel_tool_calls"].includes(parameter)
    );
  const supportsStructuredOutput = supportedParameters === undefined
    ? undefined
    : supportedParameters.some((parameter) =>
      ["response_format", "structured_outputs", "json_schema"].includes(parameter)
    );

  return normalizeDefinition({
    modelId,
    capabilities,
    inputModalities,
    contextWindowTokens,
    supportsToolCalling,
    supportsStructuredOutput,
    metadataProvenance: provenance,
  });
}

function metadataForDefinition(
  definition: OpenAiCompatibleGatewayModelDefinition,
  origin: GatewayModelOrigin,
): OpenAiCompatibleGatewayModelMetadata {
  const provenance = definition.metadataProvenance ?? {};
  return {
    modelId: definition.modelId,
    origin,
    inputModalities: {
      value: definition.inputModalities ? [...definition.inputModalities] : null,
      source: provenance.inputModalities ?? "unknown",
    },
    contextWindowTokens: {
      value: definition.contextWindowTokens ?? null,
      source: provenance.contextWindowTokens ?? "unknown",
    },
    supportsToolCalling: {
      value: definition.supportsToolCalling ?? null,
      source: provenance.supportsToolCalling ?? "unknown",
    },
    supportsStructuredOutput: {
      value: definition.supportsStructuredOutput ?? null,
      source: provenance.supportsStructuredOutput ?? "unknown",
    },
  };
}

function providerToolName(toolId: string): string {
  if (/^[A-Za-z0-9_-]{1,64}$/.test(toolId)) return toolId;
  const safe = toolId
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 38) || "tool";
  const digest = createHash("sha256")
    .update(toolId)
    .digest("hex")
    .slice(0, 12);
  return `kings_${safe}_${digest}`.slice(0, 64);
}

function validateToolDefinition(definition: ModelToolDefinition): void {
  if (!definition.toolId.trim()) {
    throw new Error("tool id cannot be empty");
  }
  if (!definition.description.trim()) {
    throw new Error(`tool "${definition.toolId}" requires a description`);
  }
  if (
    !definition.inputSchema ||
    typeof definition.inputSchema !== "object" ||
    Array.isArray(definition.inputSchema)
  ) {
    throw new Error(`tool "${definition.toolId}" requires an object JSON Schema`);
  }
}

function buildToolAliasMaps(request: ModelExecutionRequest): ToolAliasMaps {
  const internalToProvider = new Map<string, string>();
  const providerToInternal = new Map<string, string>();
  const providerTools: ToolAliasMaps["providerTools"] = [];

  if (!request.allowToolProposals) {
    return { internalToProvider, providerToInternal, providerTools };
  }

  for (const definition of request.toolDefinitions ?? []) {
    validateToolDefinition(definition);
    if (internalToProvider.has(definition.toolId)) {
      throw new Error(`duplicate tool definition "${definition.toolId}"`);
    }
    const providerName = providerToolName(definition.toolId);
    const collision = providerToInternal.get(providerName);
    if (collision && collision !== definition.toolId) {
      throw new Error(
        `provider tool alias collision between "${collision}" and "${definition.toolId}"`,
      );
    }
    internalToProvider.set(definition.toolId, providerName);
    providerToInternal.set(providerName, definition.toolId);
    providerTools.push({
      type: "function",
      function: {
        name: providerName,
        description: definition.description,
        parameters: { ...definition.inputSchema },
      },
    });
  }

  return { internalToProvider, providerToInternal, providerTools };
}

function providerToolCall(
  proposal: ModelToolCallProposal,
  aliases: ToolAliasMaps,
) {
  const providerName =
    aliases.internalToProvider.get(proposal.toolId) ??
    providerToolName(proposal.toolId);
  return {
    id: proposal.id,
    type: "function" as const,
    function: {
      name: providerName,
      arguments: JSON.stringify(proposal.arguments),
    },
  };
}

function providerMessage(
  message: ModelRequestMessage,
  aliases: ToolAliasMaps,
): Record<string, unknown> {
  if (message.role === "tool") {
    if (!message.toolCallId?.trim()) {
      throw new Error("tool result message requires toolCallId");
    }
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
    };
  }

  if (message.role === "assistant" && (message.toolCalls?.length ?? 0) > 0) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls?.map((proposal) =>
        providerToolCall(proposal, aliases)
      ),
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function parseToolCalls(
  response: OpenAiChatCompletionResponse,
  aliases: ToolAliasMaps,
): ModelToolCallProposal[] {
  const calls = response.choices?.[0]?.message?.tool_calls ?? [];
  return calls
    .map<ModelToolCallProposal | undefined>((call, index) => {
      const providerName = call.function?.name?.trim();
      if (!providerName) return undefined;
      const toolId = aliases.providerToInternal.get(providerName) ?? providerName;
      let argumentsValue: Record<string, unknown> = {};
      let argumentParseError: string | undefined;
      const rawArguments = call.function?.arguments;
      if (rawArguments) {
        try {
          const parsed = JSON.parse(rawArguments) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            argumentsValue = parsed as Record<string, unknown>;
          } else {
            argumentParseError = "Tool arguments JSON must decode to an object.";
          }
        } catch (error) {
          argumentParseError = error instanceof Error
            ? `Tool arguments are invalid JSON: ${error.message}`
            : "Tool arguments are invalid JSON.";
        }
      }
      const proposal: ModelToolCallProposal = {
        id: call.id ?? `tool-call-${index + 1}`,
        toolId,
        arguments: argumentsValue,
      };
      if (argumentParseError) {
        proposal.argumentParseError = argumentParseError;
      }
      return proposal;
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
      inputModalities: definition.inputModalities ?? ["text"],
      outputModalities: ["text"],
      contextWindowTokens: definition.contextWindowTokens ?? 0,
      supportsToolCalling: definition.supportsToolCalling ?? false,
      supportsStructuredOutput: definition.supportsStructuredOutput ?? false,
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

    let aliases: ToolAliasMaps;
    let requestBody: Record<string, unknown>;
    try {
      aliases = buildToolAliasMaps(request);
      requestBody = {
        model: this.identity.modelId,
        messages: request.messages.map((message) => providerMessage(message, aliases)),
        stream: false,
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        response_format: request.requireStructuredOutput
          ? { type: "json_object" }
          : undefined,
        ...(aliases.providerTools.length > 0
          ? {
              tools: aliases.providerTools,
              tool_choice: "auto",
              parallel_tool_calls: request.parallelToolCalls ?? false,
            }
          : {}),
      };
    } catch (error) {
      return this.failure(
        request,
        startedAt,
        "GATEWAY_INVALID_REQUEST",
        error instanceof Error ? error.message : String(error),
        false,
      );
    }

    try {
      const response = await this.transport.request(
        "POST",
        "/chat/completions",
        requestBody,
      );

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
      const toolCallProposals = request.allowToolProposals
        ? parseToolCalls(payload, aliases)
        : [];
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" && toolCallProposals.length === 0) {
        return this.failure(
          request,
          startedAt,
          "GATEWAY_MISSING_CONTENT",
          "Gateway response contained neither assistant text nor a tool call.",
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
          content: typeof content === "string" ? content : "",
          toolCallProposals,
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
  private readonly modelDefinitions = new Map<ID, OpenAiCompatibleGatewayModelDefinition>();
  private readonly modelMetadata = new Map<ID, OpenAiCompatibleGatewayModelMetadata>();
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
      this.registerModel(definition, "configured");
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

  listModelMetadata(): readonly OpenAiCompatibleGatewayModelMetadata[] {
    return Array.from(this.modelMetadata.values())
      .map((metadata) => ({
        ...metadata,
        inputModalities: {
          ...metadata.inputModalities,
          value: metadata.inputModalities.value
            ? [...metadata.inputModalities.value]
            : null,
        },
      }))
      .sort((left, right) => left.modelId.localeCompare(right.modelId));
  }

  getModelMetadata(modelId: ID): OpenAiCompatibleGatewayModelMetadata | undefined {
    const metadata = this.modelMetadata.get(modelId);
    if (!metadata) return undefined;
    return {
      ...metadata,
      inputModalities: {
        ...metadata.inputModalities,
        value: metadata.inputModalities.value
          ? [...metadata.inputModalities.value]
          : null,
      },
    };
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
      const entriesById = new Map<string, OpenAiModelListEntry>();
      for (const entry of payload?.data ?? []) {
        const id = entry.id?.trim();
        if (id && !entriesById.has(id)) entriesById.set(id, entry);
      }
      const models = Array.from(entriesById.keys()).sort();
      this.remoteCatalog = models;

      const codingModels = models.filter((modelId) => !looksLikeNonChatModel(modelId));
      for (const modelId of codingModels) {
        const entry = entriesById.get(modelId);
        if (!entry) continue;
        const discovered = discoveredDefinition(
          entry,
          this.discoveredModelCapabilities,
        );
        if (!discovered) continue;
        const existing = this.modelDefinitions.get(modelId);
        if (existing) {
          const existingOrigin = this.modelMetadata.get(modelId)?.origin ?? "configured";
          this.registerModel(
            mergeDefinitions(existing, discovered),
            existingOrigin,
            true,
          );
        } else {
          this.registerModel(discovered, "discovered");
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
      }, "dynamic");
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

  private registerModel(
    definition: OpenAiCompatibleGatewayModelDefinition,
    origin: GatewayModelOrigin,
    replace = false,
  ): void {
    if (this.models.has(definition.modelId) && !replace) return;
    const normalized = normalizeDefinition(definition);
    const model = new OpenAiCompatibleGatewayModel(
      this.descriptor.id,
      this.transport,
      normalized,
      this.descriptor.kind,
    );
    this.models.set(model.identity.modelId, model);
    this.modelDefinitions.set(model.identity.modelId, normalized);
    this.modelMetadata.set(
      model.identity.modelId,
      metadataForDefinition(normalized, origin),
    );
  }
}
