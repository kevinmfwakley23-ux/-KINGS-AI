import {
  mkdtemp,
  rm,
  writeFile,
  readFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  spawn,
} from "node:child_process";

import {
  ControlledFileEditor,
} from "./file-editor";

import {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import type {
  EngineeringRepairStep,
} from "./engineering-repair-planner";

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

async function main(): Promise<void> {
  const root =
    await mkdtemp(
      "/tmp/kings-tree0608-build-",
    );

  try {
    const sourcePath =
      join(
        root,
        "generated-local.ts",
      );

    const testPath =
      join(
        root,
        "generated-local.test.ts",
      );

    const tsconfigPath =
      join(
        root,
        "tsconfig.json",
      );

    const source =
      [
        "export const kingsGeneratedValue: number = 42;",
        "",
      ].join(
        "\n",
      );

    const test =
      [
        "import { kingsGeneratedValue } from './generated-local';",
        "",
        "if (kingsGeneratedValue !== 42) {",
        "  throw new Error('generated value verification failed');",
        "}",
        "",
        "console.log('GENERATED_LOCAL_TEST_GREEN');",
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
        '    "strict": true,',
        '    "esModuleInterop": true',
        '  },',
        '  "include": ["*.ts"]',
        "}",
        "",
      ].join(
        "\n",
      );

    await writeFile(
      tsconfigPath,
      tsconfig,
      "utf8",
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

    const editStep:
      EngineeringRepairStep = {
      id:
        "tree0608-build-edit",
      strategy:
        "edit",
      description:
        "Apply the generated local TypeScript source and test.",
      reason:
        "Local coding output has passed proposal and authorization.",
      required:
        true,
    };

    const sourceResult =
      await repairEditor.execute(
        editStep,
        {
          stepId:
            editStep.id,
          projectId:
            "project-tree0608",
          path:
            sourcePath,
          content:
            source,
        },
      );

    assert(
      sourceResult.success,
      "Generated source write must succeed.",
    );

    const testResult =
      await repairEditor.execute(
        editStep,
        {
          stepId:
            editStep.id,
          projectId:
            "project-tree0608",
          path:
            testPath,
          content:
            test,
        },
      );

    assert(
      testResult.success,
      "Generated test write must succeed.",
    );

    console.log(
      "08.TEST generated source/test write: SUCCESS",
    );

    const compiler =
      join(
        process.cwd(),
        "runtimes/source-inspection/node_modules/.bin/tsc",
      );

    const outputDirectory =
      join(
        root,
        "dist",
      );

    const build =
      await runProcess(
        compiler,
        [
          "--project",
          tsconfigPath,
          "--outDir",
          outputDirectory,
        ],
        root,
      );

    assert(
      build.exitCode ===
        0,
      `Generated TypeScript build failed:\n${build.stderr || build.stdout}`,
    );

    console.log(
      "08.TEST generated TypeScript build: SUCCESS",
    );

    const testExecution =
      await runProcess(
        process.execPath,
        [
          join(
            outputDirectory,
            "generated-local.test.js",
          ),
        ],
        root,
      );

    assert(
      testExecution.exitCode ===
        0,
      `Generated test failed:\n${testExecution.stderr || testExecution.stdout}`,
    );

    assert(
      testExecution.stdout.includes(
        "GENERATED_LOCAL_TEST_GREEN",
      ),
      "Generated test did not produce the expected verification evidence.",
    );

    console.log(
      "08.TEST generated runtime test: SUCCESS",
    );

    const persistedSource =
      await readFile(
        sourcePath,
        "utf8",
      );

    assert(
      persistedSource ===
        source,
      "Verified source must remain exactly what was written.",
    );

    console.log(
      "08.TEST persisted artifact verification: SUCCESS",
    );

    console.log(
      "TREE-06/08 REAL LOCAL BUILD → TEST → EVIDENCE: SUCCESS",
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
