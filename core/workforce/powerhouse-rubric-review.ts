import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  powerhouseResponsesFromCheckpoint,
  validatePowerhouseBenchmarkExecutionCheckpoint,
  type PowerhouseBenchmarkExecutionCheckpoint,
} from "./powerhouse-benchmark-executor";
import type {
  PowerhouseBenchmarkManifest,
  PowerhouseBenchmarkResponse,
} from "./powerhouse-benchmark-runner";

export interface PowerhouseRubricReviewDraft {
  taskId: string;
  score: number;
  evaluatorId: string;
  evidenceReference: string;
  evidenceSha256: string;
  reviewedAt: string;
}

export interface PowerhouseAuthorizedRubricReview
  extends PowerhouseRubricReviewDraft {
  rubricId: string;
  outputSha256: string;
  authorizationHmacSha256: string;
}

export interface PowerhouseRubricReviewArtifact {
  schemaVersion: "1";
  authorizationAuthority: "kings-owner-token";
  runId: string;
  benchmarkId: string;
  benchmarkVersion: string;
  manifestSha256: string;
  providerId: string;
  modelId: string;
  signedAt: string;
  reviews: PowerhouseAuthorizedRubricReview[];
  artifactSha256: string;
}

export interface AuthorizePowerhouseRubricReviewsRequest {
  manifest: PowerhouseBenchmarkManifest;
  checkpoint: PowerhouseBenchmarkExecutionCheckpoint;
  drafts: PowerhouseRubricReviewDraft[];
  ownerToken: string;
  signedAt: string;
}

export interface ApplyPowerhouseRubricReviewsRequest {
  manifest: PowerhouseBenchmarkManifest;
  checkpoint: PowerhouseBenchmarkExecutionCheckpoint;
  artifact: PowerhouseRubricReviewArtifact;
  ownerToken: string;
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

function requiredText(value: unknown, label: string, maximum = 512): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new Error(`K.I.N.G.S. Rubric Review: ${label} is invalid`);
  }
  return value.trim();
}

function validTimestamp(value: unknown, label: string): string {
  const normalized = requiredText(value, label, 64);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`K.I.N.G.S. Rubric Review: ${label} must be a valid timestamp`);
  }
  return normalized;
}

function validateOwnerToken(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 24) {
    throw new Error("K.I.N.G.S. Rubric Review: owner token must contain at least 24 characters");
  }
  return value.trim();
}

function validateSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`K.I.N.G.S. Rubric Review: ${label} must be a lowercase SHA-256`);
  }
  return value;
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authorizationIdentity(
  checkpoint: PowerhouseBenchmarkExecutionCheckpoint,
  signedAt: string,
): Omit<PowerhouseRubricReviewArtifact, "reviews" | "artifactSha256"> {
  return {
    schemaVersion: "1",
    authorizationAuthority: "kings-owner-token",
    runId: checkpoint.runId,
    benchmarkId: checkpoint.benchmarkId,
    benchmarkVersion: checkpoint.benchmarkVersion,
    manifestSha256: checkpoint.manifestSha256,
    providerId: checkpoint.providerId,
    modelId: checkpoint.modelId,
    signedAt,
  };
}

function reviewCore(review: PowerhouseAuthorizedRubricReview): Omit<PowerhouseAuthorizedRubricReview, "authorizationHmacSha256"> {
  const { authorizationHmacSha256: _authorization, ...core } = review;
  return core;
}

function authorizeReview(
  identity: Omit<PowerhouseRubricReviewArtifact, "reviews" | "artifactSha256">,
  review: Omit<PowerhouseAuthorizedRubricReview, "authorizationHmacSha256">,
  ownerToken: string,
): string {
  return createHmac("sha256", ownerToken)
    .update(stableJson({ identity, review }), "utf8")
    .digest("hex");
}

function artifactCore(
  artifact: PowerhouseRubricReviewArtifact,
): Omit<PowerhouseRubricReviewArtifact, "artifactSha256"> {
  const { artifactSha256: _hash, ...core } = artifact;
  return core;
}

