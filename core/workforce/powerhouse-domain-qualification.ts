import type { ID } from "./types";

import { ModelCapabilityRegistry } from "./model-capability-registry";
import {
  listPowerhouseServiceDomains,
  type PowerhouseServiceDomain,
} from "./powerhouse-service-domain";

export const POWERHOUSE_QUALIFICATION_POLICY_VERSION = "2026-10-24.v1";
export const POWERHOUSE_MINIMUM_TASKS_PER_DOMAIN = 20;
export const POWERHOUSE_MINIMUM_PASS_RATE = 0.85;
export const POWERHOUSE_MINIMUM_CAPABILITY_STRENGTH = 70;
export const POWERHOUSE_TOP_TIER_MINIMUM_PEER_MODELS = 5;
export const POWERHOUSE_TOP_TIER_MINIMUM_PERCENTILE = 90;

export interface PowerhouseDomainBenchmarkResult {
  domain: PowerhouseServiceDomain;
  benchmarkId: string;
  benchmarkVersion: string;
  evaluatedAt: string;
  totalTasks: number;
  passedTasks: number;
  criticalFailures: number;
  heldOut: boolean;
  trainingDataDisjoint: boolean;
  rightsCleared: boolean;
  evidenceReferences: string[];
}

export interface PowerhouseDomainComparativeResult {
  domain: PowerhouseServiceDomain;
  benchmarkId: string;
  benchmarkVersion: string;
  evaluatedAt: string;
  peerModelCount: number;
  percentileRank: number;
  independentlyScored: boolean;
  evaluatorId: string;
  evidenceReferences: string[];
}

export interface PowerhouseModelQualificationReport {
  modelId: ID;
  submittedAt: string;
  domainBenchmarks: PowerhouseDomainBenchmarkResult[];
  comparativeResults?: PowerhouseDomainComparativeResult[];
}

export type PowerhouseQualificationClaim =
  | "unqualified"
  | "production-qualified"
  | "top-tier-proven";

export interface PowerhouseDomainQualificationResult {
  domain: PowerhouseServiceDomain;
  passed: boolean;
  passRate?: number;
  blockers: string[];
}

export interface PowerhouseModelQualification {
  modelId: ID;
  policyVersion: string;
  claim: PowerhouseQualificationClaim;
  productionQualified: boolean;
  topTierProven: boolean;
  evaluatedAt: string;
  domainResults: PowerhouseDomainQualificationResult[];
  productionBlockers: string[];
  topTierBlockers: string[];
  evidenceReferences: string[];
}

export interface PowerhouseQualificationPolicy {
  version: string;
  production: {
    allDomainsRequired: boolean;
    minimumTasksPerDomain: number;
    minimumPassRate: number;
    maximumCriticalFailures: number;
    heldOutRequired: boolean;
    trainingDataDisjointRequired: boolean;
    rightsClearedRequired: boolean;
    minimumCapabilityStrength: number;
    verifiedCapabilityEvidenceRequired: boolean;
  };
  topTier: {
    productionQualificationRequired: boolean;
    allDomainsRequired: boolean;
    minimumPeerModels: number;
    minimumPercentileRank: number;
    independentScoringRequired: boolean;
    comparativeEvidenceRequired: boolean;
  };
}

export function getPowerhouseQualificationPolicy(): PowerhouseQualificationPolicy {
  return {
    version: POWERHOUSE_QUALIFICATION_POLICY_VERSION,
    production: {
      allDomainsRequired: true,
      minimumTasksPerDomain: POWERHOUSE_MINIMUM_TASKS_PER_DOMAIN,
      minimumPassRate: POWERHOUSE_MINIMUM_PASS_RATE,
      maximumCriticalFailures: 0,
      heldOutRequired: true,
      trainingDataDisjointRequired: true,
      rightsClearedRequired: true,
      minimumCapabilityStrength: POWERHOUSE_MINIMUM_CAPABILITY_STRENGTH,
      verifiedCapabilityEvidenceRequired: true,
    },
    topTier: {
      productionQualificationRequired: true,
      allDomainsRequired: true,
      minimumPeerModels: POWERHOUSE_TOP_TIER_MINIMUM_PEER_MODELS,
      minimumPercentileRank: POWERHOUSE_TOP_TIER_MINIMUM_PERCENTILE,
      independentScoringRequired: true,
      comparativeEvidenceRequired: true,
    },
  };
}

