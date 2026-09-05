import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  EngineeringWorkspaceAuthority,
} from "./engineering-workspace";

import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelIdentity,
} from "./model-interface";

import {
  LocalEngineeringExecutionRunner,
} from "./local-engineering-execution-runner";

import {
  LocalEngineeringRecoveryBridge,
} from "./local-engineering-recovery-bridge";

import {
  LocalModelRepairCycleAuthority,
} from "./local-model-repair-cycle";

import {
  LocalProjectEngineeringReadinessAuthority,
} from "./local-project-engineering-readiness";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

interface ModelProposal {
  readonly summary: string;
  readonly path: string;
  readonly operation: "replace" | "create";
  readonly content: string;
}

class DeterministicRepairModel
  implements IntelligenceModel {
  readonly identity: ModelIdentity = {
    providerId: "internal-test-repair",
    modelId: "deterministic-repair-fixture",
    displayName: "Deterministic Repair Fixture",
    providerKind: "internal-local",
    capabilities: [
      "coding",
      "debugging",
      "recovery",
    ],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindowTokens: 16_384,
    supportsToolCalling: false,
    supportsStructuredOutput: true,
    available: true,
  };

  calls = 0;
  lastRequest?: ModelExecutionRequest;

  constructor(
    private readonly proposal: ModelProposal,
  ) {}

  canHandle(
    request: ModelExecutionRequest,
  ): boolean {
    return request.requiredCapabilities.every((capability) =>
      this.identity.capabilities.includes(capability),
    );
  }

  async execute(
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    this.calls += 1;
    this.lastRequest = request;
    const startedAt = "2026-09-05T15:35:00.000Z";
    const completedAt = "2026-09-05T15:35:00.001Z";
    return {
      success: true,
      response: {
        requestId: request.id,
        model: this.identity,
        content: JSON.stringify(this.proposal),
        toolCallProposals: [],
        usage: {
          elapsedMs: 1,
          tokensUsed: 32,
          iterationsUsed: 1,
          estimatedCost: 0,
          inputTokens: 24,
          outputTokens: 8,
        },
        metadata: {
          requestId: request.id,
          startedAt,
          completedAt,
          latencyMs: 1,
        },
      },
    };
  }
}

async function main(): Promise<void> {
  await modelRepairsRealRepositoryAndFullVerificationPasses();
  await modelCannotRedirectRepairToUnauthorizedPath();
  await retryPolicyBlocksModelBeforeInferenceAndMutation();
  await modelCannotUpgradeRepairIntoFileCreation();
  console.log("TREE-09 MODEL-DRIVEN LOCAL REPAIR CYCLE: SUCCESS");
}

