import type { IntelligenceCapability } from "./model-interface";
import {
  DEFAULT_GATEWAY_CODING_CAPABILITIES,
  OpenAiCompatibleGatewayAdapter,
  type OpenAiCompatibleGatewayConfig,
  type OpenAiCompatibleGatewayHealth,
  type OpenAiCompatibleGatewayKind,
  type OpenAiCompatibleGatewayTransport,
} from "./openai-compatible-gateway";
import type { ProviderAdapterRegistry } from "./provider-adapters";
import type { ModelCapabilityRegistry } from "./model-capability-registry";
import type { ModelRoutingMetrics } from "./model-routing";
import { modelRoutingMetricKey } from "./model-routing";

export interface KingsGatewayModelCatalogEntry {
  providerId: string;
  providerName: string;
  gatewayKind: OpenAiCompatibleGatewayKind;
  modelId: string;
  displayName: string;
  codingEligible: boolean;
  documentedCodingRoute: boolean;
  documentedFreeRoute: boolean;
  verifiedCodingRoute: boolean;
}

export interface KingsConfiguredGateway {
  adapter: OpenAiCompatibleGatewayAdapter;
  health: OpenAiCompatibleGatewayHealth;
}

export interface KingsAiGatewayRuntime {
  gateways: readonly KingsConfiguredGateway[];
  catalog: readonly KingsGatewayModelCatalogEntry[];
}

export interface KingsGatewayRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  transportFactory?: (
    config: OpenAiCompatibleGatewayConfig,
  ) => OpenAiCompatibleGatewayTransport | undefined;
}

export interface KingsGatewayRuntimeSynchronization {
  registeredProviders: number;
  registeredModels: number;
  refreshedRoutes: number;
}

export interface KingsGatewayCodingRoute {
  providerId: string;
  modelId: string;
}

interface JsonGatewayDefinition {
  id?: string;
  name?: string;
  gatewayKind?: OpenAiCompatibleGatewayKind;
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
}

interface DirectGatewayPreset {
  id: string;
  name: string;
  gatewayKind: OpenAiCompatibleGatewayKind;
  apiKeyEnv: string;
  urlEnv: string;
  modelsEnv: string;
  defaultBaseUrl: string;
  defaultModels?: readonly string[];
}

const DIRECT_GATEWAY_PRESETS: readonly DirectGatewayPreset[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    gatewayKind: "openrouter",
    apiKeyEnv: "KINGS_OPENROUTER_KEY",
    urlEnv: "KINGS_OPENROUTER_URL",
    modelsEnv: "KINGS_OPENROUTER_MODELS",
    defaultBaseUrl: "https://openrouter.ai/api",
    defaultModels: ["openrouter/free"],
  },
  {
    id: "groq",
    name: "Groq",
    gatewayKind: "openai-compatible",
    apiKeyEnv: "KINGS_GROQ_KEY",
    urlEnv: "KINGS_GROQ_URL",
    modelsEnv: "KINGS_GROQ_MODELS",
    defaultBaseUrl: "https://api.groq.com/openai",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    gatewayKind: "openai-compatible",
    apiKeyEnv: "KINGS_CEREBRAS_KEY",
    urlEnv: "KINGS_CEREBRAS_URL",
    modelsEnv: "KINGS_CEREBRAS_MODELS",
    defaultBaseUrl: "https://api.cerebras.ai",
  },
  {
    id: "mistral",
    name: "Mistral",
    gatewayKind: "openai-compatible",
    apiKeyEnv: "KINGS_MISTRAL_KEY",
    urlEnv: "KINGS_MISTRAL_URL",
    modelsEnv: "KINGS_MISTRAL_MODELS",
    defaultBaseUrl: "https://api.mistral.ai",
  },
  {
    id: "chutes",
    name: "Chutes",
    gatewayKind: "openai-compatible",
    apiKeyEnv: "KINGS_CHUTES_KEY",
    urlEnv: "KINGS_CHUTES_URL",
    modelsEnv: "KINGS_CHUTES_MODELS",
    defaultBaseUrl: "https://llm.chutes.ai",
  },
  {
    id: "together",
    name: "Together AI",
    gatewayKind: "openai-compatible",
    apiKeyEnv: "KINGS_TOGETHER_KEY",
    urlEnv: "KINGS_TOGETHER_URL",
    modelsEnv: "KINGS_TOGETHER_MODELS",
    defaultBaseUrl: "https://api.together.ai",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    gatewayKind: "openai-compatible",
    apiKeyEnv: "KINGS_FIREWORKS_KEY",
    urlEnv: "KINGS_FIREWORKS_URL",
    modelsEnv: "KINGS_FIREWORKS_MODELS",
    defaultBaseUrl: "https://api.fireworks.ai/inference",
  },
];

