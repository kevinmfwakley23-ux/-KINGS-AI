import { createConfiguredGatewayAdapters } from "./openai-compatible-gateway";
import { createConfiguredOllamaAdapter } from "./ollama-provider-adapter";
import { ProviderAdapterRegistry } from "./provider-adapters";

/**
 * Sovereign is the production default: no external AI inference providers.
 * External websites used for owner-approved research are a separately governed
 * tool boundary and are NOT part of the model execution provider registry.
 *
 * A local Ollama engine can host an owner-controlled model but does not prove
 * that its underlying weights were originally trained by K.I.N.G.S.
 */
export type KingsIntelligenceMode = "sovereign" | "hybrid";

export function resolveKingsIntelligenceMode(
  env: NodeJS.ProcessEnv = process.env,
): KingsIntelligenceMode {
  const value = (env.KINGS_INTELLIGENCE_MODE ?? "sovereign").trim().toLowerCase();
  if (value !== "sovereign" && value !== "hybrid") {
    throw new Error("KINGS_INTELLIGENCE_MODE must be sovereign or hybrid");
  }
  return value;
}

export function resolveKingsProviderOrder(
  env: NodeJS.ProcessEnv,
  mode: KingsIntelligenceMode,
): string[] {
  const raw = env.KINGS_APP_ROUTER_PROVIDER_ORDER ??
    (mode === "sovereign" ? "ollama-internal" : "omniroute,9router,ollama-internal");
  const values = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const result = [...new Set(values)];
  if (result.length === 0) {
    throw new Error("KINGS_APP_ROUTER_PROVIDER_ORDER must contain a provider");
  }
  if (mode === "sovereign" && result.some((id) => id !== "ollama-internal")) {
    throw new Error("Sovereign mode permits only ollama-internal in the configured provider order");
  }
  return result;
}

/** Use the existing provider registry; never register an external adapter in sovereign mode. */
export function registerConfiguredKingsInference(
  providers: ProviderAdapterRegistry,
  env: NodeJS.ProcessEnv = process.env,
  mode: KingsIntelligenceMode = resolveKingsIntelligenceMode(env),
): void {
  if (mode === "hybrid") {
    for (const gateway of createConfiguredGatewayAdapters(env)) providers.register(gateway);
  }
  const local = createConfiguredOllamaAdapter(env);
  if (local) providers.register(local);
  assertKingsInferenceSovereignty(providers, mode);
}

/** Validates both adapter and model identities, including injected registries. */
export function assertKingsInferenceSovereignty(
  providers: ProviderAdapterRegistry,
  mode: KingsIntelligenceMode,
): void {
  if (mode !== "sovereign") return;
  for (const provider of providers.list()) {
    if (provider.kind !== "internal-local" && provider.kind !== "internal-self-hosted") {
      throw new Error(`Sovereign mode rejects external inference provider: ${provider.id}`);
    }
    const adapter = providers.get(provider.id);
    if (!adapter) throw new Error(`Missing registered adapter: ${provider.id}`);
    for (const model of adapter.listModels()) {
      if (model.providerId !== provider.id ||
        (model.providerKind !== "internal-local" && model.providerKind !== "internal-self-hosted")) {
        throw new Error(`Sovereign mode rejects external or mismatched model identity: ${model.modelId}`);
      }
    }
  }
}
