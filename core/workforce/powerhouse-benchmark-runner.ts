import { createHash } from "node:crypto";

import {
  POWERHOUSE_MINIMUM_TASKS_PER_DOMAIN,
  type PowerhouseDomainBenchmarkResult,
} from "./powerhouse-domain-qualification";
import {
  listPowerhouseServiceDomains,
  type PowerhouseServiceDomain,
} from "./powerhouse-service-domain";

export type PowerhouseDatasetSplit = "train" | "validation" | "held-out";

export interface PowerhouseDataRights {
  licenseId: string;
  sourceReference: string;
  permissionReference: string;
  permissionEvidenceSha256: string;
  attestedBy: string;
  trainingAllowed: boolean;
  evaluationAllowed: boolean;
}

export interface PowerhouseDeterministicScoring {
  kind: "deterministic";
  caseSensitive?: boolean;
  exactMatch?: string;
  requiredSubstrings?: string[];
  forbiddenSubstrings?: string[];
  minimumCharacters?: number;
  maximumCharacters?: number;
}

export interface PowerhouseRubricScoring {
  kind: "attested-rubric";
  rubricId: string;
  minimumScore: number;
}

export type PowerhouseTaskScoring =
  | PowerhouseDeterministicScoring
  | PowerhouseRubricScoring;

export interface PowerhouseCorpusItem {
  id: string;
  domain: PowerhouseServiceDomain;
  split: PowerhouseDatasetSplit;
  sourceGroupId: string;
  prompt: string;
  critical: boolean;
  rights: PowerhouseDataRights;
  scoring?: PowerhouseTaskScoring;
}

export interface PowerhouseBenchmarkManifest {
  benchmarkId: string;
  benchmarkVersion: string;
  createdAt: string;
  items: PowerhouseCorpusItem[];
}

export interface PowerhouseRubricAttestation {
  rubricId: string;
  score: number;
  evaluatorId: string;
  evidenceReference: string;
}

export interface PowerhouseBenchmarkResponse {
  taskId: string;
  modelId: string;
  output: string;
  completedAt: string;
  evidenceReferences?: string[];
  review?: PowerhouseRubricAttestation;
}

export interface PowerhouseTaskEvaluation {
  taskId: string;
  domain: PowerhouseServiceDomain;
  passed: boolean;
  criticalFailure: boolean;
  score: number;
  grader: "deterministic" | "attested-rubric" | "missing-response";
  blockers: string[];
  outputSha256?: string;
  evidenceReferences: string[];
}

export interface PowerhouseBenchmarkRunRequest {
  modelId: string;
  evaluatedAt: string;
  manifest: PowerhouseBenchmarkManifest;
  responses: PowerhouseBenchmarkResponse[];
}

export interface PowerhouseBenchmarkRun {
  modelId: string;
  benchmarkId: string;
  benchmarkVersion: string;
  evaluatedAt: string;
  manifestSha256: string;
  runSha256: string;
  trainingDataDisjoint: true;
  rightsCleared: true;
  taskEvaluations: PowerhouseTaskEvaluation[];
  domainBenchmarks: PowerhouseDomainBenchmarkResult[];
}

const PLACEHOLDER_PATTERN = /(?:^|\b)(?:todo|tbd|placeholder|unknown)(?:\b|$)/iu;

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

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`K.I.N.G.S. Powerhouse Benchmark: ${label} must be text`);
  }
  const normalized = value.trim();
  if (!normalized) throw new Error(`K.I.N.G.S. Powerhouse Benchmark: ${label} is required`);
  return normalized;
}

function realReference(value: unknown, label: string): string {
  const normalized = requiredText(value, label);
  if (PLACEHOLDER_PATTERN.test(normalized)) {
    throw new Error(`K.I.N.G.S. Powerhouse Benchmark: ${label} may not be a placeholder`);
  }
  return normalized;
}

