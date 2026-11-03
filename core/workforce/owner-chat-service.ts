import { AppAiRouter } from "./app-ai-router";
import { registerConfiguredKingsInference, resolveKingsIntelligenceMode, resolveKingsProviderOrder } from "./inference-sovereignty";
import type { ModelRequestMessage } from "./model-interface";
import { ProviderAdapterRegistry } from "./provider-adapters";
import {
  POWERHOUSE_DOMAIN_POLICY_VERSION,
  applyPowerhouseServiceDomain,
  listPowerhouseServiceDomains,
  resolvePowerhouseServiceDomain,
} from "./powerhouse-service-domain";

/**
 * Phone/desktop owner chat. Only first-party configured inference engines are
 * registered in sovereign mode. External research and code execution are NOT
 * implicit tools in chat: their separate owner-authorization gates remain intact.
 */
const CHAT_MAX_MESSAGES = 24;
const CHAT_MAX_MESSAGE_CHARACTERS = 12_000;
const CHAT_MAX_TOTAL_CHARACTERS = 48_000;
const CHAT_MAX_OUTPUT_TOKENS = 16_384;
const CHAT_CONTEXT_RESERVED_TOKENS = 512;
const CHAT_CONTEXT_MESSAGE_OVERHEAD_TOKENS = 64;
const CHAT_MAX_CONCURRENT_REQUESTS = 2;

export class OwnerChatError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "OwnerChatError";
  }
}

export interface OwnerChatRequest {
  domain: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxOutputTokens?: number;
}

