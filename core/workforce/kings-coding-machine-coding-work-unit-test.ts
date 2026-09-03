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
  KingsCodingMachine,
  type KingsCodingMissionRequest,
} from "./kings-coding-machine";

import {
  TaskControl,
} from "./task-control";

import {
  WorkforceRegistry,
} from "./registry";

import type {
  Mission,
  Task,
} from "./types";

import type {
  MissionPlan,
} from "./mission-continuity";

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
      "/tmp/kings-machine-mission-write-",
    );

  try {
    const workspace =
      join(
        root,
        "workspace",
      );

    const src =
      join(
        workspace,
        "src",
      );

    const verify =
      join(
        workspace,
        "verify.js",
      );

    await mkdir(
      src,
      {
        recursive:
          true,
      },
    );

    await writeFile(
      verify,
      "const fs=require('node:fs'); const value=fs.readFileSync('src/mission-generated.ts','utf8'); if(!value.includes('KINGS_MACHINE_MISSION_GREEN')) process.exit(2); console.log('KINGS_MACHINE_MISSION_GREEN');\n",
      "utf8",
    );

    const now =
      new Date().toISOString();

    const mission: Mission = {
      id:
        "mission-kcm-real",
      name:
        "K.I.N.G.S. Real Coding Mission",
      description:
        "Execute one real governed coding work unit through the machine API.",
      status:
        "active",
      objectives: [
        "Create the requested TypeScript file.",
        "Verify the resulting source file.",
      ],
      sourceReferences: [
        "test://kcm-real-coding-mission",
      ],
      createdAt:
        now,
      updatedAt:
        now,
    };

    const task: Task = {
      id:
        "task-kcm-real",
      missionId:
        mission.id,
      name:
        "Create mission source",
      description:
        "Create the governed mission-generated TypeScript file.",
      requiredCapabilities: [
        "engineering-typescript",
      ],
      requiredToolIds: [],
      status:
        "ready",
      dependencyIds: [],
      inputReferences: [],
      expectedOutputs: [
        "A verified TypeScript source file.",
      ],
      createdAt:
        now,
      updatedAt:
        now,
    };

    const plan: MissionPlan = {
      id:
        "plan-kcm-real",
      missionId:
        mission.id,
      version:
        1,
      objective:
        "Execute one real coding work unit.",
      milestones: [
        {
          id:
            "milestone-kcm-real",
          missionId:
            mission.id,
          name:
            "Real coding",
          objective:
            "Create and verify one source file.",
          taskIds: [
            task.id,
          ],
          dependencyIds: [],
          status:
            "active",
        },
      ],
      decisionIds: [],
      acceptanceCriteria: [
        "Mission source file is created.",
        "Verification command passes.",
      ],
      locked:
        false,
      approvedByHuman:
        false,
      createdAt:
        now,
      updatedAt:
        now,
    };

    const registry =
      new WorkforceRegistry();

    registry.registerTask(
      task,
    );

    const taskControl =
      new TaskControl(
        registry,
      );

    const machine =
      new KingsCodingMachine(
        undefined,
        undefined,
        taskControl,
      );

    const request:
      KingsCodingMissionRequest = {
      mission,
      plan,
    };

    machine.startMission(
      request,
    );

    machine.approvePlan(
      mission.id,
    );

    machine.lockPlan(
      mission.id,
    );

    const editor =
      new EngineeringRepairEditor(
        new ControlledFileEditor({
          allowedReadPaths: [
            workspace,
          ],
          allowedWritePaths: [
            src,
          ],
          maxFileBytes:
            100_000,
        }),
      );

    const result =
      await machine.executeCodingWorkUnit({
        taskId:
          task.id,
        projectId:
          mission.id,
        workUnit: {
          id:
            "work-unit-kcm-real",
          role:
            "coding-engineer",
          objective:
            "Create and verify mission-generated.ts.",
          capabilityIds: [
            "engineering-typescript",
          ],
          allowedToolIds: [
            "tool-execution-sandbox",
          ],
          allowedPaths: [
            "src",
            workspace,
          ],
          budget: {
            maxTimeMs:
              30_000,
            maxTokens:
              4_000,
            maxIterations:
              3,
          },
          dependencyIds: [],
          acceptanceCriteria: [
            "Mission source file is created.",
            "Verification command passes.",
          ],
          requiredEvidenceTypes: [
            "write",
            "test",
          ],
          approved:
            true,
          createdAt:
            now,
          updatedAt:
            now,
        },
        proposal: {
          id:
            "proposal-kcm-real",
          taskId:
            task.id,
          missionId:
            mission.id,
          summary:
            "Create mission-generated.ts.",
          changes: [
            {
              path:
                "src/mission-generated.ts",
              operation:
                "create",
              content:
                "export const KINGS_MACHINE_MISSION_GREEN = true;\n",
            },
          ],
        },
        execution: {
          id:
            "execution-kcm-real",
          projectId:
            mission.id,
          status:
            "ready",
          steps: [
            {
              id:
                task.id,
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
            task.id,
          completedStepIds: [],
          blockedReasons: [],
        },
        step: {
          id:
            task.id,
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
            "workspace-kcm-real",
          projectId:
            mission.id,
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
            task.id,
          strategy:
            "edit",
          description:
            "Create mission-generated.ts.",
          reason:
            "Authorized coding work unit.",
          required:
            true,
        },
        buildTestSteps: [
          {
            id:
              "verify-kcm-real",
            operation:
              "test",
            command:
              process.execPath,
            args: [
              verify,
            ],
            workingDirectory:
              workspace,
            verifiesCriteria: [
              "Verification command passes.",
            ],
          },
        ],
        requiredCriteria: [
          "Verification command passes.",
        ],
      }, editor, {
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
            src,
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
      });

    assert(
      result.completed,
      "machine API must complete the coding work unit",
    );

    assert(
      result.verification.accepted,
      "machine API must return accepted verification",
    );

    assert(
      result.writes.writes.length ===
        1,
      "machine API must record one governed write",
    );

    const source =
      await readFile(
        join(
          src,
          "mission-generated.ts",
        ),
        "utf8",
      );

    assert(
      source.includes(
        "KINGS_MACHINE_MISSION_GREEN",
      ),
      "machine API must create the requested source",
    );

    console.log(
      "K.I.N.G.S. MACHINE → REAL CODING MISSION: SUCCESS",
    );

    console.log(
      "K.I.N.G.S. MACHINE → GOVERNED WRITE: SUCCESS",
    );

    console.log(
      "K.I.N.G.S. MACHINE → VERIFICATION: SUCCESS",
    );

    console.log(
      "TREE-KCM-MISSION-CODE: SUCCESS",
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
      "TREE-KCM-MISSION-CODE: FAILURE",
    );
    console.error(error);
    process.exitCode =
      1;
  },
);