function normalizedPromptHash(prompt: string): string {
  return sha256(prompt.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US"));
}

function validateScoring(item: PowerhouseCorpusItem): void {
  if (item.split !== "held-out") {
    if (item.scoring) {
      throw new Error(
        `K.I.N.G.S. Powerhouse Benchmark: non-held-out item "${item.id}" may not contain scoring answers`,
      );
    }
    return;
  }
  if (!item.scoring) {
    throw new Error(`K.I.N.G.S. Powerhouse Benchmark: held-out item "${item.id}" requires scoring`);
  }
  if (typeof item.scoring !== "object") {
    throw new Error(`K.I.N.G.S. Powerhouse Benchmark: scoring for "${item.id}" must be an object`);
  }
  if (item.scoring.kind === "attested-rubric") {
    realReference(item.scoring.rubricId, `rubric id for "${item.id}"`);
    if (
      !Number.isFinite(item.scoring.minimumScore) ||
      item.scoring.minimumScore < 0 ||
      item.scoring.minimumScore > 100
    ) {
      throw new Error(
        `K.I.N.G.S. Powerhouse Benchmark: rubric minimum score for "${item.id}" must be between 0 and 100`,
      );
    }
    return;
  }
  if (item.scoring.kind !== "deterministic") {
    throw new Error(`K.I.N.G.S. Powerhouse Benchmark: unsupported scoring kind for "${item.id}"`);
  }

  const scoring = item.scoring;
  if (scoring.caseSensitive !== undefined && typeof scoring.caseSensitive !== "boolean") {
    throw new Error(`K.I.N.G.S. Powerhouse Benchmark: caseSensitive for "${item.id}" must be boolean`);
  }
  if (scoring.exactMatch !== undefined && typeof scoring.exactMatch !== "string") {
    throw new Error(`K.I.N.G.S. Powerhouse Benchmark: exactMatch for "${item.id}" must be text`);
  }
  for (const [label, fragments] of [
    ["requiredSubstrings", scoring.requiredSubstrings],
    ["forbiddenSubstrings", scoring.forbiddenSubstrings],
  ] as const) {
    if (fragments !== undefined && (!Array.isArray(fragments) || fragments.some((value) => typeof value !== "string"))) {
      throw new Error(`K.I.N.G.S. Powerhouse Benchmark: ${label} for "${item.id}" must be a text array`);
    }
  }
  const criteriaCount =
    (scoring.exactMatch === undefined ? 0 : 1) +
    (scoring.requiredSubstrings?.length ?? 0) +
    (scoring.forbiddenSubstrings?.length ?? 0) +
    (scoring.minimumCharacters === undefined ? 0 : 1) +
    (scoring.maximumCharacters === undefined ? 0 : 1);
  if (criteriaCount === 0) {
    throw new Error(
      `K.I.N.G.S. Powerhouse Benchmark: deterministic scoring for "${item.id}" requires at least one criterion`,
    );
  }
  for (const fragment of [
    ...(scoring.requiredSubstrings ?? []),
    ...(scoring.forbiddenSubstrings ?? []),
  ]) {
    requiredText(fragment, `scoring fragment for "${item.id}"`);
  }
  for (const [label, value] of [
    ["minimumCharacters", scoring.minimumCharacters],
    ["maximumCharacters", scoring.maximumCharacters],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new Error(
        `K.I.N.G.S. Powerhouse Benchmark: ${label} for "${item.id}" must be a non-negative integer`,
      );
    }
  }
  if (
    scoring.minimumCharacters !== undefined &&
    scoring.maximumCharacters !== undefined &&
    scoring.minimumCharacters > scoring.maximumCharacters
  ) {
    throw new Error(
      `K.I.N.G.S. Powerhouse Benchmark: invalid character range for "${item.id}"`,
    );
  }
}

export function validatePowerhouseBenchmarkManifest(manifest: PowerhouseBenchmarkManifest): string {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("K.I.N.G.S. Powerhouse Benchmark: manifest must be an object");
  }
  realReference(manifest.benchmarkId, "benchmark id");
  realReference(manifest.benchmarkVersion, "benchmark version");
  if (!validTimestamp(manifest.createdAt)) {
    throw new Error("K.I.N.G.S. Powerhouse Benchmark: createdAt must be a valid timestamp");
  }
  if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
    throw new Error("K.I.N.G.S. Powerhouse Benchmark: corpus items are required");
  }

  const knownDomains = new Set(listPowerhouseServiceDomains().map((profile) => profile.id));
  const ids = new Set<string>();
  const promptHashes = new Set<string>();
  const sourceSplits = new Map<string, PowerhouseDatasetSplit>();
  const trainingCounts = new Map<PowerhouseServiceDomain, number>();
  const heldOutCounts = new Map<PowerhouseServiceDomain, number>();

  for (const item of manifest.items) {
    if (!item || typeof item !== "object") {
      throw new Error("K.I.N.G.S. Powerhouse Benchmark: every corpus item must be an object");
    }
    const id = requiredText(item.id, "corpus item id");
    if (ids.has(id)) {
      throw new Error(`K.I.N.G.S. Powerhouse Benchmark: duplicate corpus item id "${id}"`);
    }
    ids.add(id);
    if (!knownDomains.has(item.domain)) {
      throw new Error(`K.I.N.G.S. Powerhouse Benchmark: unsupported domain "${item.domain}"`);
    }
    if (!(["train", "validation", "held-out"] as const).includes(item.split)) {
      throw new Error(`K.I.N.G.S. Powerhouse Benchmark: invalid split for "${id}"`);
    }

    const prompt = requiredText(item.prompt, `prompt for "${id}"`);
    const promptHash = normalizedPromptHash(prompt);
    if (promptHashes.has(promptHash)) {
      throw new Error(`K.I.N.G.S. Powerhouse Benchmark: duplicate normalized prompt for "${id}"`);
    }
    promptHashes.add(promptHash);

    const sourceGroup = realReference(item.sourceGroupId, `source group for "${id}"`);
    const previousSplit = sourceSplits.get(sourceGroup);
    if (previousSplit && previousSplit !== item.split) {
      throw new Error(
        `K.I.N.G.S. Powerhouse Benchmark: source group "${sourceGroup}" crosses ${previousSplit} and ${item.split} splits`,
      );
    }
    sourceSplits.set(sourceGroup, item.split);

    if (!item.rights || typeof item.rights !== "object") {
      throw new Error(`K.I.N.G.S. Powerhouse Benchmark: rights record for "${id}" is required`);
    }
    realReference(item.rights.licenseId, `license id for "${id}"`);
    realReference(item.rights.sourceReference, `source reference for "${id}"`);
    realReference(item.rights.permissionReference, `permission reference for "${id}"`);
    realReference(item.rights.attestedBy, `rights attester for "${id}"`);
    if (
      typeof item.rights.permissionEvidenceSha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(item.rights.permissionEvidenceSha256)
    ) {
      throw new Error(
        `K.I.N.G.S. Powerhouse Benchmark: permission evidence SHA-256 for "${id}" is invalid`,
      );
    }
    if (typeof item.critical !== "boolean") {
      throw new Error(`K.I.N.G.S. Powerhouse Benchmark: critical flag for "${id}" must be boolean`);
    }
    if (typeof item.rights.trainingAllowed !== "boolean" || typeof item.rights.evaluationAllowed !== "boolean") {
      throw new Error(`K.I.N.G.S. Powerhouse Benchmark: rights permissions for "${id}" must be boolean`);
    }
    if (item.split === "train" && !item.rights.trainingAllowed) {
      throw new Error(`K.I.N.G.S. Powerhouse Benchmark: training rights are denied for "${id}"`);
    }
    if (item.split !== "train" && !item.rights.evaluationAllowed) {
      throw new Error(`K.I.N.G.S. Powerhouse Benchmark: evaluation rights are denied for "${id}"`);
    }
    validateScoring(item);

    if (item.split === "train") {
      trainingCounts.set(item.domain, (trainingCounts.get(item.domain) ?? 0) + 1);
    } else if (item.split === "held-out") {
      heldOutCounts.set(item.domain, (heldOutCounts.get(item.domain) ?? 0) + 1);
    }
  }

  for (const profile of listPowerhouseServiceDomains()) {
    if ((trainingCounts.get(profile.id) ?? 0) === 0) {
      throw new Error(
        `K.I.N.G.S. Powerhouse Benchmark: domain "${profile.id}" requires at least one training item`,
      );
    }
    const heldOutCount = heldOutCounts.get(profile.id) ?? 0;
    if (heldOutCount < POWERHOUSE_MINIMUM_TASKS_PER_DOMAIN) {
      throw new Error(
        `K.I.N.G.S. Powerhouse Benchmark: domain "${profile.id}" requires at least ${POWERHOUSE_MINIMUM_TASKS_PER_DOMAIN} held-out tasks`,
      );
    }
  }

  return sha256(stableJson(manifest));
}

