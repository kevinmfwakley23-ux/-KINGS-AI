import { AppAiRouter } from "./app-ai-router";
import { createConfiguredGatewayAdapters } from "./openai-compatible-gateway";
import { createConfiguredOllamaAdapter } from "./ollama-provider-adapter";
import { OwnerMissionExecutionRuntime } from "./owner-mission-execution-runtime";
import { OwnerMissionRuntime } from "./owner-mission-runtime";
import { OwnerProductBuildWorker } from "./owner-product-build-worker";
import { ProviderAdapterRegistry } from "./provider-adapters";

export interface OwnerMissionExecutionServiceOptions {
  workspaceRoot: string;
  env?: NodeJS.ProcessEnv;
}

export interface OwnerMissionExecutionService {
  providerIds: string[];
  providerOrder: string[];
  executor: OwnerMissionExecutionRuntime;
}

/**
 * Production composition root for owner-created coding missions.
 * Provider configuration is server-owned. The browser never supplies provider
 * ids, model ids, credentials, shell commands, or alternate workspace paths.
 */
export function createOwnerMissionExecutionService(
  missions: OwnerMissionRuntime,
  options: OwnerMissionExecutionServiceOptions,
): OwnerMissionExecutionService {
  const env = options.env ?? process.env;
  const workspaceRoot = String(options.workspaceRoot ?? "").trim();
  if (!workspaceRoot) {
    throw new Error("K.I.N.G.S. Owner Mission Execution Service: workspace root is required.");
  }

  const providers = new ProviderAdapterRegistry();
  for (const adapter of createConfiguredGatewayAdapters(env)) providers.register(adapter);
  const ollama = createConfiguredOllamaAdapter(env);
  if (ollama) providers.register(ollama);

  const configuredOrder = String(
    env.KINGS_APP_ROUTER_PROVIDER_ORDER ?? "omniroute,9router,ollama-internal",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const providerOrder = configuredOrder.length
    ? [...new Set(configuredOrder)]
    : ["omniroute", "9router", "ollama-internal"];

  const router = new AppAiRouter(providers, providerOrder);
  const worker = new OwnerProductBuildWorker(missions, router, workspaceRoot);
  const executor = new OwnerMissionExecutionRuntime(missions, worker);

  return {
    providerIds: providers.listAvailable().map((provider) => provider.id),
    providerOrder,
    executor,
  };
}
