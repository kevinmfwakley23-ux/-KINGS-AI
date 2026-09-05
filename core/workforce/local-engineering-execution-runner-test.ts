import {
  access,
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
  type LocalEngineeringProcessResult,
  type LocalEngineeringProcessRunner,
} from "./local-engineering-execution-runner";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  await executesRealVerifiedBuildThenTest();
  await stopsAtFirstFailedVerifiedStep();
  await requiresGovernedAuthorization();
  console.log("TREE-09 LOCAL ENGINEERING BUILD/TEST EXECUTION: SUCCESS");
}

async function executesRealVerifiedBuildThenTest(): Promise<void> {
  const root = await createJavaScriptProject("kings-execution-real-", false);
  try {
    const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
      id: "real-build-test-project",
      projectPath: root,
      requiredOperations: ["build", "test"],
      executionId: "real-build-test-execution",
    });

    assert(
      readiness.execution.status === "ready",
      `Fixture must be readiness-verified before execution: ${readiness.blockedReasons.join(" | ")}`,
    );

    const report = new LocalEngineeringExecutionRunner().execute({
      readiness,
      authorized: true,
      timeoutMs: 30_000,
    });

    assert(report.status === "completed", report.failureReason ?? "Real build/test execution did not complete.");
    assert(report.execution.status === "completed", "Governed execution state must finish as completed.");
    assert(report.evidence.length === 2, "Build and test must each preserve execution evidence.");
    assert(
      report.evidence[0].operation === "build" &&
        report.evidence[0].succeeded,
      "The verified build command must execute first and succeed.",
    );
    assert(
      report.evidence[1].operation === "test" &&
        report.evidence[1].succeeded,
      "The verified test command must execute second and succeed.",
    );
    assert(
      report.evidence.every((entry) => entry.command === "npm"),
      "An npm repository must execute its verified npm build/test commands rather than an inferred substitute.",
    );
    assert(
      report.evidence.every((entry) => entry.resolvedExecutable.length > 0),
      "Execution evidence must retain the actual cross-platform executable used.",
    );

    await access(join(root, "build-proof.txt"));
    const proof = await readFile(join(root, "test-proof.txt"), "utf8");
    assert(
      proof.trim() === "tested-after-build",
      "The test script must observe the real build artifact, proving governed sequence rather than simulated completion.",
    );
    console.log("09.EXEC real repository build -> test sequence: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function stopsAtFirstFailedVerifiedStep(): Promise<void> {
  const root = await createJavaScriptProject("kings-execution-fail-", false);
  try {
    const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
      id: "stop-on-failure-project",
      projectPath: root,
      requiredOperations: ["build", "test"],
      executionId: "stop-on-failure-execution",
    });
    assert(readiness.execution.status === "ready", "Failure fixture must still pass non-destructive readiness verification.");

    const fake = new RecordingRunner([
      successfulProcess("build complete\n"),
      failedProcess(7, "test assertion failed\n"),
      successfulProcess("must never execute\n"),
    ]);
    const report = new LocalEngineeringExecutionRunner(fake).execute({
      readiness,
      authorized: true,
    });

    assert(report.status === "failed", "A non-zero verified command must fail the engineering execution.");
    assert(report.execution.status === "failed", "Execution state must preserve failure rather than being advanced to complete.");
    assert(report.evidence.length === 2, "Evidence must stop at the first failed step.");
    assert(fake.calls.length === 2, "No command after the failing test may run.");
    assert(report.evidence[0].operation === "build" && report.evidence[0].succeeded, "Prior successful step evidence must be preserved.");
    assert(report.evidence[1].operation === "test" && !report.evidence[1].succeeded, "Failed test evidence must be preserved.");
    assert(report.evidence[1].exitCode === 7, "Real exit status must survive into failure evidence.");
    assert(report.evidence[1].stderr.includes("test assertion failed"), "Failure stderr must be retained for diagnosis/repair.");
    assert(
      report.execution.completedStepIds.length === 1 &&
        report.execution.currentStepId === readiness.execution.steps[1].id,
      "A failed step must remain current while only earlier successful steps are marked complete.",
    );
    console.log("09.EXEC stop-on-first-failure + diagnostic evidence: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function requiresGovernedAuthorization(): Promise<void> {
  const root = await createJavaScriptProject("kings-execution-auth-", false);
  try {
    const readiness = await new LocalProjectEngineeringReadinessAuthority().inspect({
      id: "authorization-project",
      projectPath: root,
      requiredOperations: ["build", "test"],
    });
    const fake = new RecordingRunner([
      successfulProcess("should not run"),
    ]);
    const report = new LocalEngineeringExecutionRunner(fake).execute({
      readiness,
      authorized: false,
    });

    assert(report.status === "blocked", "Repository commands must fail closed without governed execution authorization.");
    assert(fake.calls.length === 0, "No process may be started before execution authorization.");
    assert(report.evidence.length === 0, "Blocked execution must not fabricate process evidence.");
    assert(
      /authorization is required/i.test(report.failureReason ?? ""),
      "The authorization block must be explicit to the mission controller.",
    );
    console.log("09.EXEC governed authorization boundary: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createJavaScriptProject(
  prefix: string,
  failingTest: boolean,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "index.js"),
    "export const repositoryExecutionProof = true;\n",
  );
  await writeFile(
    join(root, "build.cjs"),
    [
      "const fs = require('node:fs');",
      "fs.writeFileSync('build-proof.txt', 'built\\n');",
      "console.log('BUILD_PROOF_OK');",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(root, "test.cjs"),
    failingTest
      ? "console.error('TEST_PROOF_FAILED'); process.exit(7);\n"
      : [
        "const fs = require('node:fs');",
        "if (!fs.existsSync('build-proof.txt')) { console.error('build proof missing'); process.exit(9); }",
        "fs.writeFileSync('test-proof.txt', 'tested-after-build\\n');",
        "console.log('TEST_PROOF_OK');",
        "",
      ].join("\n"),
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "kings-local-execution-fixture",
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
      name: "kings-local-execution-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "kings-local-execution-fixture",
          version: "1.0.0",
        },
      },
    }),
  );
  return root;
}

interface RunnerCall {
  executable: string;
  args: string[];
  workingDirectory: string;
  timeoutMs: number;
}

class RecordingRunner implements LocalEngineeringProcessRunner {
  readonly calls: RunnerCall[] = [];

  constructor(
    private readonly results: LocalEngineeringProcessResult[],
  ) {}

  run(
    executable: string,
    args: readonly string[],
    workingDirectory: string,
    timeoutMs: number,
  ): LocalEngineeringProcessResult {
    this.calls.push({
      executable,
      args: [...args],
      workingDirectory,
      timeoutMs,
    });
    const result = this.results[this.calls.length - 1];
    if (!result) throw new Error("RecordingRunner received an unexpected extra command.");
    return {
      ...result,
      resolvedArgs: [...result.resolvedArgs],
    };
  }
}

function successfulProcess(stdout: string): LocalEngineeringProcessResult {
  return {
    started: true,
    status: 0,
    stdout,
    stderr: "",
    timedOut: false,
    resolvedExecutable: "fixture-executable",
    resolvedArgs: [],
  };
}

function failedProcess(
  status: number,
  stderr: string,
): LocalEngineeringProcessResult {
  return {
    started: true,
    status,
    stdout: "",
    stderr,
    timedOut: false,
    resolvedExecutable: "fixture-executable",
    resolvedArgs: [],
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});