function evaluateDeterministic(
  output: string,
  scoring: PowerhouseDeterministicScoring,
): { passed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const caseSensitive = scoring.caseSensitive ?? false;
  const candidate = caseSensitive ? output : output.toLocaleLowerCase("en-US");
  const compare = (value: string): string => caseSensitive ? value : value.toLocaleLowerCase("en-US");

  if (scoring.exactMatch !== undefined && candidate !== compare(scoring.exactMatch)) {
    blockers.push("Output did not match the required exact response.");
  }
  for (const required of scoring.requiredSubstrings ?? []) {
    if (!candidate.includes(compare(required))) blockers.push(`Required criterion was not satisfied: ${required}`);
  }
  for (const forbidden of scoring.forbiddenSubstrings ?? []) {
    if (candidate.includes(compare(forbidden))) blockers.push(`Forbidden criterion was present: ${forbidden}`);
  }
  if (scoring.minimumCharacters !== undefined && output.length < scoring.minimumCharacters) {
    blockers.push(`Output was shorter than ${scoring.minimumCharacters} characters.`);
  }
  if (scoring.maximumCharacters !== undefined && output.length > scoring.maximumCharacters) {
    blockers.push(`Output exceeded ${scoring.maximumCharacters} characters.`);
  }
  return { passed: blockers.length === 0, blockers };
}

