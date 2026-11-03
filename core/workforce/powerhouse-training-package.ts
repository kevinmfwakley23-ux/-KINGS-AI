import { createHash } from "node:crypto";

import {
  type PowerhouseBenchmarkManifest,
  type PowerhouseDataRights,
  validatePowerhouseBenchmarkManifest,
} from "./powerhouse-benchmark-runner";
import {
  listPowerhouseServiceDomains,
  type PowerhouseServiceDomain,
} from "./powerhouse-service-domain";

export const POWERHOUSE_TRAINING_PACKAGE_SCHEMA_VERSION = "1" as const;
export const POWERHOUSE_MINIMUM_TRAINING_EXAMPLES_PER_DOMAIN = 20;

export interface PowerhouseTrainingExample {
  id: string;
  domain: PowerhouseServiceDomain;
  sourceGroupId: string;
  prompt: string;
  targetResponse: string;
  rights: PowerhouseDataRights;
}

export interface PowerhouseTrainingPackage {
  schemaVersion: typeof POWERHOUSE_TRAINING_PACKAGE_SCHEMA_VERSION;
  packageId: string;
  packageVersion: string;
  createdAt: string;
  examples: PowerhouseTrainingExample[];
}

export interface ValidatedPowerhouseTrainingPackage {
  packageSha256: string;
  benchmarkManifestSha256: string;
  exampleCount: number;
  domainCounts: Record<PowerhouseServiceDomain, number>;
}

const PLACEHOLDER_PATTERN = /(?:^|\b)(?:todo|tbd|placeholder|unknown)(?:\b|$)/iu;
const PACKAGE_KEYS = new Set(["schemaVersion", "packageId", "packageVersion", "createdAt", "examples"]);
const EXAMPLE_KEYS = new Set(["id", "domain", "sourceGroupId", "prompt", "targetResponse", "rights"]);
const RIGHTS_KEYS = new Set([
  "licenseId",
  "sourceReference",
  "permissionReference",
  "permissionEvidenceSha256",
  "attestedBy",
  "trainingAllowed",
  "evaluationAllowed",
]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function assertExactKeys(value: object, allowed: ReadonlySet<string>, label: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new Error(
      `K.I.N.G.S. Powerhouse Training: ${label} contains unsupported field(s): ${unexpected.sort().join(", ")}`,
    );
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`K.I.N.G.S. Powerhouse Training: ${label} is required`);
  }
  return value.trim();
}

function realReference(value: unknown, label: string): string {
  const normalized = requiredText(value, label);
  if (PLACEHOLDER_PATTERN.test(normalized)) {
    throw new Error(`K.I.N.G.S. Powerhouse Training: ${label} may not be a placeholder`);
  }
  return normalized;
}

