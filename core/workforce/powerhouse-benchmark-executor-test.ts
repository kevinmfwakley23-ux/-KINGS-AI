import type {
  ModelExecutionRequest,
  ModelIdentity,
} from "./model-interface";

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
import { ProviderAdapterRegistry, type ProviderAdapter } from "./provider-adapters";
import { listPowerhouseServiceDomains } from "./powerhouse-service-domain";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function expectFailure(action: () => Promise<unknown>, expected: string): Promise<void> {
  let message = "";
  try {
    await action();
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
      sourceGroupId: `${profile.id}-train-source`,
      prompt: `${profile.id} governed training content`,
      critical: false,
      rights: {
        licenseId: "owner-created-v1",
        sourceReference: `${profile.id}:train:source`,
        permissionReference: `${profile.id}:train:permission`,
        permissionEvidenceSha256: "e".repeat(64),
        attestedBy: "rights-reviewer-001",
        trainingAllowed: true,
        evaluationAllowed: false,
      },
    });
    for (let index = 1; index <= 20; index += 1) {
      const taskId = `${profile.id}-held-${index}`;
      items.push({
        id: taskId,
        domain: profile.id,
        split: "held-out",
        sourceGroupId: `${profile.id}-held-source-${index}`,
        prompt: `Execute private benchmark task ${taskId}`,
        critical: index === 1,
        rights: {
          licenseId: "owner-created-v1",
          sourceReference: `${taskId}:source`,
          permissionReference: `${taskId}:permission`,
          permissionEvidenceSha256: "f".repeat(64),
          attestedBy: "rights-reviewer-001",
          trainingAllowed: false,
          evaluationAllowed: true,
        },
        scoring: {
          kind: "deterministic",
          requiredSubstrings: [`pass-${taskId}`],
        },
      });
    }
  }
  return {
    benchmarkId: "live-seven-domain-evaluation",
    benchmarkVersion: "1.0.0",
    createdAt: "2026-10-28T12:00:00.000Z",
    items,
  };
}

class MemoryCheckpointStore implements PowerhouseBenchmarkCheckpointStore {
  checkpoint?: PowerhouseBenchmarkExecutionCheckpoint;
  saves = 0;

  async load(): Promise<PowerhouseBenchmarkExecutionCheckpoint | undefined> {
    return this.checkpoint ? structuredClone(this.checkpoint) : undefined;
  }

  async save(checkpoint: PowerhouseBenchmarkExecutionCheckpoint): Promise<void> {
    this.checkpoint = structuredClone(checkpoint);
    this.saves += 1;
  }
}

