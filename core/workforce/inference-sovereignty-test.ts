import assert from "node:assert/strict";
import { createOmniRouteAdapter } from "./openai-compatible-gateway";
import { ProviderAdapterRegistry } from "./provider-adapters";
import {
  assertKingsInferenceSovereignty,
  registerConfiguredKingsInference,
  resolveKingsIntelligenceMode,
  resolveKingsProviderOrder,
} from "./inference-sovereignty";

const configured: NodeJS.ProcessEnv = {
  KINGS_OMNIROUTE_MODELS: "external-model",
  KINGS_9ROUTER_MODELS: "another-external-model",
  KINGS_OLLAMA_BASE_URL: "http://127.0.0.1:11434",
  KINGS_OLLAMA_MODEL: "kings-local-model",
};
assert.equal(resolveKingsIntelligenceMode({}), "sovereign", "no external agent or cloud model may be the default");
assert.equal(resolveKingsIntelligenceMode({ KINGS_INTELLIGENCE_MODE: "hybrid" }), "hybrid");
assert.throws(() => resolveKingsIntelligenceMode({ KINGS_INTELLIGENCE_MODE: "unknown" }), /sovereign or hybrid/);
assert.deepEqual(resolveKingsProviderOrder(configured, "sovereign"), ["ollama-internal"]);
assert.deepEqual(resolveKingsProviderOrder(configured, "hybrid"), ["omniroute", "9router", "ollama-internal"]);
assert.throws(() => resolveKingsProviderOrder({
  ...configured, KINGS_APP_ROUTER_PROVIDER_ORDER: "omniroute,ollama-internal",
}, "sovereign"), /Sovereign mode permits only/);
assert.throws(() => resolveKingsProviderOrder({
  ...configured, KINGS_APP_ROUTER_PROVIDER_ORDER: " ",
}, "sovereign"), /must contain a provider/);

const sovereign = new ProviderAdapterRegistry();
registerConfiguredKingsInference(sovereign, configured);
assert.deepEqual(sovereign.list().map((entry) => entry.id), ["ollama-internal"],
  "even configured gateway credentials cannot enable external models in sovereign mode");
assert.equal(sovereign.get("ollama-internal")?.listModels()[0]?.modelId, "kings-local-model");
assert.equal(sovereign.get("ollama-internal")?.listModels()[0]?.providerKind, "internal-local");

const noLocal = new ProviderAdapterRegistry();
registerConfiguredKingsInference(noLocal, { KINGS_OMNIROUTE_MODELS: "external" });
assert.equal(noLocal.list().length, 0,
  "missing local model must fail closed, not silently route to outside agents");

const hybrid = new ProviderAdapterRegistry();
registerConfiguredKingsInference(hybrid, configured, "hybrid");
assert.deepEqual(hybrid.list().map((entry) => entry.id), ["9router", "ollama-internal", "omniroute"],
  "external inference requires explicit owner-controlled hybrid mode");

const injected = new ProviderAdapterRegistry();
injected.register(createOmniRouteAdapter({ KINGS_OMNIROUTE_MODELS: "external" }));
assert.throws(() => assertKingsInferenceSovereignty(injected, "sovereign"),
  /rejects external inference provider/, "injected gateway must never bypass sovereignty policy");
assert.doesNotThrow(() => assertKingsInferenceSovereignty(injected, "hybrid"));

console.log("K.I.N.G.S. sovereign model execution: SUCCESS");