function validateDraft(
  draft: PowerhouseRubricReviewDraft,
  modelId: string,
): PowerhouseRubricReviewDraft {
  if (!draft || typeof draft !== "object") {
    throw new Error("K.I.N.G.S. Rubric Review: every draft must be an object");
  }
  const taskId = requiredText(draft.taskId, "task id", 256);
  if (!Number.isFinite(draft.score) || draft.score < 0 || draft.score > 100) {
    throw new Error(`K.I.N.G.S. Rubric Review: score for "${taskId}" must be between 0 and 100`);
  }
  const evaluatorId = requiredText(draft.evaluatorId, `evaluator id for "${taskId}"`, 256);
  if (evaluatorId === modelId) {
    throw new Error(`K.I.N.G.S. Rubric Review: model "${modelId}" cannot review its own output`);
  }
  const evidenceReference = requiredText(
    draft.evidenceReference,
    `evidence reference for "${taskId}"`,
    1_024,
  );
  if (PLACEHOLDER_PATTERN.test(evidenceReference)) {
    throw new Error(`K.I.N.G.S. Rubric Review: evidence reference for "${taskId}" may not be a placeholder`);
  }
  return {
    taskId,
    score: draft.score,
    evaluatorId,
    evidenceReference,
    evidenceSha256: validateSha256(draft.evidenceSha256, `evidence hash for "${taskId}"`),
    reviewedAt: validTimestamp(draft.reviewedAt, `reviewedAt for "${taskId}"`),
  };
}

export function authorizePowerhouseRubricReviews(
  request: AuthorizePowerhouseRubricReviewsRequest,
): PowerhouseRubricReviewArtifact {
  const ownerToken = validateOwnerToken(request.ownerToken);
  validatePowerhouseBenchmarkExecutionCheckpoint(request.checkpoint, request.manifest);
  if (!Array.isArray(request.drafts) || request.drafts.length === 0) {
    throw new Error("K.I.N.G.S. Rubric Review: at least one review draft is required");
  }
  const signedAt = validTimestamp(request.signedAt, "signedAt");
  const identity = authorizationIdentity(request.checkpoint, signedAt);
  const tasks = new Map(request.manifest.items.map((item) => [item.id, item]));
  const records = new Map(request.checkpoint.records.map((record) => [record.taskId, record]));
  const seen = new Set<string>();

  const reviews = request.drafts.map((rawDraft) => {
    const draft = validateDraft(rawDraft, request.checkpoint.modelId);
    if (seen.has(draft.taskId)) {
      throw new Error(`K.I.N.G.S. Rubric Review: duplicate review for task "${draft.taskId}"`);
    }
    seen.add(draft.taskId);
    const task = tasks.get(draft.taskId);
    if (!task || task.split !== "held-out" || task.scoring?.kind !== "attested-rubric") {
      throw new Error(`K.I.N.G.S. Rubric Review: task "${draft.taskId}" is not an attested-rubric task`);
    }
    const record = records.get(draft.taskId);
    if (!record || record.status !== "succeeded") {
      throw new Error(`K.I.N.G.S. Rubric Review: task "${draft.taskId}" has no successful locked-model output`);
    }
    const core = {
      ...draft,
      rubricId: task.scoring.rubricId,
      outputSha256: sha256(record.output),
    };
    return {
      ...core,
      authorizationHmacSha256: authorizeReview(identity, core, ownerToken),
    };
  }).sort((left, right) => left.taskId.localeCompare(right.taskId));

  const core = { ...identity, reviews };
  return {
    ...core,
    artifactSha256: sha256(stableJson(core)),
  };
}

