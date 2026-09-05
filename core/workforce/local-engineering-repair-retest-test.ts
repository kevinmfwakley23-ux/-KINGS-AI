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
  LocalProjectEngineeringReadinessAuthority,
} from "./local-project-engineering-readiness";

import {
  LocalEngineeringExecutionRunner,
} from "./local-engineering-execution-runner";

import {
  LocalEngineeringRecoveryBridge,
} from "./local-engineering-recovery-bridge";

import {
  LocalEngineeringRepairRetestAuthority,
} from "./local-engineering-repair-retest";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  await repairsRealRepositoryAndRebuildsBeforeRetest();
  await failedRepairCannotClaimVerification();
  await retryPlanCannotSmuggleSourceEdit();
  console.log("TREE-09 LOCAL ENGINEERING REPAIR/RETEST: SUCCESS");
}

async function repairsRealRepositoryAndRebuildsBeforeRetest(): Promise<void> {
  const root = await createRepairFixture("kings-repair-retest-real-");
  try {
    const { readiness, failure, recovery } = await failedExecution(root, "real-repair");
    assert(recovery.analysis.action === "repair", "Repair fixture must reach the governed repair action.");
    const editStep = recovery.repairPlan.steps.find((step) => step.strategy === "edit");
    assert(Boolean(editStep), "Repair plan must contain its governed edit step.");

    const result = await new LocalEngineeringRepairRetestAuthority().execute({
      initialReadiness: readiness,
      failureReport: failure,
      recovery,
      edit: {
        stepId: editStep!.id,
        projectId: readiness.execution.projectId,
        path: join(root, "src", "value.txt"),
        content: "fixed\n",
      },
      filePolicy: {
        allowedReadPaths: [root],
        allowedWritePaths: [root],
        maxFileBytes: 1024 * 1024,
      },
      timeoutMs: 30_000,
      completedAt: "2026-09-05T15:20:00.000Z",
    });

    assert(result.verified, "A correctly repaired repository must finish with full verified recovery.");
    assert(result.repairExecution.status === "completed", "Governed inspect/edit/retest plan must complete.");
    assert(result.repairExecution.verified, "Repair authority must record successful retest evidence.");
    assert(result.verification?.status === "completed", "Fresh repository execution must complete after repair.");
    assert(result.verification?.evidence.length === 2, "Full verification must re-run both build and test, not only the previously failed test.");
    assert(result.verification?.evidence[0].operation === "build", "Post-repair verification must restart at build.");
    assert(result.verification?.evidence[1].operation === "test", "Post-repair verification must finish with test.");

    const buildCount = Number((await readFile(join(root, "build-count.txt"), "utf8")).trim());
    assert(buildCount === 2, "Build must execute once before failure and again after the source repair, proving stale artifacts are not accepted.");
    assert((await readFile(join(root, "dist-value.txt"), "utf8")).trim() === "fixed", "Rebuilt artifact must contain the repaired source value.");
    assert((await readFile(join(root, "test-proof.txt"), "utf8")).trim() === "verified-after-rebuild", "Real test must observe the rebuilt repaired artifact.");
    console.log("09.REPAIR real failure -> governed edit -> full build/test verification: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function failedRepairCannotClaimVerification(): Promise<void> {
  const root = await createRepairFixture("kings-repair-retest-fail-");
  try {
    const { readiness, failure, recovery } = await failedExecution(root, "failed-repair");
    const editStep = recovery.repairPlan.steps.find((step) => step.strategy === "edit");
    assert(Boolean(editStep), "Failure fixture must receive a repair edit step.");

    const result = await new LocalEngineeringRepairRetestAuthority().execute({
      initialReadiness: readiness,
      failureReport: failure,
      recovery,
      edit: {
        stepId: editStep!.id,
        projectId: readiness.execution.projectId,
        path: join(root, "src", "value.txt"),
        content: "still-broken\n",
      },
      filePolicy: {
        allowedReadPaths: [root],
        allowedWritePaths: [root],
        maxFileBytes: 1024 * 1024,
      },
      timeoutMs: 30_000,
    });

    assert(!result.verified, "A repair whose full repository verification still fails must never be called verified.");
    assert(result.repairExecution.status === "failed", "Failed retest must fail the repair execution.");
    assert(result.verification?.status === "failed", "Fresh repository execution must preserve the post-repair failure.");
    assert(result.verification?.failedStepId?.includes("step-2") === true, "The failed post-repair test step must remain identified.");
    assert(
      result.repairExecution.stepResults.at(-1)?.output.includes("Full repository verification failed after recovery.") === true,
      "Repair evidence must explain that full verification failed.",
    );
    const buildCount = Number((await readFile(join(root, "build-count.txt"), "utf8")).trim());
    assert(buildCount === 2, "Even an unsuccessful repair must prove that a clean post-edit build was attempted.");
    console.log("09.REPAIR failed correction remains unverified with real diagnostics: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function retryPlanCannotSmuggleSourceEdit(): Promise<void> {
  const root = await createRepairFixture("kings-repair-retest-retry-");
  try {
    const readiness = await readinessFor(root, "retry-no-edit");
    const failure = new LocalEngineeringExecutionRunner().execute({
      readiness,
      authorized: true,
      timeoutMs: 30_000,
    });
    assert(failure.status === "failed", "Retry fixture must begin from a real failed repository test.");

    const recovery = new LocalEngineeringRecoveryBridge().analyze({
      report: failure,
      attemptNumber: 1,
      policy: { maxRetries: 2, allowRepair: true },
      completedAt: "2026-09-05T15:21:00.000Z",
    });
    assert(recovery.analysis.action === "retry", "First failure within retry budget must not authorize repair editing.");
    assert(!recovery.repairPlan.steps.some((step) => step.strategy === "edit"), "Retry plan must contain no edit authorization.");

    let rejected = false;
    try {
      await new LocalEngineeringRepairRetestAuthority().execute({
        initialReadiness: readiness,
        failureReport: failure,
        recovery,
        edit: {
          stepId: "smuggled-edit-step",
          projectId: readiness.execution.projectId,
          path: join(root, "src", "value.txt"),
          content: "fixed\n",
        },
        filePolicy: {
          allowedReadPaths: [root],
          allowedWritePaths: [root],
          maxFileBytes: 1024 * 1024,
        },
      });
    } catch (error) {
      rejected = /does not authorize source editing/i.test(error instanceof Error ? error.message : String(error));
    }
    assert(rejected, "Retry-only recovery must reject an injected source edit before mutation.");
    assert((await readFile(join(root, "src", "value.txt"), "utf8")).trim() === "broken", "Rejected edit must leave source unchanged.");
    console.log("09.REPAIR retry policy cannot smuggle unauthorized source mutation: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function failedExecution(
  root: string,
  id: string,
): Promise<{
  readiness: Awaited<ReturnType<LocalProjectEngineeringReadinessAuthority["inspect"]>>;
  failure: ReturnType<LocalEngineeringExecutionRunner["execute"]>;
  recovery: ReturnType<LocalEngineeringRecoveryBridge["analyze"]>;
}> {
  const readiness = await readinessFor(root, id);
  const failure = new LocalEngineeringExecutionRunner().execute({
    readiness,
    authorized: true,
    timeoutMs: 30_000,
  });
  assert(failure.status === "failed", "Repair fixture must preserve a real failing verification result.");
  assert(failure.evidence.length === 2, "Initial fixture must build successfully before its failing test.");
  assert(failure.evidence[0].operation === "build" && failure.evidence[0].succeeded, "Initial build must succeed.");
  assert(failure.evidence[1].operation === "test" && !failure.evidence[1].succeeded, "Initial test must fail.");
  assert(failure.evidence[1].stderr.includes("expected fixed"), "Initial real test diagnostics must reach local execution evidence.");

  const recovery = new LocalEngineeringRecoveryBridge().analyze({
    report: failure,
    attemptNumber: 1,
    policy: { maxRetries: 1, allowRepair: true },
    completedAt: "2026-09-05T15:19:00.000Z",
  });
  return { readiness, failure, recovery };
}

async function readinessFor(
  root: string,
  id: string,
) {
  const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
    id,
    projectPath: root,
    requiredOperations: ["build", "test"],
    executionId: `${id}-execution`,
  });
  assert(
    readiness.execution.status === "ready",
    `Repair fixture must pass non-destructive readiness: ${readiness.blockedReasons.join(" | ")}`,
  );
  return readiness;
}

async function createRepairFixture(
  prefix: string,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "value.txt"), "broken\n");
  await writeFile(
    join(root, "build.cjs"),
    [
      "const fs = require('node:fs');",
      "const source = fs.readFileSync('src/value.txt', 'utf8').trim();",
      "const count = fs.existsSync('build-count.txt') ? Number(fs.readFileSync('build-count.txt', 'utf8').trim()) : 0;",
      "fs.writeFileSync('build-count.txt', String(count + 1));",
      "fs.writeFileSync('dist-value.txt', source + '\\n');",
      "console.log('BUILD_VALUE=' + source);",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(root, "test.cjs"),
    [
      "const fs = require('node:fs');",
      "const value = fs.readFileSync('dist-value.txt', 'utf8').trim();",
      "if (value !== 'fixed') { console.error('expected fixed but rebuilt artifact contained ' + value); process.exit(7); }",
      "fs.writeFileSync('test-proof.txt', 'verified-after-rebuild\\n');",
      "console.log('TEST_VALUE_OK');",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "kings-local-repair-retest-fixture",
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
      name: "kings-local-repair-retest-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "kings-local-repair-retest-fixture",
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