export class OwnerChatService {
  private readonly providers: ProviderAdapterRegistry;
  private readonly router: AppAiRouter;
  private activeRequests = 0;
  readonly intelligenceMode: ReturnType<typeof resolveKingsIntelligenceMode>;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.intelligenceMode = resolveKingsIntelligenceMode(env);
    this.providers = new ProviderAdapterRegistry();
    registerConfiguredKingsInference(this.providers, env, this.intelligenceMode);
    this.router = new AppAiRouter(this.providers, resolveKingsProviderOrder(env, this.intelligenceMode));
  }

  discover() {
    return {
      intelligenceMode: this.intelligenceMode,
      domainPolicyVersion: POWERHOUSE_DOMAIN_POLICY_VERSION,
      domains: listPowerhouseServiceDomains().map((domain) => ({
        id: domain.id,
        label: domain.label,
        requiredCapabilities: [...domain.requiredCapabilities],
      })),
      models: this.providers.listAvailable().flatMap((provider) =>
        (this.providers.get(provider.id)?.listModels() ?? []).filter((model) => model.available).map((model) => ({
          providerId: model.providerId,
          modelId: model.modelId,
          declaredCapabilities: [...model.capabilities],
          declaredContextWindowTokens: model.contextWindowTokens,
        })),
      ),
      activeRequests: this.activeRequests,
      maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
      maxConcurrentRequests: CHAT_MAX_CONCURRENT_REQUESTS,
    };
  }

  async respond(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new OwnerChatError("INVALID_CHAT_REQUEST", 400, "Chat request must be an object.");
    }
    const record = input as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.some((key) => !["domain", "messages", "maxOutputTokens"].includes(key))) {
      throw new OwnerChatError("INVALID_CHAT_FIELDS", 400, "Only domain, messages, and maxOutputTokens are allowed.");
    }

    let domain: ReturnType<typeof resolvePowerhouseServiceDomain>;
    try {
      domain = resolvePowerhouseServiceDomain(record.domain);
    } catch {
      throw new OwnerChatError("INVALID_CHAT_DOMAIN", 400, "Select a registered K.I.N.G.S. specialist office.");
    }

    if (!Array.isArray(record.messages) || record.messages.length < 1 ||
        record.messages.length > CHAT_MAX_MESSAGES) {
      throw new OwnerChatError("INVALID_CHAT_HISTORY", 400,
        `Chat history must contain 1 to ${CHAT_MAX_MESSAGES} messages.`);
    }
    let totalCharacters = 0;
    const messages: ModelRequestMessage[] = record.messages.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new OwnerChatError("INVALID_CHAT_MESSAGE", 400, "Chat messages must be role/content objects.");
      }
      const message = entry as Record<string, unknown>;
      if (Object.keys(message).some((key) => key !== "role" && key !== "content") ||
          (message.role !== "user" && message.role !== "assistant") ||
          typeof message.content !== "string" ||
          message.content.trim().length < 1 ||
          message.content.length > CHAT_MAX_MESSAGE_CHARACTERS) {
        throw new OwnerChatError("INVALID_CHAT_MESSAGE", 400,
          "Only bounded user/assistant text is accepted; callers cannot inject system or tool roles.");
      }
      totalCharacters += message.content.length;
      return { role: message.role, content: message.content };
    });
    if (totalCharacters > CHAT_MAX_TOTAL_CHARACTERS || messages.at(-1)?.role !== "user") {
      throw new OwnerChatError("INVALID_CHAT_HISTORY", 400,
        "Chat must end with an owner question and remain under 48,000 characters.");
    }
    const maxOutputTokens = record.maxOutputTokens ?? 1_536;
    if (!Number.isSafeInteger(maxOutputTokens) ||
        Number(maxOutputTokens) < 1 ||
        Number(maxOutputTokens) > CHAT_MAX_OUTPUT_TOKENS) {
      throw new OwnerChatError("INVALID_CHAT_TOKEN_LIMIT", 400,
        `maxOutputTokens must be between 1 and ${CHAT_MAX_OUTPUT_TOKENS}.`);
    }
    const qualifiedModels = this.discover().models.filter((model) =>
      domain.requiredCapabilities.every((capability) => model.declaredCapabilities.includes(capability)));
    if (qualifiedModels.length === 0) {
      throw new OwnerChatError("NO_QUALIFIED_LOCAL_MODEL", 503,
        `No configured owner-hosted model declares all required capabilities for ${domain.label}. ` +
        "Load and independently verify a suitable model; K.I.N.G.S. will not invent an expert answer.");
    }
    const request = applyPowerhouseServiceDomain({
      appId: "kings.ai",
      messages,
      maxOutputTokens: Number(maxOutputTokens),
      allowToolProposals: false,
    }, domain);
    // UTF-8 bytes are deliberately conservative for most common model
    // tokenizers; reserve additional context for conversation framing and
    // runtime-specific tokens. This is a planning estimate, not a guarantee
    // of exact tokenizer use or actual model quality.
    const estimatedPromptTokens = request.messages.reduce(
      (total, message) =>
        total + Buffer.byteLength(message.content, "utf8") + CHAT_CONTEXT_MESSAGE_OVERHEAD_TOKENS,
      CHAT_CONTEXT_RESERVED_TOKENS,
    );
    const requiredContextWindowTokens = estimatedPromptTokens + Number(maxOutputTokens);
    if (!qualifiedModels.some((model) =>
      model.declaredContextWindowTokens >= requiredContextWindowTokens)) {
      throw new OwnerChatError("INSUFFICIENT_LOCAL_CONTEXT", 422,
        `No qualified owner-operated model declares ${requiredContextWindowTokens} context tokens ` +
        "for this history and output budget. Shorten history, lower output tokens, " +
        "or load a legitimately larger-context model.");
    }
    if (this.activeRequests >= CHAT_MAX_CONCURRENT_REQUESTS) {
      throw new OwnerChatError("CHAT_AT_CAPACITY", 429,
        "Owner chat has reached its bounded concurrent inference limit.");
    }
    this.activeRequests += 1;
    try {
      // Preserve local-provider failover, but never allow fallback to a model
      // whose declared context is smaller than the requested token budget.
      const result = await this.router.route({
        ...request,
        minContextWindowTokens: requiredContextWindowTokens,
      });
      if (!result.success) {
        throw new OwnerChatError(result.code, result.code === "NO_ROUTABLE_MODEL" ? 503 : 502,
          `K.I.N.G.S. local inference failed: ${result.message}`);
      }
      return {
        ok: true,
        domain: domain.id,
        domainPolicyVersion: POWERHOUSE_DOMAIN_POLICY_VERSION,
        requestId: result.requestId,
        providerId: result.providerId,
        modelId: result.modelId,
        content: result.content,
        usage: result.usage,
        attemptedModels: result.attempts.length,
        modelQualityVerified: false, // Routing success alone is never a benchmark pass.
      };
    } finally {
      this.activeRequests -= 1;
    }
  }
}