function evaluateRubric(
  modelId: string,
  scoring: PowerhouseRubricScoring,
  review: PowerhouseRubricAttestation | undefined,
): { passed: boolean; score: number; blockers: string[]; evidenceReferences: string[] } {
  const blockers: string[] = [];
  if (!review || typeof review !== "object") {
    return {
      passed: false,
      score: 0,
      blockers: ["A rubric attestation is required."],
      evidenceReferences: [],
    };
  }
  if (review.rubricId !== scoring.rubricId) blockers.push("Rubric attestation id does not match the task rubric.");
  if (!Number.isFinite(review.score) || review.score < 0 || review.score > 100) {
    blockers.push("Rubric score must be between 0 and 100.");
  } else if (review.score < scoring.minimumScore) {
    blockers.push(`Rubric score was below ${scoring.minimumScore}.`);
  }
  if (typeof review.evaluatorId !== "string" || !review.evaluatorId.trim() || review.evaluatorId === modelId) {
    blockers.push("Rubric evaluator must be identified and distinct from the evaluated model.");
  }
  if (
    typeof review.evidenceReference !== "string" ||
    !review.evidenceReference.trim() ||
    PLACEHOLDER_PATTERN.test(review.evidenceReference)
  ) {
    blockers.push("A non-placeholder rubric evidence reference is required.");
  }
  return {
    passed: blockers.length === 0,
    score: Number.isFinite(review.score) && review.score >= 0 && review.score <= 100
      ? review.score / 100
      : 0,
    blockers,
    evidenceReferences: blockers.some((blocker) => blocker.includes("evidence reference"))
      ? []
      : [review.evidenceReference],
  };
}

