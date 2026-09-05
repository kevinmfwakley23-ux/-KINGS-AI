import { join } from "node:path";

import {
  AdaptiveModelRoutingAuthority,
} from "./adaptive-model-routing";
import {
  AppMegaRouter,
} from "./app-mega-router";
import {
  loadKingsAiGatewayRuntime,
  synchronizeKingsAiGatewayRuntime,
  type KingsAiGatewayRuntime,
} from "./ai-gateway-runtime";
import {
  DurableGatewayUsageLedger,
  gatewayUsageObservationFromResult,
  type GatewayUsageSink,
} from "./gateway-usage-ledger";
import {
  ModelCapabilityRegistry,
} from "./model-capability-registry";
import {
  ModelRouter,
  type ModelRoutingMetrics,
} from "./model-routing";
import {
  ProviderAdapterRegistry,
} from "./provider-adapters";
import {
  ResilientModelExecutionAuthority,
  type ResilientModelExecutionOptions,
} from "./resilient-model-execution";
import {
  DurableModelRoutingMetricsStore,
} from "./durable-model-routing-metrics";

export interface AppMegaRouterRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  stateRoot?: string;
  routingMetricsFile?: string;
  usageFile?: string;
  gatewayRuntime?: KingsAiGatewayRuntime;
  loadGatewayRuntime?: () => Promise<KingsAiGatewayRuntime>;
  routingMetricsStore?: DurableModelRoutingMetricsStore;
  usageLedger?: GatewayUsageSink;
  resilientExecution?: Omit<
    ResilientModelExecutionOptions,
    "observeResult"
  >;
}

export interface AppMegaRouterRuntime {
  router: AppMegaRouter;
  providers: ProviderAdapterRegistry;
  capabilities: ModelCapabilityRegistry;
  metrics: Map<string, ModelRoutingMetrics>;
  gatewayRuntime: KingsAiGatewayRuntime;
  routingMetricsStore: DurableModelRoutingMetricsStore;
  usageLedger: GatewayUsageSink;
}

export async function createAppMegaRouterRuntime(
  options: AppMegaRouterRuntimeOptions = {},
): Promise<AppMegaRouterRuntime> {
  const env = options.env ?? process.env;
  const stateRoot =
    options.stateRoot ??
    env.KINGS_STATE_ROOT?.trim() ??
    join(process.cwd(), ".kings");
  const routingMetricsFile =
    options.routingMetricsFile ??
    env.KINGS_ROUTING_METRICS_FILE?.trim() ??
    join(stateRoot, "routing-metrics.json");
  const usageFile =
    options.usageFile ??
    env.KINGS_GATEWAY_USAGE_FILE?.trim() ??
    join(stateRoot, "gateway-usage.jsonl");

  const routingMetricsStore =
    options.routingMetricsStore ??
    new DurableModelRoutingMetricsStore(
      routingMetricsFile,
    );
  const usageLedger =
    options.usageLedger ??
    new DurableGatewayUsageLedger(
      usageFile,
    );

  const [gatewayRuntime, metrics] =
    await Promise.all([
      options.gatewayRuntime
        ? Promise.resolve(
            options.gatewayRuntime,
          )
        : options.loadGatewayRuntime
          ? options.loadGatewayRuntime()
          : loadKingsAiGatewayRuntime({ env }),
      routingMetricsStore.load(),
    ]);

  const providers =
    new ProviderAdapterRegistry();
  const capabilities =
    new ModelCapabilityRegistry();

  synchronizeKingsAiGatewayRuntime(
    gatewayRuntime,
    providers,
    capabilities,
    metrics,
  );

  providers.setExecutionObserver(
    async (
      providerId,
      modelId,
      _request,
      result,
    ) => {
      const observation =
        gatewayUsageObservationFromResult(
          providerId,
          modelId,
          result,
        );
      if (!observation) return;
      await usageLedger.record(
        observation,
      );
    },
  );

  const adaptive =
    new AdaptiveModelRoutingAuthority(
      metrics,
    );
  const executor =
    new ResilientModelExecutionAuthority(
      providers,
      {
        ...options.resilientExecution,
        observeResult: async (
          providerId,
          modelId,
          result,
        ) => {
          const learned =
            adaptive.observe(
              providerId,
              modelId,
              result,
            );
          await routingMetricsStore.record(
            providerId,
            modelId,
            learned,
          );
        },
      },
    );

  return {
    router:
      new AppMegaRouter(
        new ModelRouter(
          capabilities,
          metrics,
        ),
        executor,
      ),
    providers,
    capabilities,
    metrics,
    gatewayRuntime,
    routingMetricsStore,
    usageLedger,
  };
}
