import type { IntelligenceCapability, ModelIdentity } from "./model-interface";

import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  POWERHOUSE_MINIMUM_TASKS_PER_DOMAIN,
  POWERHOUSE_QUALIFICATION_POLICY_VERSION,
  PowerhouseQualificationAuthority,
  getPowerhouseQualificationPolicy,
  type PowerhouseDomainBenchmarkResult,
  type PowerhouseDomainComparativeResult,
  type PowerhouseModelQualificationReport,
} from "./powerhouse-domain-qualification";
import { listPowerhouseServiceDomains } from "./powerhouse-service-domain";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const allCapabilities = [...new Set(
  listPowerhouseServiceDomains().flatMap((profile) => profile.requiredCapabilities),
)];

function createRegistry(): ModelCapabilityRegistry {
  const registry = new ModelCapabilityRegistry();
  const model: ModelIdentity = {
    providerId: "provider-qualified",
    modelId: "model-powerhouse-candidate",
    displayName: "Powerhouse Candidate",
    providerKind: "internal-self-hosted",
    capabilities: allCapabilities,
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens: 128_000,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    available: true,
  };
  registry.register({
    model,
    capabilities: allCapabilities.map((capability: IntelligenceCapability) => ({
      capability,
      strength: 90,
      status: "verified" as const,
      evidenceReferences: [`capability:${capability}:evaluation`],
      verifiedAt: "2026-10-24T12:00:00.000Z",
    })),
  });
  return registry;
}

function passingBenchmarks(): PowerhouseDomainBenchmarkResult[] {
  return listPowerhouseServiceDomains().map((profile) => ({
    domain: profile.id,
    benchmarkId: `powerhouse-${profile.id}`,
    benchmarkVersion: "1.0.0",
    evaluatedAt: "2026-10-24T12:00:00.000Z",
    totalTasks: POWERHOUSE_MINIMUM_TASKS_PER_DOMAIN,
    passedTasks: 18,
    criticalFailures: 0,
    heldOut: true,
    trainingDataDisjoint: true,
    rightsCleared: true,
    evidenceReferences: [`evidence:${profile.id}:held-out-results`],
  }));
}

function passingComparisons(): PowerhouseDomainComparativeResult[] {
  return listPowerhouseServiceDomains().map((profile) => ({
    domain: profile.id,
    benchmarkId: `comparative-${profile.id}`,
    benchmarkVersion: "1.0.0",
    evaluatedAt: "2026-10-24T12:00:00.000Z",
    peerModelCount: 5,
    percentileRank: 90,
    independentlyScored: true,
    evaluatorId: "independent-evaluator-001",
    evidenceReferences: [`evidence:${profile.id}:comparison`],
  }));
}

function report(overrides: Partial<PowerhouseModelQualificationReport> = {}): PowerhouseModelQualificationReport {
  return {
    modelId: "model-powerhouse-candidate",
    submittedAt: "2026-10-24T13:00:00.000Z",
    domainBenchmarks: passingBenchmarks(),
    ...overrides,
  };
}

const policy = getPowerhouseQualificationPolicy();
assert(policy.version === POWERHOUSE_QUALIFICATION_POLICY_VERSION, "Policy version must be explicit.");
assert(policy.production.allDomainsRequired, "Production qualification must require every domain.");
assert(policy.topTier.independentScoringRequired, "Top-tier proof must require independent scoring.");

const authority = new PowerhouseQualificationAuthority(createRegistry());

const missingDomainResults = passingBenchmarks().filter((item) => item.domain !== "publishing");
const missingDomain = authority.evaluate(report({ domainBenchmarks: missingDomainResults }));
assert(!missingDomain.productionQualified, "A missing domain must block production qualification.");
assert(missingDomain.productionBlockers.some((item) => item.startsWith("publishing:")), "Missing domain blocker must be attributable.");

const insufficientTasks = passingBenchmarks();
insufficientTasks[0] = { ...insufficientTasks[0], totalTasks: 19, passedTasks: 19 };
assert(
  !authority.evaluate(report({ domainBenchmarks: insufficientTasks })).productionQualified,
  "Insufficient task count must block production qualification.",
);

const lowPassRate = passingBenchmarks();
lowPassRate[0] = { ...lowPassRate[0], passedTasks: 16 };
assert(
  !authority.evaluate(report({ domainBenchmarks: lowPassRate })).productionQualified,
  "A below-threshold pass rate must block production qualification.",
);

const leakedEvaluation = passingBenchmarks();
leakedEvaluation[1] = { ...leakedEvaluation[1], trainingDataDisjoint: false };
assert(
  !authority.evaluate(report({ domainBenchmarks: leakedEvaluation })).productionQualified,
  "Training-data overlap must block production qualification.",
);

const missingEvidence = passingBenchmarks();
missingEvidence[2] = { ...missingEvidence[2], evidenceReferences: [] };
assert(
  !authority.evaluate(report({ domainBenchmarks: missingEvidence })).productionQualified,
  "Missing evidence must block production qualification.",
);

const criticalFailure = passingBenchmarks();
criticalFailure[3] = { ...criticalFailure[3], criticalFailures: 1 };
assert(
  !authority.evaluate(report({ domainBenchmarks: criticalFailure })).productionQualified,
  "A critical task failure must block production qualification.",
);

const productionQualified = authority.evaluate(report());
assert(productionQualified.productionQualified, "Passing all seven gates must earn production qualification.");
assert(!productionQualified.topTierProven, "Internal production qualification must not imply top-tier proof.");
assert(productionQualified.claim === "production-qualified", "Claim must remain production-qualified without comparisons.");

const topTierProven = authority.evaluate(report({ comparativeResults: passingComparisons() }));
assert(topTierProven.topTierProven, "Complete independent comparisons must permit top-tier proof.");
assert(topTierProven.claim === "top-tier-proven", "Top-tier proof must be explicit.");
assert(topTierProven.evidenceReferences.length >= 14, "Qualification must preserve domain and comparative evidence.");

const weakComparison = passingComparisons();
weakComparison[0] = { ...weakComparison[0], percentileRank: 89.9 };
assert(
  !authority.evaluate(report({ comparativeResults: weakComparison })).topTierProven,
  "A below-threshold comparison must block top-tier proof.",
);

const unregistered = authority.evaluate(report({ modelId: "unknown-model" }));
assert(!unregistered.productionQualified, "An unregistered model must not qualify.");

const weakCapabilityRegistry = createRegistry();
weakCapabilityRegistry.recordVerification(
  "model-powerhouse-candidate",
  "verification",
  "degraded",
  69,
  ["evidence:verification:degraded"],
  "2026-10-24T12:30:00.000Z",
);
const weakCapability = new PowerhouseQualificationAuthority(weakCapabilityRegistry).evaluate(report());
assert(!weakCapability.productionQualified, "A weak or unverified prerequisite capability must block qualification.");
assert(
  weakCapability.productionBlockers.some((item) => item.includes("verification") && item.includes("not verified")),
  "Capability blockers must preserve the failed prerequisite.",
);

console.log("Powerhouse seven-domain qualification and top-tier evidence gates: SUCCESS");
