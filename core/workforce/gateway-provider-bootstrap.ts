import type {
  IntelligenceCapability,
} from "./model-interface";
import {
  OpenAICompatibleGatewayAdapter,
  type OpenAICompatibleModelConfig,
} from "./openai-compatible-gateway";
import {
  ProviderAdapterRegistry,
} from "./provider-adapters";

export interface VerifiedGatewayStatus {
  providerId: "omniroute" | "9router";
  configured: boolean;
  reachable: boolean;
  verified: boolean;
  baseUrl?: string;
  discoveredModels: number;
  routableModels: number;
  error?: string;
}

export interface VerifiedGatewayBootstrap {
  registry: ProviderAdapterRegistry;
  statuses: readonly VerifiedGatewayStatus[];
}

interface GatewayDefinition {
  providerId: "omniroute" | "9router";
  name: string;
  baseUrlKey: "KINGS_OMNIROUTE_BASE_URL" | "KINGS_9ROUTER_BASE_URL";
  apiKeyKey: "KINGS_OMNIROUTE_API_KEY" | "KINGS_9ROUTER_API_KEY";
  modelsKey: "KINGS_OMNIROUTE_MODELS" | "KINGS_9ROUTER_MODELS";
}

const GATEWAYS: readonly GatewayDefinition[] = [
  {
    providerId: "omniroute",
    name: "OmniRoute",
    baseUrlKey: "KINGS_OMNIROUTE_BASE_URL",
    apiKeyKey: "KINGS_OMNIROUTE_API_KEY",
    modelsKey: "KINGS_OMNIROUTE_MODELS",
  },
  {
    providerId: "9router",
    name: "9Router",
    baseUrlKey: "KINGS_9ROUTER_BASE_URL",
    apiKeyKey: "KINGS_9ROUTER_API_KEY",
    modelsKey: "KINGS_9ROUTER_MODELS",
  },
];

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error("gateway base URL must use http or https");
  }
  return normalized;
}

function parseCsv(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = env.KINGS_CONNECTOR_HEALTH_TIMEOUT_MS?.trim();
  if (!raw) return 1500;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 100 || value > 30_000) {
    throw new Error("KINGS_CONNECTOR_HEALTH_TIMEOUT_MS must be an integer between 100 and 30000");
  }
  return value;
}

function baseCapabilities(modelId: string): IntelligenceCapability[] {
  const id = modelId.toLowerCase();
  const capabilities = new Set<IntelligenceCapability>([
    "reasoning",
  ]);

  if (/auto(?:\/smart)?$/.test(id) || /opus|sonnet|gpt-5|gpt-6|gemini.*pro|glm-5|deepseek.*r1|reason/.test(id)) {
    capabilities.add("planning");
    capabilities.add("verification");
  }

  if (/auto\/coding|coder|codex|codestral|devstral|codeqwen|qwen.*coder|gpt-5|gpt-6|opus|sonnet|glm-5|kimi/.test(id)) {
    capabilities.add("coding");
    capabilities.add("debugging");
  }

  if (/sonar|perplexity|research|search/.test(id)) {
    capabilities.add("research");
    capabilities.add("web-learning");
    capabilities.add("source-inspection");
  }

  if (/vision|\bvl\b|multimodal/.test(id)) {
    capabilities.add("vision");
  }

  return [...capabilities];
}

export function profileVerifiedGatewayModel(modelId: string): OpenAICompatibleModelConfig {
  return {
    id: modelId,
    capabilities: baseCapabilities(modelId),
    supportsToolCalling: false,
    supportsStructuredOutput: false,
    available: true,
  };
}