export class PowerhouseBenchmarkRunner {
  run(request: PowerhouseBenchmarkRunRequest): PowerhouseBenchmarkRun {
    const modelId = requiredText(request.modelId, "model id");
    if (!validTimestamp(request.evaluatedAt)) {
      throw new Error("K.I.N.G.S. Powerhouse Benchmark: evaluatedAt must be a valid timestamp");
    }
    const manifestSha256 = validatePowerhouseBenchmarkManifest(request.manifest);
    const heldOutItems = request.manifest.items.filter((item) => item.split === "held-out");
    const heldOutById = new Map(heldOutItems.map((item) => [item.id, item]));
    const responses = new Map<string, PowerhouseBenchmarkResponse>();

    for (const response of request.responses) {
      if (!response || typeof response !== "object") {
        throw new Error("K.I.N.G.S. Powerhouse Benchmark: every response must be an object");
      }
      const taskId = requiredText(response.taskId, "response task id");
      if (!heldOutById.has(taskId)) {
        throw new Error(`K.I.N.G.S. Powerhouse Benchmark: response references unknown held-out task "${taskId}"`);
      }
      if (responses.has(taskId)) {
        throw new Error(`K.I.N.G.S. Powerhouse Benchmark: duplicate response for task "${taskId}"`);
      }
      if (typeof response.modelId !== "string" || response.modelId !== modelId) {
        throw new Error(`K.I.N.G.S. Powerhouse Benchmark: response model mismatch for task "${taskId}"`);
      }
      if (!validTimestamp(response.completedAt)) {
        throw new Error(`K.I.N.G.S. Powerhouse Benchmark: invalid completedAt for task "${taskId}"`);
      }
      if (typeof response.output !== "string") {
        throw new Error(`K.I.N.G.S. Powerhouse Benchmark: output for task "${taskId}" must be text`);
      }
      if (
        response.evidenceReferences !== undefined &&
        (!Array.isArray(response.evidenceReferences) ||
          response.evidenceReferences.some((reference) => typeof reference !== "string"))
      ) {
        throw new Error(
          `K.I.N.G.S. Powerhouse Benchmark: evidence references for task "${taskId}" must be a text array`,
        );
      }
      responses.set(taskId, response);
    }

    const taskEvaluations: PowerhouseTaskEvaluation[] = heldOutItems.map((item) => {
      const response = responses.get(item.id);
      if (!response) {
        return {
          taskId: item.id,
          domain: item.domain,
          passed: false,
          criticalFailure: item.critical,
          score: 0,
          grader: "missing-response",
          blockers: ["No model response was supplied."],
          evidenceReferences: [],
        };
      }

      const responseEvidence = (response.evidenceReferences ?? [])
        .map((reference) => reference.trim())
        .filter(Boolean);
      if (item.scoring?.kind === "attested-rubric") {
        const result = evaluateRubric(modelId, item.scoring, response.review);
        return {
          taskId: item.id,
          domain: item.domain,
          passed: result.passed,
          criticalFailure: item.critical && !result.passed,
          score: result.score,
          grader: "attested-rubric",
          blockers: result.blockers,
          outputSha256: sha256(response.output),
          evidenceReferences: [...new Set([...responseEvidence, ...result.evidenceReferences])].sort(),
        };
      }

      const result = evaluateDeterministic(response.output, item.scoring as PowerhouseDeterministicScoring);
      return {
        taskId: item.id,
        domain: item.domain,
        passed: result.passed,
        criticalFailure: item.critical && !result.passed,
        score: result.passed ? 1 : 0,
        grader: "deterministic",
        blockers: result.blockers,
        outputSha256: sha256(response.output),
        evidenceReferences: [...new Set(responseEvidence)].sort(),
      };
    });

    const runCore = {
      modelId,
      benchmarkId: request.manifest.benchmarkId,
      benchmarkVersion: request.manifest.benchmarkVersion,
      evaluatedAt: request.evaluatedAt,
      manifestSha256,
      taskEvaluations,
    };
    const runSha256 = sha256(stableJson(runCore));
    const domainBenchmarks = listPowerhouseServiceDomains().map((profile) => {
      const results = taskEvaluations.filter((result) => result.domain === profile.id);
      const domainSha256 = sha256(stableJson({ ...runCore, taskEvaluations: results }));
      const supportingEvidence = results.flatMap((result) => result.evidenceReferences);
      return {
        domain: profile.id,
        benchmarkId: request.manifest.benchmarkId,
        benchmarkVersion: request.manifest.benchmarkVersion,
        evaluatedAt: request.evaluatedAt,
        totalTasks: results.length,
        passedTasks: results.filter((result) => result.passed).length,
        criticalFailures: results.filter((result) => result.criticalFailure).length,
        heldOut: true as const,
        trainingDataDisjoint: true as const,
        rightsCleared: true as const,
        evidenceReferences: [
          `benchmark-manifest:sha256:${manifestSha256}`,
          `benchmark-run:sha256:${runSha256}`,
          `benchmark-domain:sha256:${domainSha256}`,
          ...supportingEvidence,
        ].filter((value, index, values) => values.indexOf(value) === index).sort(),
      };
    });

    return {
      ...runCore,
      runSha256,
      trainingDataDisjoint: true,
      rightsCleared: true,
      domainBenchmarks,
    };
  }
}
