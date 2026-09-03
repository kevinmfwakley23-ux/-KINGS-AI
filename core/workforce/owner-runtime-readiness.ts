import type { KingsAiGatewayRuntime } from "./ai-gateway-runtime";

export interface OwnerCodingRoute {
  providerId: string;
  modelId: string;
  label: string;
}

export interface OwnerRuntimeReadiness {
  ready: boolean;
  aiExecutionReady: boolean;
  repositoryExecutionReady: boolean;
  localModelRoutable: boolean;
  gatewayCodingRouteRoutable: boolean;
  localFallbackAvailable: boolean;
  blockers: string[];
}

function healthyGatewayIds(runtime: KingsAiGatewayRuntime): Set<string> {
  return new Set(
    runtime.gateways
      .filter(({ health }) => health.ok)
      .map(({ adapter }) => adapter.descriptor.id),
  );
}

export function hasRoutableGatewayCodingModel(
  runtime: KingsAiGatewayRuntime,
): boolean {
  const healthy = healthyGatewayIds(runtime);
  return runtime.catalog.some(
    (entry) => entry.codingEligible && healthy.has(entry.providerId),
  );
}

export function selectAutomaticCodingRoute(
  runtime: KingsAiGatewayRuntime,
): OwnerCodingRoute | null {
  const healthy = healthyGatewayIds(runtime);
  const routable = runtime.catalog.filter(
    (entry) => entry.codingEligible && healthy.has(entry.providerId),
  );

  const preferred =
    routable.find(
      (entry) =>
        entry.providerId === "omniroute" &&
        entry.modelId === "auto/coding" &&
        entry.verifiedCodingRoute,
    ) ??
    routable.find((entry) => entry.providerId === "9router") ??
    routable.find((entry) => entry.verifiedCodingRoute) ??
    routable[0];

  if (!preferred) return null;

  return {
    providerId: preferred.providerId,
    modelId: preferred.modelId,
    label:
      preferred.providerId === "omniroute" && preferred.modelId === "auto/coding"
        ? "OmniRoute Auto Coding"
        : `${preferred.providerName}: ${preferred.displayName}`,
  };
}

export function assessOwnerRuntimeReadiness(input: {
  localModelRoutable: boolean;
  gatewayCodingRouteRoutable: boolean;
  repositoryExecutionAllowed: boolean;
}): OwnerRuntimeReadiness {
  // K.I.N.G.S. production coding is gateway-first. A local Ollama model can be
  // exposed as an optional fallback, but it cannot make production readiness
  // green by itself because it does not provide the large routed model fabric.
  const aiExecutionReady = input.gatewayCodingRouteRoutable;
  const repositoryExecutionReady = input.repositoryExecutionAllowed;
  const blockers: string[] = [];

  if (!input.gatewayCodingRouteRoutable) {
    blockers.push(
      "No live OmniRoute, 9Router, or configured OpenAI-compatible coding gateway is routable. Local Ollama alone does not satisfy K.I.N.G.S. production readiness.",
    );
  }
  if (!repositoryExecutionReady) {
    blockers.push(
      "Repository build/test execution is blocked because verified Bubblewrap host isolation is unavailable.",
    );
  }

  return {
    ready: aiExecutionReady && repositoryExecutionReady,
    aiExecutionReady,
    repositoryExecutionReady,
    localModelRoutable: input.localModelRoutable,
    gatewayCodingRouteRoutable: input.gatewayCodingRouteRoutable,
    localFallbackAvailable: input.localModelRoutable,
    blockers,
  };
}
