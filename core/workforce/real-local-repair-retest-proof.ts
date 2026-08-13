import {
  mkdtemp,
  rm,
  readFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  spawn,
} from "node:child_process";

import {
  EngineeringFailureRecoveryAuthority,
} from "./engineering-failure-recovery";

import {
  EngineeringRepairPlannerAuthority,
} from "./engineering-repair-planner";

import {
  ControlledFileEditor,
} from "./file-editor";

import {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

interface ProcessResult {
  exitCode:
    number;

  stdout:
    string;

  stderr:
    string;
}

function runProcess(
  executable:
    string,
  args:
    string[],
  cwd:
    string,
):
  Promise<ProcessResult> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const child =
        spawn(
          executable,
          args,
          {
            cwd,
            shell:
              false,
            stdio: [
              "ignore",
              "pipe",
              "pipe",
            ],
          },
        );

      let stdout =
        "";

      let stderr =
        "";

      child.stdout.on(
        "data",
        (
          chunk:
            Buffer,
        ) => {
          stdout +=
            chunk.toString();
        },
      );

      child.stderr.on(
        "data",
        (
          chunk:
            Buffer,
        ) => {
          stderr +=
            chunk.toString();
        },
      );

      child.on(
        "error",
        reject,
      );

      child.on(
        "close",
        (
          exitCode,
        ) => {
          resolve({
            exitCode:
              exitCode ?? 1,
            stdout,
            stderr,
          });
        },
      );
    },
  );
}

function compilerEvidence(
  result:
    ProcessResult,
):
  string {
  return [
    result.stdout,
    result.stderr,
  ]
    .filter(
      (
        value,
      ) =>
        value.trim().length >
        0,
    )
    .join(
      "\n",
    )
    .trim();
}