function csv(value: string | undefined): string[] {
  return Array.from(new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function configuredModel(
  modelId: string,
  capabilities: readonly IntelligenceCapability[] =
    DEFAULT_GATEWAY_CODING_CAPABILITIES,
) {
  return {
    modelId,
    capabilities,
    contextWindowTokens: 128_000,
  };
}

function parseJsonGateways(
  value: string | undefined,
): OpenAiCompatibleGatewayConfig[] {
  if (!value?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(
      `K.I.N.G.S. Gateway Runtime: KINGS_AI_GATEWAYS_JSON is invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "K.I.N.G.S. Gateway Runtime: KINGS_AI_GATEWAYS_JSON must be an array",
    );
  }

  return parsed.map((value, index) => {
    const item = value as JsonGatewayDefinition;
    if (!item.id || !item.baseUrl) {
      throw new Error(
        `K.I.N.G.S. Gateway Runtime: gateway ${index + 1} requires id and baseUrl`,
      );
    }
    return {
      id: item.id,
      name: item.name ?? item.id,
      gatewayKind: item.gatewayKind ?? "openai-compatible",
      baseUrl: item.baseUrl,
      apiKey: item.apiKey,
      providerKind: "external-routed",
      models: (item.models ?? []).map((modelId) => configuredModel(modelId)),
      discoverModels: true,
      allowDynamicModels: true,
    };
  });
}

function configuredDirectGatewayDefinitions(
  env: NodeJS.ProcessEnv,
): OpenAiCompatibleGatewayConfig[] {
  return DIRECT_GATEWAY_PRESETS
    .map((preset): OpenAiCompatibleGatewayConfig | undefined => {
      const apiKey = env[preset.apiKeyEnv]?.trim();
      if (!apiKey) return undefined;

      const configuredModels = csv(env[preset.modelsEnv]);
      const models = configuredModels.length > 0
        ? configuredModels
        : [...(preset.defaultModels ?? [])];

      return {
        id: preset.id,
        name: preset.name,
        gatewayKind: preset.gatewayKind,
        baseUrl: env[preset.urlEnv]?.trim() || preset.defaultBaseUrl,
        apiKey,
        providerKind: "external-routed",
        models: models.map((modelId) => configuredModel(modelId)),
        discoverModels: true,
        allowDynamicModels: true,
      };
    })
    .filter(
      (definition): definition is OpenAiCompatibleGatewayConfig =>
        definition !== undefined,
    );
}

export function configuredGatewayDefinitions(
  env: NodeJS.ProcessEnv = process.env,
): OpenAiCompatibleGatewayConfig[] {
  const definitions: OpenAiCompatibleGatewayConfig[] = [];

  const omniUrl = env.KINGS_OMNIROUTE_URL?.trim();
  if (omniUrl) {
    const models = csv(env.KINGS_OMNIROUTE_MODELS);
    const seeds = models.length > 0 ? models : ["auto/coding", "auto"];
    definitions.push({
      id: "omniroute",
      name: "OmniRoute",
      gatewayKind: "omniroute",
      baseUrl: omniUrl,
      apiKey: env.KINGS_OMNIROUTE_KEY,
      providerKind: "external-routed",
      models: seeds.map((modelId) => configuredModel(modelId)),
      discoverModels: true,
      allowDynamicModels: true,
    });
  }

  const nineUrl = env.KINGS_9ROUTER_URL?.trim();
  if (nineUrl) {
    definitions.push({
      id: "9router",
      name: "9Router",
      gatewayKind: "9router",
      baseUrl: nineUrl,
      apiKey: env.KINGS_9ROUTER_KEY,
      providerKind: "external-routed",
      models: csv(env.KINGS_9ROUTER_MODELS).map(
        (modelId) => configuredModel(modelId),
      ),
      discoverModels: true,
      allowDynamicModels: true,
    });
  }

  definitions.push(
    ...configuredDirectGatewayDefinitions(env),
    ...parseJsonGateways(env.KINGS_AI_GATEWAYS_JSON),
  );

  const seen = new Set<string>();
  return definitions.filter((definition) => {
    if (seen.has(definition.id)) {
      throw new Error(
        `K.I.N.G.S. Gateway Runtime: duplicate gateway id "${definition.id}"`,
      );
    }
    seen.add(definition.id);
    return true;
  });
}

function synchronizeGatewayAvailability(
  adapter: OpenAiCompatibleGatewayAdapter,
  health: OpenAiCompatibleGatewayHealth,
): void {
  adapter.descriptor.available = health.ok;
  for (const model of adapter.listModels()) {
    model.available = health.ok;
  }
}

function buildGatewayCatalog(
  gateways: readonly KingsConfiguredGateway[],
): KingsGatewayModelCatalogEntry[] {
  return gateways
    .flatMap(({ adapter, health }) =>
      adapter.listModels().map((model) => {
        const documentedCodingRoute =
          adapter.gatewayKind === "omniroute" &&
          (model.modelId === "auto/coding" || model.modelId === "auto");
        const documentedFreeRoute =
          adapter.gatewayKind === "openrouter" &&
          (
            model.modelId === "openrouter/free" ||
            model.modelId.endsWith(":free")
          );
        return {
          providerId: adapter.descriptor.id,
          providerName: adapter.descriptor.name,
          gatewayKind: adapter.gatewayKind,
          modelId: model.modelId,
          displayName: model.displayName,
          codingEligible:
            health.codingModels.includes(model.modelId) ||
            documentedCodingRoute ||
            documentedFreeRoute,
          documentedCodingRoute,
          documentedFreeRoute,
          verifiedCodingRoute: false,
        };
      }),
    )
    .sort((left, right) => {
      const providerOrder = left.providerId.localeCompare(right.providerId);
      return providerOrder !== 0
        ? providerOrder
        : left.modelId.localeCompare(right.modelId);
    });
}

export function selectKingsAiGatewayCodingRoute(
  runtime: KingsAiGatewayRuntime,
): KingsGatewayCodingRoute | undefined {
  const healthyProviders = new Set(
    runtime.gateways
      .filter(({ health }) => health.ok)
      .map(({ adapter }) => adapter.descriptor.id),
  );

  const candidates = runtime.catalog
    .filter(
      (entry) =>
        entry.codingEligible && healthyProviders.has(entry.providerId),
    )
    .sort((left, right) => {
      const priority = (entry: KingsGatewayModelCatalogEntry): number => {
        if (entry.gatewayKind === "omniroute" && entry.modelId === "auto/coding") return 0;
        if (entry.gatewayKind === "omniroute" && entry.modelId === "auto") return 1;
        if (entry.gatewayKind === "9router") return 2;
        if (entry.documentedFreeRoute) return 3;
        return 4;
      };
      const priorityOrder = priority(left) - priority(right);
      if (priorityOrder !== 0) return priorityOrder;
      const providerOrder = left.providerId.localeCompare(right.providerId);
      return providerOrder !== 0
        ? providerOrder
        : left.modelId.localeCompare(right.modelId);
    });

  const selected = candidates[0];
  return selected
    ? { providerId: selected.providerId, modelId: selected.modelId }
    : undefined;
}

async function refreshGateway(
  adapter: OpenAiCompatibleGatewayAdapter,
): Promise<KingsConfiguredGateway> {
  const health = await adapter.refreshModels();
  synchronizeGatewayAvailability(adapter, health);
  return { adapter, health };
}

function registerOrRefreshModelRoute(
  adapter: OpenAiCompatibleGatewayAdapter,
  health: OpenAiCompatibleGatewayHealth,
  catalog: KingsGatewayModelCatalogEntry,
  model: ReturnType<OpenAiCompatibleGatewayAdapter["listModels"]>[number],
  capabilities: ModelCapabilityRegistry,
  metrics: Map<string, ModelRoutingMetrics>,
): boolean {
  const verified = catalog.verifiedCodingRoute;
  const existing = capabilities.get(adapter.descriptor.id, model.modelId);

  if (!existing) {
    capabilities.register({
      model,
      capabilities: model.capabilities.map((capability) => ({
        capability,
        strength:
          capability === "coding"
            ? verified ? 95 : 78
            : verified ? 90 : 74,
        status: verified ? "verified" as const : "unverified" as const,
        evidenceReferences: [
          verified
            ? `${adapter.gatewayKind}:executed-coding-acceptance`
            : catalog.documentedFreeRoute
              ? "openrouter:documented-free-route-live-catalog"
              : `${adapter.gatewayKind}:live-v1-models-catalog`,
        ],
        verifiedAt: verified ? new Date().toISOString() : undefined,
      })),
    });
  } else if (existing.model !== model) {
    existing.model.available = model.available;
  }

  const metricKey = modelRoutingMetricKey(
    adapter.descriptor.id,
    model.modelId,
  );
  if (!metrics.has(metricKey)) {
    // Initial catalog values are only seeds. Once real execution evidence has
    // adapted a route, routine health/catalog refreshes must not erase it.
    metrics.set(metricKey, {
      estimatedCost: catalog.documentedFreeRoute ? 0 : undefined,
      costBasis: catalog.documentedFreeRoute ? "verified-free" : "unknown",
      latencyMs: verified ? 800 : 1_200,
      reliability: health.ok ? verified ? 94 : 80 : 25,
    });
  }

  return !existing;
}

export async function loadKingsAiGatewayRuntime(
  options: KingsGatewayRuntimeOptions = {},
): Promise<KingsAiGatewayRuntime> {
  const definitions = configuredGatewayDefinitions(
    options.env ?? process.env,
  );
  const gateways: KingsConfiguredGateway[] = [];

  for (const definition of definitions) {
    const transport = options.transportFactory?.(definition);
    const adapter = new OpenAiCompatibleGatewayAdapter(
      definition,
      transport,
    );
    gateways.push(await refreshGateway(adapter));
  }

  return {
    gateways,
    catalog: buildGatewayCatalog(gateways),
  };
}

export async function refreshKingsAiGatewayRuntime(
  runtime: KingsAiGatewayRuntime,
): Promise<KingsAiGatewayRuntime> {
  const gateways: KingsConfiguredGateway[] = [];
  for (const configured of runtime.gateways) {
    gateways.push(await refreshGateway(configured.adapter));
  }

  return {
    gateways,
    catalog: buildGatewayCatalog(gateways),
  };
}

export function synchronizeKingsAiGatewayRuntime(
  runtime: KingsAiGatewayRuntime,
  providers: ProviderAdapterRegistry,
  capabilities: ModelCapabilityRegistry,
  metrics: Map<string, ModelRoutingMetrics>,
): KingsGatewayRuntimeSynchronization {
  const catalogByRoute = new Map(
    runtime.catalog.map((entry) => [
      `${entry.providerId}::${entry.modelId}`,
      entry,
    ]),
  );
  let registeredProviders = 0;
  let registeredModels = 0;
  let refreshedRoutes = 0;

  for (const { adapter, health } of runtime.gateways) {
    synchronizeGatewayAvailability(adapter, health);

    const existingProvider = providers.get(adapter.descriptor.id);
    if (!existingProvider) {
      providers.register(adapter);
      registeredProviders += 1;
    } else if (existingProvider !== adapter) {
      throw new Error(
        `K.I.N.G.S. Gateway Runtime: provider "${adapter.descriptor.id}" is already bound to a different adapter instance`,
      );
    }

    for (const model of adapter.listModels()) {
      const catalog = catalogByRoute.get(
        `${adapter.descriptor.id}::${model.modelId}`,
      );
      if (!catalog?.codingEligible) {
        model.available = false;
        continue;
      }

      if (registerOrRefreshModelRoute(
        adapter,
        health,
        catalog,
        model,
        capabilities,
        metrics,
      )) {
        registeredModels += 1;
      }
      refreshedRoutes += 1;
    }
  }

  return {
    registeredProviders,
    registeredModels,
    refreshedRoutes,
  };
}

export function registerKingsAiGatewayRuntime(
  runtime: KingsAiGatewayRuntime,
  providers: ProviderAdapterRegistry,
  capabilities: ModelCapabilityRegistry,
  metrics: Map<string, ModelRoutingMetrics>,
): void {
  synchronizeKingsAiGatewayRuntime(
    runtime,
    providers,
    capabilities,
    metrics,
  );
}