export function applyAuthorizedPowerhouseRubricReviews(
  request: ApplyPowerhouseRubricReviewsRequest,
): PowerhouseBenchmarkResponse[] {
  const ownerToken = validateOwnerToken(request.ownerToken);
  validatePowerhouseBenchmarkExecutionCheckpoint(request.checkpoint, request.manifest);
  const artifact = request.artifact;
  if (!artifact || typeof artifact !== "object" || artifact.schemaVersion !== "1") {
    throw new Error("K.I.N.G.S. Rubric Review: artifact schema is invalid");
  }
  const signedAt = validTimestamp(artifact.signedAt, "signedAt");
  const expectedIdentity = authorizationIdentity(request.checkpoint, signedAt);
  for (const field of [
    "schemaVersion",
    "authorizationAuthority",
    "runId",
    "benchmarkId",
    "benchmarkVersion",
    "manifestSha256",
    "providerId",
    "modelId",
    "signedAt",
  ] as const) {
    if (artifact[field] !== expectedIdentity[field]) {
      throw new Error(`K.I.N.G.S. Rubric Review: artifact ${field} does not match the execution checkpoint`);
    }
  }
  validateSha256(artifact.artifactSha256, "artifact hash");
  if (!secureEqual(sha256(stableJson(artifactCore(artifact))), artifact.artifactSha256)) {
    throw new Error("K.I.N.G.S. Rubric Review: artifact evidence was altered");
  }
  if (!Array.isArray(artifact.reviews)) {
    throw new Error("K.I.N.G.S. Rubric Review: artifact reviews must be an array");
  }

  const identity = expectedIdentity;
  const tasks = new Map(request.manifest.items.map((item) => [item.id, item]));
  const records = new Map(request.checkpoint.records.map((record) => [record.taskId, record]));
  const reviews = new Map<string, PowerhouseAuthorizedRubricReview>();
  for (const review of artifact.reviews) {
    const draft = validateDraft(review, request.checkpoint.modelId);
    if (reviews.has(draft.taskId)) {
      throw new Error(`K.I.N.G.S. Rubric Review: duplicate authorized review for task "${draft.taskId}"`);
    }
    const task = tasks.get(draft.taskId);
    if (!task || task.split !== "held-out" || task.scoring?.kind !== "attested-rubric") {
      throw new Error(`K.I.N.G.S. Rubric Review: task "${draft.taskId}" is not an attested-rubric task`);
    }
    const record = records.get(draft.taskId);
    if (!record || record.status !== "succeeded") {
      throw new Error(`K.I.N.G.S. Rubric Review: task "${draft.taskId}" has no successful locked-model output`);
    }
    if (review.rubricId !== task.scoring.rubricId) {
      throw new Error(`K.I.N.G.S. Rubric Review: rubric mismatch for task "${draft.taskId}"`);
    }
    if (!secureEqual(validateSha256(review.outputSha256, `output hash for "${draft.taskId}"`), sha256(record.output))) {
      throw new Error(`K.I.N.G.S. Rubric Review: output changed after review for task "${draft.taskId}"`);
    }
    const authorization = validateSha256(
      review.authorizationHmacSha256,
      `authorization HMAC for "${draft.taskId}"`,
    );
    const expectedAuthorization = authorizeReview(
      identity,
      reviewCore(review),
      ownerToken,
    );
    if (!secureEqual(authorization, expectedAuthorization)) {
      throw new Error(`K.I.N.G.S. Rubric Review: owner authorization is invalid for task "${draft.taskId}"`);
    }
    reviews.set(draft.taskId, review);
  }

  return powerhouseResponsesFromCheckpoint(request.checkpoint).map((response) => {
    const review = reviews.get(response.taskId);
    if (!review) return response;
    return {
      ...response,
      evidenceReferences: [
        ...(response.evidenceReferences ?? []),
        `rubric-evidence:sha256:${review.evidenceSha256}`,
        `rubric-authorization:hmac-sha256:${review.authorizationHmacSha256}`,
      ],
      review: {
        rubricId: review.rubricId,
        score: review.score,
        evaluatorId: review.evaluatorId,
        evidenceReference: review.evidenceReference,
      },
    };
  });
}