async function main(): Promise<void> {
  const root =
    await mkdtemp(
      "/tmp/kings-tree08-repair-",
    );

  try {
    const sourcePath =
      join(
        root,
        "generated-local.ts",
      );

    const tsconfigPath =
      join(
        root,
        "tsconfig.json",
      );

    const brokenSource =
      [
        "export const kingsGeneratedValue: number = '42';",
        "",
      ].join(
        "\n",
      );

    const repairedSource =
      [
        "export const kingsGeneratedValue: number = 42;",
        "",
      ].join(
        "\n",
      );

    const tsconfig =
      [
        "{",
        '  "compilerOptions": {',
        '    "target": "ES2022",',
        '    "module": "CommonJS",',
        '    "strict": true',
        "  },",
        '  "include": ["generated-local.ts"]',
        "}",
        "",
      ].join(
        "\n",
      );

    const editor =
      new ControlledFileEditor({
        allowedReadPaths: [
          root,
        ],
        allowedWritePaths: [
          root,
        ],
        maxFileBytes:
          16_384,
      });

    const repairEditor =
      new EngineeringRepairEditor(
        editor,
      );

    await repairEditor.execute(
      {
        id:
          "repair-step-real-loop-create",
        strategy:
          "edit",
        description:
          "Create the deliberately failing source.",
        reason:
          "Set up the recovery proof.",
        required:
          true,
      },
      {
        stepId:
          "repair-step-real-loop-create",
        projectId:
          "project-real-loop",
        path:
          sourcePath,
        content:
          brokenSource,
      },
    );

    console.log(
      "08.REPAIR failing artifact creation: SUCCESS",
    );

    await repairEditor.execute(
      {
        id:
          "repair-step-real-loop-config",
        strategy:
          "edit",
        description:
          "Create the bounded compiler configuration.",
        reason:
          "Provide a deterministic typecheck environment.",
        required:
          true,
      },
      {
        stepId:
          "repair-step-real-loop-config",
        projectId:
          "project-real-loop",
        path:
          tsconfigPath,
        content:
          tsconfig,
      },
    );

    const compiler =
      join(
        process.cwd(),
        "runtimes/source-inspection/node_modules/.bin/tsc",
      );

    const failedBuild =
      await runProcess(
        compiler,
        [
          "--project",
          tsconfigPath,
          "--noEmit",
        ],
        root,
      );

    const failureEvidence =
      compilerEvidence(
        failedBuild,
      );

    assert(
      failedBuild.exitCode !==
        0,
      "The deliberately broken artifact must fail typecheck.",
    );

    assert(
      failureEvidence.length >
        0,
      "A failed compiler invocation must preserve diagnostic evidence.",
    );

    assert(
      /TS\d{4}/.test(
        failureEvidence,
      ),
      `Compiler evidence must contain a TypeScript diagnostic code.\n${failureEvidence}`,
    );

    console.log(
      "08.REPAIR real failing build captured: SUCCESS",
    );

    const recovery =
      new EngineeringFailureRecoveryAuthority();

    const failureAnalysis =
      recovery.analyze(
        {
          id:
            "result-real-loop-failure",
          commandId:
            "command-real-loop-build",
          projectId:
            "project-real-loop",
          status:
            "failed",
          exitCode:
            failedBuild.exitCode,
          stdout:
            failedBuild.stdout,
          stderr:
            failedBuild.stderr,
          durationMs:
            1,
          completedAt:
            new Date().toISOString(),
        },
        2,
        {
          maxRetries:
            2,
          allowRepair:
            true,
        },
      );

    assert(
      failureAnalysis.action ===
        "repair",
      "Retry exhaustion must produce a repair action.",
    );

    assert(
      failureAnalysis.diagnostics.length >
        0,
      "Recovery analysis must retain diagnostics.",
    );

    const recoveredEvidence =
      failureAnalysis.diagnostics.join(
        "\n",
      );

    assert(
      /TS\d{4}/.test(
        recoveredEvidence,
      ),
      "Recovery analysis must preserve the compiler diagnostic code.",
    );

    console.log(
      "08.REPAIR failure diagnosis: SUCCESS",
    );

    const planner =
      new EngineeringRepairPlannerAuthority();

    const plan =
      planner.plan(
        failureAnalysis,
      );

    assert(
      plan.authorized,
      "Failure analysis must authorize the automated repair plan.",
    );

    const editStep =
      plan.steps.find(
        (
          step,
        ) =>
          step.strategy ===
          "edit",
      );

    const retestStep =
      plan.steps.find(
        (
          step,
        ) =>
          step.strategy ===
          "retest",
      );

    assert(
      editStep !==
        undefined,
      "Repair plan must contain an edit step.",
    );

    assert(
      retestStep !==
        undefined,
      "Repair plan must contain a retest step.",
    );

    console.log(
      "08.REPAIR governed repair plan: SUCCESS",
    );

    await repairEditor.execute(
      editStep!,
      {
        stepId:
          editStep!.id,
        projectId:
          "project-real-loop",
        path:
          sourcePath,
        content:
          repairedSource,
      },
    );

    console.log(
      "08.REPAIR governed repair write: SUCCESS",
    );

    const repairedBuild =
      await runProcess(
        compiler,
        [
          "--project",
          tsconfigPath,
          "--noEmit",
        ],
        root,
      );

    assert(
      repairedBuild.exitCode ===
        0,
      `Repaired artifact must pass typecheck.\n${compilerEvidence(repairedBuild)}`,
    );

    console.log(
      "08.REPAIR retest after repair: SUCCESS",
    );

    const finalSource =
      await readFile(
        sourcePath,
        "utf8",
      );

    assert(
      finalSource ===
        repairedSource,
      "Final source must equal the repaired authorized content.",
    );

    console.log(
      "08.REPAIR repaired artifact verification: SUCCESS",
    );

    const finalAnalysis =
      recovery.analyze(
        {
          id:
            "result-real-loop-success",
          commandId:
            "command-real-loop-retest",
          projectId:
            "project-real-loop",
          status:
            "success",
          exitCode:
            0,
          stdout:
            "tsc passed",
          stderr:
            "",
          durationMs:
            1,
          completedAt:
            new Date().toISOString(),
        },
        1,
        {
          maxRetries:
            2,
          allowRepair:
            true,
        },
      );

    assert(
      finalAnalysis.action ===
        "complete",
      "Successful retest must close the recovery cycle.",
    );

    console.log(
      "08.REPAIR recovery completion decision: SUCCESS",
    );

    console.log(
      "TREE-08 REAL FAILURE → DIAGNOSE → REPAIR → RETEST → VERIFY: SUCCESS",
    );
  } finally {
    await rm(
      root,
      {
        recursive:
          true,
        force:
          true,
      },
    );
  }
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