async function modelRepairsRealRepositoryAndFullVerificationPasses(): Promise<void> {
  const root = await createFixture("kings-model-repair-success-");
  try {
    const { readiness, failure, recovery } = await failedRepairState(
      root,
      "model-repair-success",
      1,
    );
    const workspace = workspaceFor(root, readiness.execution.projectId);
    const model = new DeterministicRepairModel({
      summary: "Replace the bad source value that produced the failing rebuilt artifact.",
      path: "src/value.js",
      operation: "replace",
      content: 'module.exports = "fixed";\n',
    });

    const result = await new LocalModelRepairCycleAuthority().execute({
      initialReadiness: readiness,
      failureReport: failure,
      recovery,
      workspace,
      targetPath: "src/value.js",
      model,
      filePolicy: {
        allowedReadPaths: [root],
        allowedWritePaths: [join(root, "src")],
        maxFileBytes: 128 * 1024,
      },
      maxSourceBytes: 128 * 1024,
      maxOutputTokens: 2048,
      timeoutMs: 30_000,
      completedAt: "2026-09-05T15:36:00.000Z",
    });

    assert(result.verified, "The model-proposed repair must be verified only after the fresh full repository run succeeds.");
    assert(model.calls === 1, "Exactly one governed model inference is expected for the repair proposal.");
    assert(result.proposal.providerId === model.identity.providerId, "Repair evidence must preserve the provider identity.");
    assert(result.proposal.modelId === model.identity.modelId, "Repair evidence must preserve the model identity.");
    assert(result.proposal.targetPath === "src/value.js", "Repair evidence must preserve the exact authorized path.");
    assert(result.recovery.verification?.status === "completed", "Post-repair repository verification must complete.");
    assert(result.recovery.verification?.evidence.length === 2, "Post-repair verification must execute both build and test.");
    assert(result.recovery.verification?.evidence[0].operation === "build", "Fresh verification must restart at build.");
    assert(result.recovery.verification?.evidence[1].operation === "test", "Fresh verification must finish at test.");
    assert((await readFile(join(root, "src", "value.js"), "utf8")).trim() === 'module.exports = "fixed";', "The governed edit must write the model's exact authorized replacement.");
    assert((await readFile(join(root, "dist-value.txt"), "utf8")).trim() === "fixed", "Fresh build output must contain the repaired source value.");
    assert((await readFile(join(root, "test-proof.txt"), "utf8")).trim() === "verified-after-model-repair", "Real tests must prove the repaired rebuilt artifact.");
    assert(Number((await readFile(join(root, "build-count.txt"), "utf8")).trim()) === 2, "The build must run once before failure and again after the model repair.");

    const prompt = model.lastRequest?.messages.map((message) => message.content).join("\n") ?? "";
    assert(prompt.includes("expected fixed but rebuilt artifact contained broken"), "Verified test diagnostics must be supplied to the repair model.");
    assert(prompt.includes('module.exports = "broken";'), "The actual current authorized source file must be supplied to the repair model.");
    assert(prompt.includes("EXACT TARGET PATH: src/value.js"), "The model prompt must bind the exact authorized target path.");
    assert(model.lastRequest?.allowToolProposals === false, "Repair inference must not receive an independent tool-execution channel.");
    console.log("09.MODEL real diagnostics + real source -> exact repair -> rebuild/test: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function modelCannotRedirectRepairToUnauthorizedPath(): Promise<void> {
  const root = await createFixture("kings-model-repair-path-block-");
  try {
    const { readiness, failure, recovery } = await failedRepairState(
      root,
      "model-repair-path-block",
      1,
    );
    const model = new DeterministicRepairModel({
      summary: "Attempt to weaken the verification instead of repairing source.",
      path: "test.cjs",
      operation: "replace",
      content: "process.exit(0);\n",
    });
    const originalSource = await readFile(join(root, "src", "value.js"), "utf8");
    const originalTest = await readFile(join(root, "test.cjs"), "utf8");

    let rejected = false;
    try {
      await new LocalModelRepairCycleAuthority().execute({
        initialReadiness: readiness,
        failureReport: failure,
        recovery,
        workspace: workspaceFor(root, readiness.execution.projectId),
        targetPath: "src/value.js",
        model,
        filePolicy: {
          allowedReadPaths: [root],
          allowedWritePaths: [join(root, "src")],
          maxFileBytes: 128 * 1024,
        },
      });
    } catch (error) {
      rejected = /unauthorized path/i.test(
        error instanceof Error ? error.message : String(error),
      );
    }

    assert(rejected, "A model proposal that redirects from source to the test must be rejected.");
    assert(model.calls === 1, "The redirect must be rejected after inspecting the model proposal, not silently rewritten.");
    assert(await readFile(join(root, "src", "value.js"), "utf8") === originalSource, "Unauthorized model redirection must not mutate source.");
    assert(await readFile(join(root, "test.cjs"), "utf8") === originalTest, "Unauthorized model redirection must never mutate tests.");
    assert(Number((await readFile(join(root, "build-count.txt"), "utf8")).trim()) === 1, "Rejected model output must not start a second repository verification.");
    console.log("09.MODEL path redirection to verification code blocked before mutation: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function retryPolicyBlocksModelBeforeInferenceAndMutation(): Promise<void> {
  const root = await createFixture("kings-model-repair-retry-block-");
  try {
    const { readiness, failure, recovery } = await failedRepairState(
      root,
      "model-repair-retry-block",
      2,
    );
    assert(recovery.analysis.action === "retry", "A first failure inside a two-attempt retry budget must not authorize source repair.");
    const model = new DeterministicRepairModel({
      summary: "This inference must never run.",
      path: "src/value.js",
      operation: "replace",
      content: 'module.exports = "fixed";\n',
    });
    const originalSource = await readFile(join(root, "src", "value.js"), "utf8");

    let rejected = false;
    try {
      await new LocalModelRepairCycleAuthority().execute({
        initialReadiness: readiness,
        failureReport: failure,
        recovery,
        workspace: workspaceFor(root, readiness.execution.projectId),
        targetPath: "src/value.js",
        model,
        filePolicy: {
          allowedReadPaths: [root],
          allowedWritePaths: [join(root, "src")],
          maxFileBytes: 128 * 1024,
        },
      });
    } catch (error) {
      rejected = /has not authorized source repair/i.test(
        error instanceof Error ? error.message : String(error),
      );
    }

    assert(rejected, "Retry-only policy must block model-driven source repair.");
    assert(model.calls === 0, "K.I.N.G.S. must reject unauthorized repair before spending any model inference.");
    assert(await readFile(join(root, "src", "value.js"), "utf8") === originalSource, "Retry-only policy must leave source unchanged.");
    console.log("09.MODEL retry policy blocks inference and source mutation before repair authorization: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function modelCannotUpgradeRepairIntoFileCreation(): Promise<void> {
  const root = await createFixture("kings-model-repair-create-block-");
  try {
    const { readiness, failure, recovery } = await failedRepairState(
      root,
      "model-repair-create-block",
      1,
    );
    const model = new DeterministicRepairModel({
      summary: "Attempt to expand repair authority into a create operation.",
      path: "src/value.js",
      operation: "create",
      content: 'module.exports = "fixed";\n',
    });
    const originalSource = await readFile(join(root, "src", "value.js"), "utf8");

    let rejected = false;
    try {
      await new LocalModelRepairCycleAuthority().execute({
        initialReadiness: readiness,
        failureReport: failure,
        recovery,
        workspace: workspaceFor(root, readiness.execution.projectId),
        targetPath: "src/value.js",
        model,
        filePolicy: {
          allowedReadPaths: [root],
          allowedWritePaths: [join(root, "src")],
          maxFileBytes: 128 * 1024,
        },
      });
    } catch (error) {
      rejected = /only replace operations/i.test(
        error instanceof Error ? error.message : String(error),
      );
    }

    assert(rejected, "The model must not upgrade bounded repair into new-file/create authority.");
    assert(await readFile(join(root, "src", "value.js"), "utf8") === originalSource, "Rejected create escalation must not mutate the authorized target.");
    assert(Number((await readFile(join(root, "build-count.txt"), "utf8")).trim()) === 1, "Rejected create escalation must not start a fresh repository run.");
    console.log("09.MODEL create-authority escalation blocked before mutation: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function failedRepairState(
  root: string,
  projectId: string,
  maxRetries: number,
) {
  const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
    id: projectId,
    projectPath: root,
    requiredOperations: ["build", "test"],
    executionId: `${projectId}-execution`,
  });
  assert(readiness.execution.status === "ready", `Fixture readiness must pass: ${readiness.blockedReasons.join(" | ")}`);

  const failure = new LocalEngineeringExecutionRunner().execute({
    readiness,
    authorized: true,
    timeoutMs: 30_000,
  });
  assert(failure.status === "failed", "Fixture repository must produce a real failed verification.");
  assert(failure.evidence.length === 2, "Fixture must build before the test fails.");
  assert(failure.evidence[0].operation === "build" && failure.evidence[0].succeeded, "Initial build must succeed.");
  assert(failure.evidence[1].operation === "test" && !failure.evidence[1].succeeded, "Initial test must fail.");

  const recovery = new LocalEngineeringRecoveryBridge().analyze({
    report: failure,
    attemptNumber: 1,
    policy: { maxRetries, allowRepair: true },
    completedAt: "2026-09-05T15:34:00.000Z",
  });
  return { readiness, failure, recovery };
}

function workspaceFor(
  root: string,
  projectId: string,
) {
  return new EngineeringWorkspaceAuthority().create({
    id: `${projectId}-workspace`,
    projectId,
    rootPath: root,
    allowedPaths: ["src"],
    allowedLanguages: ["javascript"],
    allowedOperations: ["create"],
  });
}

async function createFixture(
  prefix: string,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "value.js"), 'module.exports = "broken";\n');
  await writeFile(
    join(root, "build.cjs"),
    [
      "const fs = require('node:fs');",
      "const value = require('./src/value.js');",
      "const count = fs.existsSync('build-count.txt') ? Number(fs.readFileSync('build-count.txt', 'utf8').trim()) : 0;",
      "fs.writeFileSync('build-count.txt', String(count + 1));",
      "fs.writeFileSync('dist-value.txt', value + '\\n');",
      "console.log('BUILD_VALUE=' + value);",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(root, "test.cjs"),
    [
      "const fs = require('node:fs');",
      "const value = fs.readFileSync('dist-value.txt', 'utf8').trim();",
      "if (value !== 'fixed') { console.error('expected fixed but rebuilt artifact contained ' + value); process.exit(7); }",
      "fs.writeFileSync('test-proof.txt', 'verified-after-model-repair\\n');",
      "console.log('MODEL_REPAIR_TEST_OK');",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "kings-model-repair-fixture",
      version: "1.0.0",
      private: true,
      packageManager: "npm@10.0.0",
      scripts: {
        build: "node build.cjs",
        test: "node test.cjs",
      },
    }),
  );
  await writeFile(
    join(root, "package-lock.json"),
    JSON.stringify({
      name: "kings-model-repair-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "kings-model-repair-fixture",
          version: "1.0.0",
        },
      },
    }),
  );
  return root;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
