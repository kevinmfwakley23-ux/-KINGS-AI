import {
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
  LocalCodingWriteBridge,
  type AuthorizedLocalCodingWriteProposal,
} from "./local-coding-write-bridge";

import {
  LocalEngineeringExecutionRunner,
} from "./local-engineering-execution-runner";

import {
  LocalEngineeringRecoveryBridge,
} from "./local-engineering-recovery-bridge";

import {
  LocalEngineeringRecoveryCycle,
} from "./local-engineering-recovery-cycle";

import {
  LocalProjectEngineeringReadinessAuthority,
} from "./local-project-engineering-readiness";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  await repairsRealFailedRepositoryAndRetests();
  await blocksRepairWhenNoGovernedProposalExists();
  console.log("TREE-09 LOCAL FAILURE -> REPAIR -> RETEST CYCLE: SUCCESS");
}

async function repairsRealFailedRepositoryAndRetests(): Promise<void> {
  const root = await createFailingProject("kings-recovery-cycle-real-");
  try {
    const projectId = "local-recovery-cycle-project";
    const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
      id: projectId,
      projectPath: root,
      requiredOperations: ["build", "test"],
      executionId: "local-recovery-cycle-execution",
    });
    assert(readiness.execution.status === "ready", "Fixture must pass readiness before real execution.");

    const runner = new LocalEngineeringExecutionRunner();
    const initialReport = runner.execute({
      readiness,
      authorized: true,
      timeoutMs: 30_000,
    });
    assert(initialReport.status === "failed", "Fixture test must fail before repair.");
    assert(initialReport.evidence.at(-1)?.exitCode === 7, "Initial real test failure must preserve exit code 7.");

    const policy = {
      maxRetries: 0,
      allowRepair: true,
    };
    const completedAt = "2026-09-05T15:00:00Z";
    const recovery = new LocalEngineeringRecoveryBridge().analyze({
      report: initialReport,
      attemptNumber: 1,
      policy,
      completedAt,
    });
    const repairStepId = recovery.repairPlan.steps.find(
      (step) => step.strategy === "edit",
    )?.id;
    assert(Boolean(repairStepId), "Repair fixture must derive the governed edit-step identity from recovery planning.");

    const writer = new LocalCodingWriteBridge(
      new EngineeringRepairEditor(
        new ControlledFileEditor({
          allowedReadPaths: [root],
          allowedWritePaths: [root],
          maxFileBytes: 64 * 1024,
        }),
      ),
    );
    const cycle = new LocalEngineeringRecoveryCycle(writer, runner);
    const proposal = repairProposal(
      projectId,
      repairStepId ?? "missing-repair-step",
    );

    const result = await cycle.execute({
      readiness,
      report: initialReport,
      attemptNumber: 1,
      policy,
      authorized: true,
      workspaceRoot: root,
      proposal,
      timeoutMs: 30_000,
      completedAt,
    });

    assert(result.initialRecovery.analysis.action === "repair", "Verified failure must enter governed repair action.");
    assert(result.writeResult?.writes.length === 1, "Exactly one governed repository repair write must be recorded.");
    assert(result.retestReport?.status === "completed", "Repository-native build/test verification must rerun after repair.");
    assert(result.finalRecovery?.analysis.action === "complete", "Successful real retest must terminate recovery.");
    assert(result.status === "completed" && result.verified, "Recovery cycle must report verified completion only after green retest.");

    const repaired = await readFile(join(root, "test.cjs"), "utf8");
    assert(repaired.includes("RECOVERY_RETEST_OK"), "Governed edit must write the authorized replacement content.");
    const proof = await readFile(join(root, "retest-proof.txt"), "utf8");
    assert(proof.trim() === "verified", "Real retest command must execute the repaired repository code.");
    console.log("09.RECOVERY-CYCLE real failure -> governed write -> real retest: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function blocksRepairWhenNoGovernedProposalExists(): Promise<void> {
  const root = await createFailingProject("kings-recovery-cycle-block-");
  try {
    const projectId = "local-recovery-cycle-block-project";
    const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
      id: projectId,
      projectPath: root,
      requiredOperations: ["build", "test"],
      executionId: "local-recovery-cycle-block-execution",
    });
    const runner = new LocalEngineeringExecutionRunner();
    const initialReport = runner.execute({ readiness, authorized: true, timeoutMs: 30_000 });
    assert(initialReport.status === "failed", "Block fixture must begin from a real failed test.");

    const writer = new LocalCodingWriteBridge(
      new EngineeringRepairEditor(
        new ControlledFileEditor({
          allowedReadPaths: [root],
          allowedWritePaths: [root],
          maxFileBytes: 64 * 1024,
        }),
      ),
    );
    const result = await new LocalEngineeringRecoveryCycle(writer, runner).execute({
      readiness,
      report: initialReport,
      attemptNumber: 1,
      policy: { maxRetries: 0, allowRepair: true },
      authorized: true,
      workspaceRoot: root,
    });

    assert(result.status === "blocked" && !result.verified, "Repair must fail closed without an explicit governed proposal.");
    assert(/proposal is required/i.test(result.failureReason ?? ""), "Blocked result must explain the missing repair proposal.");
    assert(result.retestReport === undefined, "No retest may run after a repair is blocked before editing.");
    const unchanged = await readFile(join(root, "test.cjs"), "utf8");
    assert(unchanged.includes("RECOVERY_TEST_FAILED"), "Missing proposal must leave repository content unchanged.");
    console.log("09.RECOVERY-CYCLE missing proposal blocks mutation and retest: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createFailingProject(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await writeFile(
    join(root, "build.cjs"),
    "require('node:fs').writeFileSync('build-proof.txt', 'built\\n'); console.log('RECOVERY_BUILD_OK');\n",
  );
  await writeFile(
    join(root, "test.cjs"),
    "console.error('RECOVERY_TEST_FAILED'); process.exit(7);\n",
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "kings-recovery-cycle-fixture",
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
      name: "kings-recovery-cycle-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "kings-recovery-cycle-fixture",
          version: "1.0.0",
        },
      },
    }),
  );
  return root;
}

function repairProposal(
  projectId: string,
  repairStepId: string,
): AuthorizedLocalCodingWriteProposal {
  return {
    taskId: repairStepId,
    missionId: projectId,
    changes: [
      {
        path: "test.cjs",
        operation: "replace",
        content: [
          "const fs = require('node:fs');",
          "if (!fs.existsSync('build-proof.txt')) { console.error('build proof missing'); process.exit(9); }",
          "fs.writeFileSync('retest-proof.txt', 'verified\\n');",
          "console.log('RECOVERY_RETEST_OK');",
          "",
        ].join("\n"),
      },
    ],
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});