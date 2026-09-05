import {
  access,
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
  ControlledFileEditor,
} from "./file-editor";

import {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import {
  EngineeringWorkspaceAuthority,
} from "./engineering-workspace";

import {
  LocalCodingWriteBridge,
} from "./local-coding-write-bridge";

import {
  LocalEngineeringExecutionRunner,
} from "./local-engineering-execution-runner";

import {
  LocalEngineeringRecoveryCycle,
} from "./local-engineering-recovery-cycle";

import {
  LocalModelEngineeringRepairCoordinator,
  type LocalRepairModelExecutionPort,
} from "./local-model-engineering-repair-coordinator";

import {
  LocalProjectEngineeringReadinessAuthority,
} from "./local-project-engineering-readiness";

import type {
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

class RepairModel implements LocalRepairModelExecutionPort {
  calls = 0;

  async execute(
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    this.calls += 1;
    return modelResult(
      request,
      JSON.stringify({
        id: `proposal-${request.taskId}`,
        taskId: request.taskId,
        missionId: request.missionId,
        summary: "Replace the failing test with the smallest verified repair.",
        changes: [
          {
            path: "test.cjs",
            operation: "replace",
            content: [
              "const fs = require('node:fs');",
              "if (!fs.existsSync('build-proof.txt')) { console.error('missing build proof'); process.exit(9); }",
              "fs.writeFileSync('ai-repair-proof.txt', 'verified\\n');",
              "console.log('AI_REPAIR_RETEST_OK');",
              "",
            ].join("\n"),
          },
        ],
      }),
    );
  }
}

class TraversalModel implements LocalRepairModelExecutionPort {
  calls = 0;

  async execute(
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    this.calls += 1;
    return modelResult(
      request,
      JSON.stringify({
        id: `proposal-${request.taskId}`,
        taskId: request.taskId,
        missionId: request.missionId,
        summary: "Attempt an unauthorized traversal.",
        changes: [
          {
            path: "../escape.cjs",
            operation: "replace",
            content: "console.log('unsafe');\n",
          },
        ],
      }),
    );
  }
}

async function main(): Promise<void> {
  await realFailureToAiRepairToGreenRetest();
  await unsafeModelProposalFailsClosed();
  console.log("TREE-06/09 REAL AI REPAIR COORDINATOR: SUCCESS");
}

async function realFailureToAiRepairToGreenRetest(): Promise<void> {
  const root = await createFailingProject("kings-ai-repair-coordinator-");
  try {
    const projectId = "ai-repair-project";
    const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
      id: projectId,
      projectPath: root,
      requiredOperations: ["build", "test"],
      executionId: "ai-repair-execution",
    });
    assert(readiness.execution.status === "ready", "Fixture repository must pass readiness before execution.");

    const runner = new LocalEngineeringExecutionRunner();
    const failedReport = runner.execute({
      readiness,
      authorized: true,
      timeoutMs: 30_000,
    });
    assert(failedReport.status === "failed", "Fixture repository must produce a real failed validation report.");
    assert(failedReport.evidence.at(-1)?.exitCode === 7, "Real initial failure exit code must be preserved.");

    const workspace = new EngineeringWorkspaceAuthority().create({
      id: "workspace-ai-repair",
      projectId,
      rootPath: root,
      allowedPaths: ["test.cjs"],
      allowedLanguages: ["javascript"],
      allowedOperations: ["create"],
    });
    const writer = new LocalCodingWriteBridge(
      new EngineeringRepairEditor(
        new ControlledFileEditor({
          allowedReadPaths: [root],
          allowedWritePaths: [root],
          maxFileBytes: 64 * 1024,
        }),
      ),
    );
    const model = new RepairModel();
    const coordinator = new LocalModelEngineeringRepairCoordinator(
      model,
      new LocalEngineeringRecoveryCycle(writer, runner),
    );
    const sourceBefore = await readFile(join(root, "test.cjs"), "utf8");

    const result = await coordinator.execute({
      readiness,
      report: failedReport,
      workspace,
      objective: "Repair the verified test failure with the smallest change and preserve the build proof requirement.",
      allowedPaths: ["test.cjs"],
      contextFiles: [
        {
          path: "test.cjs",
          content: sourceBefore,
        },
      ],
      attemptNumber: 1,
      policy: {
        maxRetries: 0,
        allowRepair: true,
      },
      authorized: true,
      timeoutMs: 30_000,
      completedAt: "2026-09-05T17:00:00.000Z",
    });

    assert(model.calls === 1, "Repair action must invoke the repair model exactly once.");
    assert(result.modelInvoked, "Coordinator result must record the model invocation.");
    assert(result.proposal?.changes.length === 1, "Strictly parsed model output must become one authorized workspace repair.");
    assert(result.proposal?.changes[0].language === "javascript", "Workspace authority must independently resolve the repair language.");
    assert(result.cycle.writeResult?.writes.length === 1, "Authorized AI proposal must pass through the rollback-safe writer.");
    assert(result.cycle.retestReport?.status === "completed", "Repository-native validation must rerun after the AI repair.");
    assert(result.status === "completed" && result.verified, "AI repair must be considered complete only after a green real retest.");
    assert((await readFile(join(root, "ai-repair-proof.txt"), "utf8")).trim() === "verified", "Repaired test must execute and create real proof during retest.");
    const repaired = await readFile(join(root, "test.cjs"), "utf8");
    assert(repaired.includes("AI_REPAIR_RETEST_OK"), "Authorized full-file replacement must be persisted.");
    console.log("09.AI-REPAIR real failure -> model -> governed write -> real retest: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function unsafeModelProposalFailsClosed(): Promise<void> {
  const root = await createFailingProject("kings-ai-repair-block-");
  try {
    const projectId = "ai-repair-block-project";
    const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
      id: projectId,
      projectPath: root,
      requiredOperations: ["build", "test"],
      executionId: "ai-repair-block-execution",
    });
    const runner = new LocalEngineeringExecutionRunner();
    const failedReport = runner.execute({ readiness, authorized: true, timeoutMs: 30_000 });
    assert(failedReport.status === "failed", "Adversarial fixture must start from a real failure.");

    const workspace = new EngineeringWorkspaceAuthority().create({
      id: "workspace-ai-repair-block",
      projectId,
      rootPath: root,
      allowedPaths: ["test.cjs"],
      allowedLanguages: ["javascript"],
      allowedOperations: ["create"],
    });
    const writer = new LocalCodingWriteBridge(
      new EngineeringRepairEditor(
        new ControlledFileEditor({
          allowedReadPaths: [root],
          allowedWritePaths: [root],
          maxFileBytes: 64 * 1024,
        }),
      ),
    );
    const model = new TraversalModel();
    const before = await readFile(join(root, "test.cjs"), "utf8");
    const coordinator = new LocalModelEngineeringRepairCoordinator(
      model,
      new LocalEngineeringRecoveryCycle(writer, runner),
    );

    const result = await coordinator.execute({
      readiness,
      report: failedReport,
      workspace,
      objective: "Repair the test failure.",
      allowedPaths: ["test.cjs"],
      contextFiles: [{ path: "test.cjs", content: before }],
      attemptNumber: 1,
      policy: { maxRetries: 0, allowRepair: true },
      authorized: true,
      timeoutMs: 30_000,
      completedAt: "2026-09-05T17:10:00.000Z",
    });

    assert(model.calls === 1, "Adversarial proposal test must exercise the model boundary.");
    assert(result.status === "blocked" && !result.verified, "Unsafe model proposal must fail closed.");
    assert(/rejected before any repository mutation/i.test(result.failureReason ?? ""), "Blocked result must identify pre-mutation proposal rejection.");
    assert((await readFile(join(root, "test.cjs"), "utf8")) === before, "Rejected model output must leave the authorized source file byte-for-byte unchanged.");
    assert(!(await exists(join(root, "escape.cjs"))), "Traversal target must never be created outside the workspace.");
    assert(result.cycle.writeResult === undefined, "Rejected model output must never reach the repository writer.");
    console.log("09.AI-REPAIR traversal proposal blocked before repository mutation: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createFailingProject(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await writeFile(
    join(root, "build.cjs"),
    "require('node:fs').writeFileSync('build-proof.txt', 'built\\n'); console.log('AI_REPAIR_BUILD_OK');\n",
    "utf8",
  );
  await writeFile(
    join(root, "test.cjs"),
    "console.error('AI_REPAIR_TEST_FAILED'); process.exit(7);\n",
    "utf8",
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "kings-ai-repair-fixture",
      version: "1.0.0",
      private: true,
      packageManager: "npm@10.0.0",
      scripts: {
        build: "node build.cjs",
        test: "node test.cjs",
      },
    }),
    "utf8",
  );
  await writeFile(
    join(root, "package-lock.json"),
    JSON.stringify({
      name: "kings-ai-repair-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "kings-ai-repair-fixture",
          version: "1.0.0",
        },
      },
    }),
    "utf8",
  );
  return root;
}

function modelResult(
  request: ModelExecutionRequest,
  content: string,
): ModelExecutionResult {
  return {
    success: true,
    response: {
      requestId: request.id,
      model: {
        providerId: "test-repair-provider",
        modelId: "test-repair-model",
        displayName: "Test Repair Model",
        providerKind: "internal-local",
        capabilities: ["coding", "debugging", "recovery"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindowTokens: 32_768,
        supportsToolCalling: false,
        supportsStructuredOutput: false,
        available: true,
      },
      content,
      toolCallProposals: [],
      usage: {
        elapsedMs: 5,
        tokensUsed: 20,
        iterationsUsed: 1,
        inputTokens: 10,
        outputTokens: 10,
        estimatedCost: 0,
      },
      metadata: {
        requestId: request.id,
        startedAt: "2026-09-05T17:00:00.000Z",
        completedAt: "2026-09-05T17:00:00.005Z",
        latencyMs: 5,
      },
    },
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
