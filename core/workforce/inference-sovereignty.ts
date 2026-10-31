import { createConfiguredGatewayAdapters } from "./openai-compatible-gateway";
import { createConfiguredOllamaAdapter } from "./ollama-provider-adapter";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { createConfiguredSelfHostedAdapter, KINGS_SELF_HOSTED_PROVIDER_ID } from "./self-hosted-inference-provider";

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
    (mode === "sovereign"
      ? `${KINGS_SELF_HOSTED_PROVIDER_ID},ollama-internal`
      : `${KINGS_SELF_HOSTED_PROVIDER_ID},omniroute,9router,ollama-internal`);
  const values = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const result = [...new Set(values)];
  if (result.length === 0) {
    throw new Error("KINGS_APP_ROUTER_PROVIDER_ORDER must contain a provider");
  }
  if (mode === "sovereign" && result.some((id) => id !== "ollama-internal" && id !== KINGS_SELF_HOSTED_PROVIDER_ID)) {
    throw new Error("Sovereign mode permits only kings-self-hosted and ollama-internal in the configured provider order");
  }
  return result;
}

/**
 * A sovereign Ollama endpoint must be loopback/private by default.
 * Owner-controlled remote hosts require exact explicit allowlisting; public
 * third-party APIs cannot masquerade as the "local" model by changing a URL.
 */
export function assertSovereignInferenceEndpoint(
  env: NodeJS.ProcessEnv,
  endpoint?: string,
): void {
  const raw = endpoint ?? env.KINGS_OLLAMA_BASE_URL?.trim();
  if (!raw) return;
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("Sovereign inference requires a clean HTTP(S) model endpoint URL");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const allowed = (env.KINGS_SOVEREIGN_INFERENCE_HOSTS ?? "")
    .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  const octets = hostname.split(".").map(Number);
  const ipv4 = octets.length === 4 && octets.every((octet, index) =>
    /^\d{1,3}$/.test(hostname.split(".")[index]) &&
    Number.isInteger(octet) && octet >= 0 && octet <= 255);
  const privateIpv4 = ipv4 && (
    octets[0] === 127 || octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
  );
  const privateIpv6 = hostname === "::1" ||
    /^f[cd][0-9a-f:]+$/i.test(hostname);
  const isPrivate = hostname === "localhost" || privateIpv4 || privateIpv6;
  if (!isPrivate && !allowed.includes(hostname)) {
    throw new Error("Sovereign inference endpoint must be private or explicitly owner-allowlisted");
  }
  if (!isPrivate && url.protocol !== "https:") {
    throw new Error("Public owner-allowlisted sovereign inference endpoints must use HTTPS");
  }
}

/** Use the existing provider registry; never register an external adapter in sovereign mode. */
export function registerConfiguredKingsInference(
  providers: ProviderAdapterRegistry,
  env: NodeJS.ProcessEnv = process.env,
  mode: KingsIntelligenceMode = resolveKingsIntelligenceMode(env),
): void {
  if (mode === "hybrid") {
    for (const gateway of createConfiguredGatewayAdapters(env)) providers.register(gateway);
  } else {
    assertSovereignInferenceEndpoint(env);
  }
  const selfHosted = createConfiguredSelfHostedAdapter(env);
  if (selfHosted) {
    if (mode === "sovereign") assertSovereignInferenceEndpoint(env, env.KINGS_SELF_HOSTED_BASE_URL);
    providers.register(selfHosted);
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