function normalizedPromptHash(prompt: string): string {
  return sha256(prompt.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US"));
}

function validateRights(rights: PowerhouseDataRights, id: string): void {
  if (!rights || typeof rights !== "object" || Array.isArray(rights)) {
    throw new Error(`K.I.N.G.S. Powerhouse Training: rights record for "${id}" is required`);
  }
  assertExactKeys(rights, RIGHTS_KEYS, `rights record for "${id}"`);
  realReference(rights.licenseId, `license id for "${id}"`);
  realReference(rights.sourceReference, `source reference for "${id}"`);
  realReference(rights.permissionReference, `permission reference for "${id}"`);
  realReference(rights.attestedBy, `rights attester for "${id}"`);
  if (!/^[a-f0-9]{64}$/u.test(rights.permissionEvidenceSha256)) {
    throw new Error(`K.I.N.G.S. Powerhouse Training: permission evidence SHA-256 for "${id}" is invalid`);
  }
  if (rights.trainingAllowed !== true) {
    throw new Error(`K.I.N.G.S. Powerhouse Training: training rights are denied for "${id}"`);
  }
  if (typeof rights.evaluationAllowed !== "boolean") {
    throw new Error(`K.I.N.G.S. Powerhouse Training: evaluation permission for "${id}" must be boolean`);
  }
}

export function validatePowerhouseTrainingPackage(
  trainingPackage: PowerhouseTrainingPackage,
  benchmarkManifest: PowerhouseBenchmarkManifest,
): ValidatedPowerhouseTrainingPackage {
  if (!trainingPackage || typeof trainingPackage !== "object" || Array.isArray(trainingPackage)) {
    throw new Error("K.I.N.G.S. Powerhouse Training: package must be an object");
  }
  assertExactKeys(trainingPackage, PACKAGE_KEYS, "package");
  if (trainingPackage.schemaVersion !== POWERHOUSE_TRAINING_PACKAGE_SCHEMA_VERSION) {
    throw new Error("K.I.N.G.S. Powerhouse Training: package schema version is unsupported");
  }
  realReference(trainingPackage.packageId, "package id");
  realReference(trainingPackage.packageVersion, "package version");
  if (!trainingPackage.createdAt?.trim() || !Number.isFinite(Date.parse(trainingPackage.createdAt))) {
    throw new Error("K.I.N.G.S. Powerhouse Training: createdAt must be a valid timestamp");
  }
  if (!Array.isArray(trainingPackage.examples) || trainingPackage.examples.length === 0) {
    throw new Error("K.I.N.G.S. Powerhouse Training: examples are required");
  }

  const benchmarkManifestSha256 = validatePowerhouseBenchmarkManifest(benchmarkManifest);
  const protectedItems = benchmarkManifest.items.filter((item) => item.split !== "train");
  const protectedPromptHashes = new Set(protectedItems.map((item) => normalizedPromptHash(item.prompt)));
  const protectedSourceGroups = new Set(protectedItems.map((item) => item.sourceGroupId));
  const protectedIds = new Set(protectedItems.map((item) => item.id));
  const domains = listPowerhouseServiceDomains().map((profile) => profile.id);
  const knownDomains = new Set(domains);
  const domainCounts = Object.fromEntries(domains.map((domain) => [domain, 0])) as Record<
    PowerhouseServiceDomain,
    number
  >;
  const ids = new Set<string>();
  const promptHashes = new Set<string>();

  for (const example of trainingPackage.examples) {
    if (!example || typeof example !== "object" || Array.isArray(example)) {
      throw new Error("K.I.N.G.S. Powerhouse Training: every example must be an object");
    }
    assertExactKeys(example, EXAMPLE_KEYS, "training example");
    const id = requiredText(example.id, "training example id");
    if (ids.has(id)) throw new Error(`K.I.N.G.S. Powerhouse Training: duplicate example id "${id}"`);
    if (protectedIds.has(id)) {
      throw new Error(`K.I.N.G.S. Powerhouse Training: example id "${id}" is reserved by evaluation data`);
    }
    ids.add(id);
    if (!knownDomains.has(example.domain)) {
      throw new Error(`K.I.N.G.S. Powerhouse Training: unsupported domain "${example.domain}"`);
    }
    const prompt = requiredText(example.prompt, `prompt for "${id}"`);
    requiredText(example.targetResponse, `target response for "${id}"`);
    const promptHash = normalizedPromptHash(prompt);
    if (promptHashes.has(promptHash)) {
      throw new Error(`K.I.N.G.S. Powerhouse Training: duplicate normalized prompt for "${id}"`);
    }
    if (protectedPromptHashes.has(promptHash)) {
      throw new Error(`K.I.N.G.S. Powerhouse Training: prompt for "${id}" overlaps evaluation data`);
    }
    promptHashes.add(promptHash);
    const sourceGroupId = realReference(example.sourceGroupId, `source group for "${id}"`);
    if (protectedSourceGroups.has(sourceGroupId)) {
      throw new Error(`K.I.N.G.S. Powerhouse Training: source group "${sourceGroupId}" overlaps evaluation data`);
    }
    validateRights(example.rights, id);
    domainCounts[example.domain] += 1;
  }

  for (const domain of domains) {
    if (domainCounts[domain] < POWERHOUSE_MINIMUM_TRAINING_EXAMPLES_PER_DOMAIN) {
      throw new Error(
        `K.I.N.G.S. Powerhouse Training: domain "${domain}" requires at least ${POWERHOUSE_MINIMUM_TRAINING_EXAMPLES_PER_DOMAIN} examples`,
      );
    }
  }

  return {
    packageSha256: sha256(stableJson(trainingPackage)),
    benchmarkManifestSha256,
    exampleCount: trainingPackage.examples.length,
    domainCounts,
  };
}
