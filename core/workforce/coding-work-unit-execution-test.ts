import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

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
  CodingWorkUnitExecutionAuthority,
} from "./coding-work-unit-execution";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

function assert(
  condition:
    unknown,
  message:
    string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const root =
    await mkdtemp(
      "/tmp/kings-coding-work-unit-",
    );

  try {
    const workspace =
      join(
        root,
        "workspace",
      );

    const allowed =
      join(
        workspace,
        "src",
      );

    const target =
      join(
        allowed,
        "generated.ts",
      );

    const testFile =
      join(
        workspace,
        "verify.js",
      );

    await mkdir(
      workspace,
      {
        recursive:
          true,
      },
    );

    await writeFile(
      testFile,
      "const fs = require('node:fs'); const value = fs.readFileSync('src/generated.ts','utf8'); if (!value.includes('KINGS_CODE_WRITE_GREEN')) process.exit(2); process.stdout.write('KINGS_CODE_WRITE_GREEN');\n",
      "utf8",
    );

    const workUnit:
      WorkUnitContract =
      {
        id:
          "work-unit-coding-real",
        role:
          "coding-engineer",
        objective:
          "Create the requested TypeScript source file and verify it.",
        capabilityIds: [
          "engineering-typescript",
        ],
        allowedToolIds: [
          "tool-execution-sandbox",
        ],
        allowedPaths: [
          workspace,
          allowed,
        ],
        budget: {
          maxTimeMs:
            60_000,
          maxTokens:
            10_000,
          maxIterations:
            3,
        },
        dependencyIds: [],
        acceptanceCriteria: [
          "Source file is written.",
          "Verification command passes.",
        ],
        requiredEvidenceTypes: [
          "write",
          "test",
        ],
        approved:
          true,
        createdAt:
          new Date().toISOString(),
        updatedAt:
          new Date().toISOString(),
      };

    const editor =
      new EngineeringRepairEditor(
        new ControlledFileEditor({
          allowedReadPaths: [
            workspace,
          ],
          allowedWritePaths: [
            allowed,
          ],
          maxFileBytes:
            100_000,
        }),
      );

    const authority =
      new CodingWorkUnitExecutionAuthority(
        editor,
        {
          sandboxPolicy: {
            allowedCommands: [
              process.execPath,
            ],
            allowedWorkingDirectories: [
              workspace,
            ],
            allowedReadPaths: [
              workspace,
            ],
            allowedWritePaths: [
              workspace,
              allowed,
            ],
            allowedEnvironmentKeys: [],
            allowedSideEffects: [
              "read",
              "write",
              "execute",
            ],
            timeoutMs:
              10_000,
            maxOutputBytes:
              16_384,
            maxConcurrentProcesses:
              1,
            allowShell:
              false,
            allowNetwork:
              false,
          },
        },
      );

    const result =
      await authority.execute({
        taskId:
          "task-coding-real",
        projectId:
          "project-coding-real",
        workUnit,
        proposal: {
          id:
            "proposal-coding-real",
          taskId:
            "task-coding-real",
          missionId:
            "project-coding-real",
          summary:
            "Create the requested TypeScript source.",
          changes: [
            {
              path:
                "src/generated.ts",
              operation:
                "create",
              content:
                "export const KINGS_CODE_WRITE_GREEN = true;\n",
            },
          ],
        },
        execution: {
          id:
            "execution-coding-real",
          projectId:
            "project-coding-real",
          status:
            "ready",
          steps: [
            {
              id:
                "task-coding-real",
              language:
                "typescript",
              operation:
                "create",
              capabilityId:
                "engineering-typescript",
              sequence:
                1,
            },
          ],
          currentStepId:
            "task-coding-real",
          completedStepIds: [],
          blockedReasons: [],
        },
        step: {
          id:
            "task-coding-real",
          language:
            "typescript",
          operation:
            "create",
          capabilityId:
            "engineering-typescript",
          sequence:
            1,
        },
        workspace: {
          id:
            "workspace-coding-real",
          projectId:
            "project-coding-real",
          rootPath:
            workspace,
          allowedPaths: [
            "src",
          ],
          allowedLanguages: [
            "typescript",
          ],
          allowedOperations: [
            "create",
          ],
          active:
            true,
        },
        repairStep: {
          id:
            "task-coding-real",
          strategy:
            "edit",
          description:
            "Create the requested source file.",
          reason:
            "Authorized coding work unit.",
          required:
            true,
        },
        buildTestSteps: [
          {
            id:
              "verify-coding-real",
            operation:
              "test",
            command:
              process.execPath,
            args: [
              testFile,
            ],
            workingDirectory:
              workspace,
            verifiesCriteria: [
              "Verification command must pass.",
            ],
          },
        ],
        requiredCriteria: [
          "Verification command must pass.",
        ],
      });

    assert(
      result.writes.writes.length ===
        1,
      "exactly one source file must be written",
    );

    assert(
      result.buildTest.passed,
      "verification command must pass",
    );

    assert(
      result.verification.accepted,
      "verification gate must accept successful evidence",
    );

    assert(
      result.completion.completed,
      "completion authority must complete the coding work unit",
    );

    assert(
      result.completed,
      "coding work unit must report completion",
    );

    const content =
      await readFile(
        target,
        "utf8",
      );

    assert(
      content.includes(
        "KINGS_CODE_WRITE_GREEN",
      ),
      "target file must contain the requested implementation",
    );

    console.log(
      "KINGS CODING WORK UNIT → GOVERNED WRITE: SUCCESS",
    );

    console.log(
      "KINGS CODING WORK UNIT → REAL VERIFICATION: SUCCESS",
    );

    console.log(
      "KINGS CODING WORK UNIT → COMPLETION AUTHORITY: SUCCESS",
    );

    console.log(
      "TREE-KCM-CODE-WRITE: SUCCESS",
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
  (error) => {
    console.error(
      "TREE-KCM-CODE-WRITE: FAILURE",
    );
    console.error(error);
    process.exitCode =
      1;
  },
);