async function main(): Promise<void> {
  const capabilities = [...new Set(
    listPowerhouseServiceDomains().flatMap((profile) => profile.requiredCapabilities),
  )];
  const identity: ModelIdentity = {
    providerId: "locked-provider",
    modelId: "locked-model-v1",
    displayName: "Locked Evaluation Model",
    providerKind: "internal-self-hosted",
    capabilities,
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens: 128_000,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    available: true,
  };
  const requestCounts = new Map<string, number>();
  const captured = new Map<string, ModelExecutionRequest>();
  const adapter: ProviderAdapter = {
    descriptor: {
      id: identity.providerId,
      name: "Locked Test Provider",
      kind: identity.providerKind,
      available: true,
    },
    listModels: () => [identity],
    getModel: () => undefined,
    execute: async (modelId, request) => {
      assert(modelId === identity.modelId, "Executor must lock the requested model id.");
      const prompt = request.messages.find((message) => message.role === "user")?.content ?? "";
      const taskId = prompt.replace("Execute private benchmark task ", "");
      requestCounts.set(taskId, (requestCounts.get(taskId) ?? 0) + 1);
      captured.set(taskId, request);
      const now = "2026-10-28T13:00:00.000Z";
      if (taskId === "chat-held-1" && requestCounts.get(taskId) === 1) {
        return {
          success: false,
          failure: {
            requestId: request.id,
            providerId: identity.providerId,
            modelId,
            retryable: true,
            code: "TEST_RETRYABLE",
            message: "Retryable provider failure.",
            metadata: { requestId: request.id, startedAt: now, completedAt: now, latencyMs: 1 },
          },
        };
      }
      if (taskId === "coding-held-1") {
        return {
          success: false,
          failure: {
            requestId: request.id,
            providerId: identity.providerId,
            modelId,
            retryable: false,
            code: "TEST_TERMINAL",
            message: "Terminal provider failure.",
            metadata: { requestId: request.id, startedAt: now, completedAt: now, latencyMs: 1 },
          },
        };
      }
      return {
        success: true,
        response: {
          requestId: request.id,
          model: identity,
          content: `pass-${taskId}`,
          toolCallProposals: [],
          usage: {
            elapsedMs: 2,
            tokensUsed: 12,
            iterationsUsed: 1,
            estimatedCost: 0,
            inputTokens: 8,
            outputTokens: 4,
          },
          metadata: {
            requestId: request.id,
            providerRequestId: `provider-${taskId}`,
            startedAt: now,
            completedAt: now,
            latencyMs: 2,
          },
        },
      };
    },
  };
  const providers = new ProviderAdapterRegistry();
  providers.register(adapter);
  const router = new AppAiRouter(providers, [identity.providerId]);
  let delays = 0;
  const executor = new PowerhouseBenchmarkExecutor(router, {
    now: () => new Date("2026-10-28T14:00:00.000Z"),
    delay: async () => { delays += 1; },
  });
  const store = new MemoryCheckpointStore();
  const manifest = createManifest();
  const execution = await executor.execute({
    runId: "run-live-001",
    providerId: identity.providerId,
    modelId: identity.modelId,
    manifest,
    checkpointStore: store,
    concurrency: 4,
    maxAttemptsPerTask: 2,
    retryDelayMs: 1,
    maxOutputTokens: 512,
    temperature: 0,
  });

  assert(execution.executedTasks === 140, "First run must execute every held-out task.");
  assert(execution.resumedTasks === 0, "First run must not report resumed tasks.");
  assert(execution.succeededTasks === 139, "Successful target responses must be preserved.");
  assert(execution.failedTasks === 1, "Terminal provider failures must remain explicit.");
  assert(execution.responses.length === 139, "Only successful locked-target responses may enter scoring.");
  assert(delays === 1, "Only a retryable failure may trigger the bounded retry delay.");
  assert(requestCounts.get("chat-held-1") === 2, "Retryable failure must receive one bounded retry.");
  assert(requestCounts.get("coding-held-1") === 1, "Terminal failure must not be retried.");
  assert(store.saves === 35, "Concurrent batches must be durably checkpointed.");

  const codingRequest = captured.get("coding-held-2");
  assert(Boolean(codingRequest), "Coding request must be captured.");
  assert(codingRequest?.requiredCapabilities.includes("coding") === true, "Domain capability policy must apply.");
  assert(codingRequest?.requiredCapabilities.includes("verification") === true, "Verification capability must apply.");
  assert(codingRequest?.temperature === 0, "Evaluation temperature must be deterministic.");
  assert(codingRequest?.allowToolProposals === false, "Benchmark execution must not authorize tools.");
  assert(
    codingRequest?.messages[0]?.content.includes("K.I.N.G.S. POWERHOUSE SERVICE DOMAIN") === true,
    "Server-owned domain instruction must precede the private task prompt.",
  );

  const benchmark = new PowerhouseBenchmarkRunner().run({
    modelId: identity.modelId,
    evaluatedAt: "2026-10-28T15:00:00.000Z",
    manifest,
    responses: execution.responses,
  });
  const coding = benchmark.domainBenchmarks.find((result) => result.domain === "coding");
  assert(coding?.passedTasks === 19, "Terminal route failure must remain in the scoring denominator.");
  assert(coding?.criticalFailures === 1, "Terminal critical route failure must block qualification.");
  assert(
    benchmark.domainBenchmarks.every((result) => result.evidenceReferences.some(
      (reference) => reference.startsWith("benchmark-route:sha256:"),
    )),
    "Every successful domain must preserve route evidence hashes.",
  );

  const callsBeforeResume = [...requestCounts.values()].reduce((sum, count) => sum + count, 0);
  const resumed = await executor.execute({
    runId: "run-live-001",
    providerId: identity.providerId,
    modelId: identity.modelId,
    manifest,
    checkpointStore: store,
    concurrency: 4,
    maxAttemptsPerTask: 2,
    retryDelayMs: 1,
  });
  const callsAfterResume = [...requestCounts.values()].reduce((sum, count) => sum + count, 0);
  assert(resumed.executedTasks === 0, "Resume must not rerun completed success or failure records.");
  assert(resumed.resumedTasks === 140, "Resume must account for every checkpointed task.");
  assert(callsAfterResume === callsBeforeResume, "Resume must not cherry-pick or rerun terminal results.");

  const tamperedStore = new MemoryCheckpointStore();
  tamperedStore.checkpoint = structuredClone(execution.checkpoint);
  const firstSuccess = tamperedStore.checkpoint.records.find((record) => record.status === "succeeded");
  if (!firstSuccess || firstSuccess.status !== "succeeded") throw new Error("Test fixture failure.");
  firstSuccess.output = "tampered-output";
  await expectFailure(() => executor.execute({
    runId: "run-live-001",
    providerId: identity.providerId,
    modelId: identity.modelId,
    manifest,
    checkpointStore: tamperedStore,
  }), "checkpoint evidence was altered");

  await expectFailure(() => executor.execute({
    runId: "run-live-001",
    providerId: identity.providerId,
    modelId: "different-model",
    manifest,
    checkpointStore: store,
  }), "checkpoint modelId does not match");
}

main()
  .then(() => console.log("Powerhouse live provider benchmark execution and resume: SUCCESS"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
