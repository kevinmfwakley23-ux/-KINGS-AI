import { AppAiRouter } from "./app-ai-router";
import { registerConfiguredKingsInference, resolveKingsIntelligenceMode, resolveKingsProviderOrder } from "./inference-sovereignty";
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

  const mode = resolveKingsIntelligenceMode(env);
  const providerOrder = resolveKingsProviderOrder(env, mode);
  const providers = new ProviderAdapterRegistry();
  registerConfiguredKingsInference(providers, env, mode);

  const router = new AppAiRouter(providers, providerOrder);
  const worker = new OwnerProductBuildWorker(missions, router, workspaceRoot);
  const executor = new OwnerMissionExecutionRuntime(missions, worker);

  return {
    providerIds: providers.listAvailable().map((provider) => provider.id),
    providerOrder,
    executor,
  };
}
