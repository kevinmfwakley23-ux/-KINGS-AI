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

interface JsonGatewayDefinition {
  id?: string;
  name?: string;
  gatewayKind?: OpenAiCompatibleGatewayKind;
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
}

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
      models: (item.models ?? []).map((modelId) => configuredModel(modelId)),
      discoverModels: true,
      allowDynamicModels: true,
    };
  });
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
      models: csv(env.KINGS_9ROUTER_MODELS).map(
        (modelId) => configuredModel(modelId),
      ),
      discoverModels: true,
      allowDynamicModels: true,
    });
  }

  definitions.push(...parseJsonGateways(env.KINGS_AI_GATEWAYS_JSON));

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
    const health = await adapter.refreshModels();
    gateways.push({ adapter, health });
  }

  const catalog = gateways
    .flatMap(({ adapter, health }) => {
      const remote = new Set(health.models);
      return adapter.listModels().map((model) => ({
        providerId: adapter.descriptor.id,
        providerName: adapter.descriptor.name,
        gatewayKind: adapter.gatewayKind,
        modelId: model.modelId,
        displayName: model.displayName,
        codingEligible:
          health.codingModels.includes(model.modelId) ||
          !remote.has(model.modelId),
        verifiedCodingRoute:
          adapter.gatewayKind === "omniroute" &&
          (model.modelId === "auto/coding" || model.modelId === "auto"),
      }));
    })
    .sort((left, right) => {
      const providerOrder = left.providerId.localeCompare(right.providerId);
      return providerOrder !== 0
        ? providerOrder
        : left.modelId.localeCompare(right.modelId);
    });

  return { gateways, catalog };
}

export function registerKingsAiGatewayRuntime(
  runtime: KingsAiGatewayRuntime,
  providers: ProviderAdapterRegistry,
  capabilities: ModelCapabilityRegistry,
  metrics: Map<string, ModelRoutingMetrics>,
): void {
  const catalogByRoute = new Map(
    runtime.catalog.map((entry) => [
      `${entry.providerId}::${entry.modelId}`,
      entry,
    ]),
  );

  for (const { adapter, health } of runtime.gateways) {
    providers.register(adapter);

    for (const model of adapter.listModels()) {
      const catalog = catalogByRoute.get(
        `${adapter.descriptor.id}::${model.modelId}`,
      );
      if (!catalog?.codingEligible) continue;

      const verified = catalog.verifiedCodingRoute;
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
              ? `${adapter.gatewayKind}:documented-auto-coding-route`
              : `${adapter.gatewayKind}:live-v1-models-catalog`,
          ],
          verifiedAt: verified ? new Date().toISOString() : undefined,
        })),
      });

      metrics.set(
        modelRoutingMetricKey(adapter.descriptor.id, model.modelId),
        {
          estimatedCost: 0,
          latencyMs: verified ? 800 : 1_200,
          reliability: health.ok ? verified ? 94 : 80 : 25,
        },
      );
    }
  }
}