function hasEvidence(references: readonly string[]): boolean {
  return references.length > 0 && references.every((reference) => reference.trim().length > 0);
}

function isValidTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function addUnique(target: string[], message: string): void {
  if (!target.includes(message)) target.push(message);
}

function indexUniqueByDomain<T extends { domain: PowerhouseServiceDomain }>(
  values: readonly T[],
  label: string,
): Map<PowerhouseServiceDomain, T> {
  const indexed = new Map<PowerhouseServiceDomain, T>();
  for (const value of values) {
    if (indexed.has(value.domain)) {
      throw new Error(
        `K.I.N.G.S. Powerhouse Qualification: duplicate ${label} for domain "${value.domain}"`,
      );
    }
    indexed.set(value.domain, value);
  }
  return indexed;
}

export class PowerhouseQualificationAuthority {
  constructor(private readonly capabilities: ModelCapabilityRegistry) {}

  evaluate(report: PowerhouseModelQualificationReport): PowerhouseModelQualification {
    if (!report.modelId.trim()) {
      throw new Error("K.I.N.G.S. Powerhouse Qualification: model id is required");
    }
    if (!isValidTimestamp(report.submittedAt)) {
      throw new Error("K.I.N.G.S. Powerhouse Qualification: submittedAt must be a valid timestamp");
    }

    const model = this.capabilities.get(report.modelId);
    const benchmarks = indexUniqueByDomain(report.domainBenchmarks, "benchmark result");
    const comparisons = indexUniqueByDomain(report.comparativeResults ?? [], "comparative result");
    const productionBlockers: string[] = [];
    const topTierBlockers: string[] = [];
    const evidenceReferences = new Set<string>();

    if (!model) {
      productionBlockers.push(`Model "${report.modelId}" is not registered.`);
    } else if (!model.model.available) {
      productionBlockers.push(`Model "${report.modelId}" is not available.`);
    }

    const domainResults = listPowerhouseServiceDomains().map((profile) => {
      const blockers: string[] = [];
      const benchmark = benchmarks.get(profile.id);

      if (!benchmark) {
        blockers.push("A benchmark result is required.");
      } else {
        if (!benchmark.benchmarkId.trim() || !benchmark.benchmarkVersion.trim()) {
          blockers.push("Benchmark id and version are required.");
        }
        if (!isValidTimestamp(benchmark.evaluatedAt)) {
          blockers.push("Benchmark evaluatedAt must be a valid timestamp.");
        }
        if (!Number.isInteger(benchmark.totalTasks) || benchmark.totalTasks < POWERHOUSE_MINIMUM_TASKS_PER_DOMAIN) {
          blockers.push(`At least ${POWERHOUSE_MINIMUM_TASKS_PER_DOMAIN} tasks are required.`);
        }
        if (
          !Number.isInteger(benchmark.passedTasks) ||
          benchmark.passedTasks < 0 ||
          benchmark.passedTasks > benchmark.totalTasks
        ) {
          blockers.push("Passed tasks must be an integer between zero and total tasks.");
        }
        if (!Number.isInteger(benchmark.criticalFailures) || benchmark.criticalFailures < 0) {
          blockers.push("Critical failures must be a non-negative integer.");
        } else if (benchmark.criticalFailures > 0) {
          blockers.push("Critical task failures must be zero.");
        }
        if (!benchmark.heldOut) blockers.push("The evaluation set must be held out.");
        if (!benchmark.trainingDataDisjoint) {
          blockers.push("The evaluation set must be disjoint from training data.");
        }
        if (!benchmark.rightsCleared) blockers.push("The evaluation set must be rights-cleared.");
        if (!hasEvidence(benchmark.evidenceReferences)) {
          blockers.push("Benchmark evidence references are required.");
        } else {
          benchmark.evidenceReferences.forEach((reference) => evidenceReferences.add(reference));
        }

        const passRate = benchmark.totalTasks > 0
          ? benchmark.passedTasks / benchmark.totalTasks
          : 0;
        if (passRate < POWERHOUSE_MINIMUM_PASS_RATE) {
          blockers.push(`Pass rate must be at least ${POWERHOUSE_MINIMUM_PASS_RATE}.`);
        }
      }

      if (model) {
        for (const capability of profile.requiredCapabilities) {
          const capabilityProfile = model.capabilities.find((item) => item.capability === capability);
          if (!capabilityProfile) {
            blockers.push(`Required capability "${capability}" is not registered.`);
            continue;
          }
          if (capabilityProfile.status !== "verified") {
            blockers.push(`Required capability "${capability}" is not verified.`);
          }
          if (capabilityProfile.strength < POWERHOUSE_MINIMUM_CAPABILITY_STRENGTH) {
            blockers.push(
              `Required capability "${capability}" is below strength ${POWERHOUSE_MINIMUM_CAPABILITY_STRENGTH}.`,
            );
          }
          if (!hasEvidence(capabilityProfile.evidenceReferences)) {
            blockers.push(`Required capability "${capability}" lacks evidence.`);
          } else {
            capabilityProfile.evidenceReferences.forEach((reference) => evidenceReferences.add(reference));
          }
        }
      }

      blockers.forEach((blocker) => addUnique(productionBlockers, `${profile.id}: ${blocker}`));
      return {
        domain: profile.id,
        passed: blockers.length === 0,
        ...(benchmark && benchmark.totalTasks > 0
          ? { passRate: benchmark.passedTasks / benchmark.totalTasks }
          : {}),
        blockers,
      };
    });

    const productionQualified = productionBlockers.length === 0;

    for (const profile of listPowerhouseServiceDomains()) {
      const comparison = comparisons.get(profile.id);
      if (!comparison) {
        topTierBlockers.push(`${profile.id}: Independent comparative evidence is required.`);
        continue;
      }
      if (!comparison.benchmarkId.trim() || !comparison.benchmarkVersion.trim()) {
        topTierBlockers.push(`${profile.id}: Comparative benchmark id and version are required.`);
      }
      if (!isValidTimestamp(comparison.evaluatedAt)) {
        topTierBlockers.push(`${profile.id}: Comparative evaluatedAt must be a valid timestamp.`);
      }
      if (!Number.isInteger(comparison.peerModelCount) || comparison.peerModelCount < POWERHOUSE_TOP_TIER_MINIMUM_PEER_MODELS) {
        topTierBlockers.push(
          `${profile.id}: At least ${POWERHOUSE_TOP_TIER_MINIMUM_PEER_MODELS} peer models are required.`,
        );
      }
      if (
        !Number.isFinite(comparison.percentileRank) ||
        comparison.percentileRank < POWERHOUSE_TOP_TIER_MINIMUM_PERCENTILE ||
        comparison.percentileRank > 100
      ) {
        topTierBlockers.push(
          `${profile.id}: Percentile rank must be between ${POWERHOUSE_TOP_TIER_MINIMUM_PERCENTILE} and 100.`,
        );
      }
      if (!comparison.independentlyScored || !comparison.evaluatorId.trim()) {
        topTierBlockers.push(`${profile.id}: An identified independent evaluator is required.`);
      }
      if (!hasEvidence(comparison.evidenceReferences)) {
        topTierBlockers.push(`${profile.id}: Comparative evidence references are required.`);
      } else {
        comparison.evidenceReferences.forEach((reference) => evidenceReferences.add(reference));
      }
    }

    if (!productionQualified) {
      topTierBlockers.unshift("Production qualification is required before top-tier proof.");
    }

    const topTierProven = productionQualified && topTierBlockers.length === 0;
    return {
      modelId: report.modelId,
      policyVersion: POWERHOUSE_QUALIFICATION_POLICY_VERSION,
      claim: topTierProven
        ? "top-tier-proven"
        : productionQualified
          ? "production-qualified"
          : "unqualified",
      productionQualified,
      topTierProven,
      evaluatedAt: report.submittedAt,
      domainResults,
      productionBlockers,
      topTierBlockers,
      evidenceReferences: [...evidenceReferences].sort(),
    };
  }
}