function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const ids = data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const id = (item as { id?: unknown }).id;
    return typeof id === "string" && id.trim() ? [id.trim()] : [];
  });

  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export async function discoverGatewayModels(
  baseUrl: string,
  apiKey: string | undefined,
  requestTimeoutMs: number,
): Promise<{ reachable: boolean; models: string[]; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (apiKey?.trim()) headers.authorization = `Bearer ${apiKey.trim()}`;
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { reachable: true, models: [], error: `model catalog returned HTTP ${response.status}` };
    }
    const payload = await response.json() as unknown;
    const models = extractModelIds(payload);
    if (models.length === 0) {
      return { reachable: true, models: [], error: "model catalog returned no usable model ids" };
    }
    return { reachable: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reachable: false, models: [], error: message };
  } finally {
    clearTimeout(timer);
  }
}

function configuredRoutingModels(
  providerId: "omniroute" | "9router",
  configured: readonly string[],
  discovered: readonly string[],
): string[] {
  const discoveredSet = new Set(discovered);
  const requested = configured.length > 0
    ? configured.filter((id) => discoveredSet.has(id))
    : providerId === "omniroute"
      ? ["auto/coding", "auto/smart", "auto", "auto/fast", "auto/cheap"].filter((id) => discoveredSet.has(id))
      : discovered.filter((id) => id === "auto" || /coder|codex|opus|sonnet|gpt-5|gpt-6|glm-5|kimi|qwen.*coder/i.test(id));

  if (requested.length > 0) return [...new Set(requested)];

  // If the upstream catalog is healthy but contains no recognized quality alias,
  // expose a small verified subset rather than claiming hundreds of unprofiled
  // models are equally fit for production coding.
  return discovered.slice(0, 8);
}

export async function bootstrapVerifiedGatewayProviders(
  env: NodeJS.ProcessEnv = process.env,
): Promise<VerifiedGatewayBootstrap> {
  const registry = new ProviderAdapterRegistry();
  const statuses: VerifiedGatewayStatus[] = [];
  const probeTimeout = timeoutMs(env);

  for (const gateway of GATEWAYS) {
    const rawBaseUrl = env[gateway.baseUrlKey]?.trim();
    if (!rawBaseUrl) {
      statuses.push({
        providerId: gateway.providerId,
        configured: false,
        reachable: false,
        verified: false,
        discoveredModels: 0,
        routableModels: 0,
      });
      continue;
    }

    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(rawBaseUrl);
    } catch (error) {
      statuses.push({
        providerId: gateway.providerId,
        configured: true,
        reachable: false,
        verified: false,
        baseUrl: rawBaseUrl,
        discoveredModels: 0,
        routableModels: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const discovery = await discoverGatewayModels(
      baseUrl,
      env[gateway.apiKeyKey],
      probeTimeout,
    );
    const routableIds = configuredRoutingModels(
      gateway.providerId,
      parseCsv(env[gateway.modelsKey]),
      discovery.models,
    );

    if (!discovery.reachable || routableIds.length === 0) {
      statuses.push({
        providerId: gateway.providerId,
        configured: true,
        reachable: discovery.reachable,
        verified: false,
        baseUrl,
        discoveredModels: discovery.models.length,
        routableModels: 0,
        error: discovery.error ?? "no verified routable models",
      });
      continue;
    }

    registry.register(new OpenAICompatibleGatewayAdapter({
      providerId: gateway.providerId,
      name: gateway.name,
      baseUrl,
      apiKey: env[gateway.apiKeyKey],
      models: routableIds.map(profileVerifiedGatewayModel),
      timeoutMs: Number(env.KINGS_GATEWAY_REQUEST_TIMEOUT_MS ?? 60_000),
      extraHeaders: gateway.providerId === "omniroute" && env.KINGS_OMNIROUTE_NO_CACHE === "true"
        ? { "X-OmniRoute-No-Cache": "true" }
        : undefined,
    }));

    statuses.push({
      providerId: gateway.providerId,
      configured: true,
      reachable: true,
      verified: true,
      baseUrl,
      discoveredModels: discovery.models.length,
      routableModels: routableIds.length,
    });
  }

  return { registry, statuses };
}
