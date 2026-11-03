import type { ModelIdentity } from "./model-interface";

import { AppAiRouter } from "./app-ai-router";
import {
  PowerhouseBenchmarkExecutor,
  type PowerhouseBenchmarkCheckpointStore,
  type PowerhouseBenchmarkExecutionCheckpoint,
} from "./powerhouse-benchmark-executor";
import {
  PowerhouseBenchmarkRunner,
  type PowerhouseBenchmarkManifest,
} from "./powerhouse-benchmark-runner";
import {
  applyAuthorizedPowerhouseRubricReviews,
  authorizePowerhouseRubricReviews,
  type PowerhouseRubricReviewDraft,
} from "./powerhouse-rubric-review";
import { ProviderAdapterRegistry, type ProviderAdapter } from "./provider-adapters";
import { listPowerhouseServiceDomains } from "./powerhouse-service-domain";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function expectFailure(action: () => unknown, expected: string): void {
  let message = "";
  try {
    action();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(message.includes(expected), `Expected failure containing "${expected}", received "${message}".`);
}

function createManifest(): PowerhouseBenchmarkManifest {
  const items: PowerhouseBenchmarkManifest["items"] = [];
  for (const profile of listPowerhouseServiceDomains()) {
    items.push({
      id: `${profile.id}-train`,
      domain: profile.id,
      split: "train",
      sourceGroupId: `${profile.id}-review-train-source`,
      prompt: `${profile.id} review training content`,
      critical: false,
      rights: {
        licenseId: "owner-created-v1",
        sourceReference: `${profile.id}:train:source`,
        permissionReference: `${profile.id}:train:permission`,
        permissionEvidenceSha256: "3".repeat(64),
        attestedBy: "rights-reviewer-001",
        trainingAllowed: true,
        evaluationAllowed: false,
      },
    });
    for (let index = 1; index <= 20; index += 1) {
      const taskId = `${profile.id}-review-${index}`;
      const rubric = index === 1 && (profile.id === "book-editing" || profile.id === "storytelling");
      items.push({
        id: taskId,
        domain: profile.id,
        split: "held-out",
        sourceGroupId: `${profile.id}-review-source-${index}`,
        prompt: `Private review prompt ${taskId}`,
        critical: index === 1,
        rights: {
          licenseId: "owner-created-v1",
          sourceReference: `${taskId}:source`,
          permissionReference: `${taskId}:permission`,
          permissionEvidenceSha256: "4".repeat(64),
          attestedBy: "rights-reviewer-001",
          trainingAllowed: false,
          evaluationAllowed: true,
        },
        scoring: rubric
          ? {
              kind: "attested-rubric",
              rubricId: `${profile.id}-quality-rubric-v1`,
              minimumScore: 85,
            }
          : {
              kind: "deterministic",
              requiredSubstrings: [`pass-${taskId}`],
            },
      });
    }
  }
  return {
    benchmarkId: "authorized-rubric-review",
    benchmarkVersion: "1.0.0",
    createdAt: "2026-10-28T19:00:00.000Z",
    items,
  };
}

class MemoryStore implements PowerhouseBenchmarkCheckpointStore {
  checkpoint?: PowerhouseBenchmarkExecutionCheckpoint;
  async load(): Promise<PowerhouseBenchmarkExecutionCheckpoint | undefined> {
    return this.checkpoint ? structuredClone(this.checkpoint) : undefined;
  }
  async save(checkpoint: PowerhouseBenchmarkExecutionCheckpoint): Promise<void> {
    this.checkpoint = structuredClone(checkpoint);
  }
}

async function executeManifest(
  manifest: PowerhouseBenchmarkManifest,
  outputSuffix = "",
): Promise<PowerhouseBenchmarkExecutionCheckpoint> {
  const capabilities = [...new Set(
    listPowerhouseServiceDomains().flatMap((profile) => profile.requiredCapabilities),
  )];
  const identity: ModelIdentity = {
    providerId: "review-provider",
    modelId: "review-model-v1",
    displayName: "Review Candidate",
    providerKind: "internal-self-hosted",
    capabilities,
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens: 128_000,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    available: true,
  };
  const adapter: ProviderAdapter = {
    descriptor: {
      id: identity.providerId,
      name: "Review Provider",
      kind: identity.providerKind,
      available: true,
    },
    listModels: () => [identity],
    getModel: () => undefined,
    execute: async (_modelId, request) => {
      const prompt = request.messages.find((message) => message.role === "user")?.content ?? "";
      const taskId = prompt.replace("Private review prompt ", "");
      const now = "2026-10-28T20:00:00.000Z";
      return {
        success: true,
        response: {
          requestId: request.id,
          model: identity,
          content: `pass-${taskId}${outputSuffix}`,
          toolCallProposals: [],
          usage: {
            elapsedMs: 1,
            tokensUsed: 10,
            iterationsUsed: 1,
            estimatedCost: 0,
            inputTokens: 6,
            outputTokens: 4,
          },
          metadata: { requestId: request.id, startedAt: now, completedAt: now, latencyMs: 1 },
        },
      };
    },
  };
  const providers = new ProviderAdapterRegistry();
  providers.register(adapter);
  const store = new MemoryStore();
  const result = await new PowerhouseBenchmarkExecutor(
    new AppAiRouter(providers, [identity.providerId]),
    { now: () => new Date("2026-10-28T20:00:00.000Z"), delay: async () => undefined },
  ).execute({
    runId: "review-run-001",
    providerId: identity.providerId,
    modelId: identity.modelId,
    manifest,
    checkpointStore: store,
    concurrency: 8,
    maxAttemptsPerTask: 1,
    retryDelayMs: 0,
  });
  return result.checkpoint;
}

async function main(): Promise<void> {
  const manifest = createManifest();
  const checkpoint = await executeManifest(manifest);
  const ownerToken = "owner-rubric-authorization-token-0123456789abcdef";
  const drafts: PowerhouseRubricReviewDraft[] = [
    {
      taskId: "book-editing-review-1",
      score: 91,
      evaluatorId: "owner-approved-editor-001",
      evidenceReference: "review-record:book-editing:001",
      evidenceSha256: "5".repeat(64),
      reviewedAt: "2026-10-28T21:00:00.000Z",
    },
    {
      taskId: "storytelling-review-1",
      score: 93,
      evaluatorId: "owner-approved-story-reviewer-001",
      evidenceReference: "review-record:storytelling:001",
      evidenceSha256: "6".repeat(64),
      reviewedAt: "2026-10-28T21:05:00.000Z",
    },
  ];

  const unsignedResponses = checkpoint.records.flatMap((record) => record.status === "succeeded" ? [{
    taskId: record.taskId,
    modelId: record.modelId,
    output: record.output,
    completedAt: record.completedAt,
    evidenceReferences: [`benchmark-route:sha256:${record.evidenceSha256}`],
  }] : []);
  const beforeReview = new PowerhouseBenchmarkRunner().run({
    modelId: checkpoint.modelId,
    evaluatedAt: "2026-10-28T22:00:00.000Z",
    manifest,
    responses: unsignedResponses,
  });
  assert(
    beforeReview.domainBenchmarks.find((result) => result.domain === "book-editing")?.criticalFailures === 1,
    "Missing rubric review must remain a critical failure.",
  );

  const artifact = authorizePowerhouseRubricReviews({
    manifest,
    checkpoint,
    drafts,
    ownerToken,
    signedAt: "2026-10-28T21:30:00.000Z",
  });
  const serialized = JSON.stringify(artifact);
  assert(!serialized.includes(ownerToken), "Authorized review artifact must never contain the owner token.");
  assert(!serialized.includes("Private review prompt"), "Authorized review artifact must not contain held-out prompts.");
  assert(!serialized.includes("pass-book-editing"), "Authorized review artifact must not contain raw model output.");
  assert(artifact.reviews.every((review) => /^[a-f0-9]{64}$/u.test(review.authorizationHmacSha256)), "Every review must receive an owner HMAC.");

  const reviewedResponses = applyAuthorizedPowerhouseRubricReviews({
    manifest,
    checkpoint,
    artifact,
    ownerToken,
  });
  const reviewed = new PowerhouseBenchmarkRunner().run({
    modelId: checkpoint.modelId,
    evaluatedAt: "2026-10-28T22:00:00.000Z",
    manifest,
    responses: reviewedResponses,
  });
  assert(reviewed.domainBenchmarks.every((result) => result.passedTasks === 20), "Authorized reviews must complete all seven domains.");
  assert(reviewed.domainBenchmarks.every((result) => result.criticalFailures === 0), "Passing authorized reviews must clear critical failures.");
  assert(
    reviewed.domainBenchmarks.find((result) => result.domain === "storytelling")?.evidenceReferences.some(
      (reference) => reference.startsWith("rubric-authorization:hmac-sha256:"),
    ) === true,
    "Benchmark evidence must preserve the owner review authorization.",
  );

  expectFailure(() => applyAuthorizedPowerhouseRubricReviews({
    manifest,
    checkpoint,
    artifact,
    ownerToken: "different-owner-token-0123456789abcdef",
  }), "owner authorization is invalid");

  const changedOutputCheckpoint = await executeManifest(manifest, "-changed");
  expectFailure(() => applyAuthorizedPowerhouseRubricReviews({
    manifest,
    checkpoint: changedOutputCheckpoint,
    artifact,
    ownerToken,
  }), "output changed after review");

  expectFailure(() => authorizePowerhouseRubricReviews({
    manifest,
    checkpoint,
    drafts: [{ ...drafts[0], evaluatorId: checkpoint.modelId }],
    ownerToken,
    signedAt: "2026-10-28T21:30:00.000Z",
  }), "cannot review its own output");

  expectFailure(() => authorizePowerhouseRubricReviews({
    manifest,
    checkpoint,
    drafts: [{ ...drafts[0], taskId: "chat-review-2" }],
    ownerToken,
    signedAt: "2026-10-28T21:30:00.000Z",
  }), "is not an attested-rubric task");

  const belowThresholdArtifact = authorizePowerhouseRubricReviews({
    manifest,
    checkpoint,
    drafts: [{ ...drafts[0], score: 84 }],
    ownerToken,
    signedAt: "2026-10-28T21:30:00.000Z",
  });
  const belowThresholdResponses = applyAuthorizedPowerhouseRubricReviews({
    manifest,
    checkpoint,
    artifact: belowThresholdArtifact,
    ownerToken,
  });
  const belowThreshold = new PowerhouseBenchmarkRunner().run({
    modelId: checkpoint.modelId,
    evaluatedAt: "2026-10-28T22:00:00.000Z",
    manifest,
    responses: belowThresholdResponses,
  });
  assert(
    belowThreshold.domainBenchmarks.find((result) => result.domain === "book-editing")?.criticalFailures === 1,
    "Owner authorization must not turn a below-threshold review into a pass.",
  );
}

main()
  .then(() => console.log("Powerhouse owner-authorized rubric review: SUCCESS"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
