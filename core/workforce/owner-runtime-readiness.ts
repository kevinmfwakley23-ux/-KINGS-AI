import {
  selectKingsAiGatewayCodingRoute,
  type KingsAiGatewayRuntime,
} from "./ai-gateway-runtime";

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

export function hasRoutableGatewayCodingModel(
  runtime: KingsAiGatewayRuntime,
): boolean {
  return Boolean(selectKingsAiGatewayCodingRoute(runtime));
}

export function selectAutomaticCodingRoute(
  runtime: KingsAiGatewayRuntime,
): OwnerCodingRoute | null {
  const selected = selectKingsAiGatewayCodingRoute(runtime);
  if (!selected) return null;

  const catalog = runtime.catalog.find(
    (entry) =>
      entry.providerId === selected.providerId &&
      entry.modelId === selected.modelId,
  );
  if (!catalog) return null;

  return {
    providerId: selected.providerId,
    modelId: selected.modelId,
    label:
      selected.providerId === "omniroute" && selected.modelId === "auto/coding"
        ? "OmniRoute Auto Coding"
        : `${catalog.providerName}: ${catalog.displayName}`,
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
