import { strict as assert } from "node:assert";
import { ProviderQuotaAuthority } from "./provider-quota-state";
import type { ModelRoutingCandidate } from "./model-routing";

let now = Date.parse("2026-09-04T17:30:00.000Z");
const authority = new ProviderQuotaAuthority(() => now, 60_000);

const freeRoute: ModelRoutingCandidate = {
  providerId: "free-provider",
  modelId: "free-coder",
  capabilityStrength: 85,
  estimatedCost: 0,
  costBasis: "verified-free",
  latencyMs: 200,
  reliability: 90,
  contextWindowTokens: 64_000,
  internal: false,
  zeroMarginalCost: true,
};
const fallbackRoute: ModelRoutingCandidate = {
  providerId: "local-openai",
  modelId: "local-coder",
  capabilityStrength: 82,
  estimatedCost: 0,
  costBasis: "configured-estimate",
  latencyMs: 500,
  reliability: 95,
  contextWindowTokens: 32_000,
  internal: true,
  zeroMarginalCost: true,
};

const exhausted = authority.observe({
  providerId: "free-provider",
  modelId: "free-coder",
  observedAt: new Date(now).toISOString(),
  remainingRequests: 0,
  remainingTokens: 10_000,
  resetAt: new Date(now + 120_000).toISOString(),
});
assert(exhausted.exhausted);
assert(exhausted.cooldownUntil);

const filtered = authority.filter([freeRoute, fallbackRoute]);
assert.deepEqual(filtered.candidates.map((candidate) => candidate.providerId), ["local-openai"]);
assert.equal(filtered.excluded.length, 1);
assert.match(filtered.excluded[0].reason, /zero remaining capacity/i);

now += 121_000;
const afterReset = authority.filter([freeRoute, fallbackRoute]);
assert.equal(afterReset.candidates.length, 2, "expired quota reset should allow a route to be probed again");

const limited = authority.observe({
  providerId: "free-provider",
  observedAt: new Date(now).toISOString(),
  statusCode: 429,
  retryAfterMs: 30_000,
});
assert(limited.exhausted);
const providerWide = authority.filter([freeRoute, fallbackRoute]);
assert.deepEqual(providerWide.candidates.map((candidate) => candidate.providerId), ["local-openai"]);
assert.match(providerWide.excluded[0].reason, /429/);

now += 31_000;
assert.equal(authority.filter([freeRoute, fallbackRoute]).candidates.length, 2);

console.log("PROVIDER-QUOTA-001 zero free quota removes exhausted route: SUCCESS");
console.log("PROVIDER-QUOTA-002 healthy fallback remains routable: SUCCESS");
console.log("PROVIDER-QUOTA-003 HTTP 429 cooldown + retry reset: SUCCESS");
console.log("K.I.N.G.S. PROVIDER QUOTA AUTHORITY: SUCCESS");
