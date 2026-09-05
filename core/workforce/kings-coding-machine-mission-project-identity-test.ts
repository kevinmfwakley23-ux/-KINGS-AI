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
} from "./kings-coding-machine";

import {
  TaskControl,
} from "./task-control";

import {
  WorkforceRegistry,
} from "./registry";

import type {
  Mission,
} from "./types";

import type {
  MissionPlan,
} from "./mission-continuity";

function assert(
  condition: unknown,
  message: string,
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
      "/tmp/kings-mission-project-identity-",
    );

  try {
    const workspace =
      join(root, "workspace");
    const src =
      join(workspace, "src");
    const verify =
      join(workspace, "verify.js");

    await mkdir(
      src,
      { recursive: true },
    );

    await writeFile(
      verify,
      "const fs=require('node:fs'); const value=fs.readFileSync('src/identity-proof.ts','utf8'); if(!value.includes('KINGS_IDENTITY_GREEN')) process.exit(2); console.log('KINGS_IDENTITY_GREEN');\n",
      "utf8",
    );

    const missionId =
      "mission-kcm-identity";
    const projectId =
      "project-kcm-identity";
    const taskId =
      "task-kcm-identity";
    const now =
      new Date().toISOString();

    const mission: Mission = {
      id: missionId,
      name: "Mission/project identity proof",
      description: "Execute governed coding where mission and project IDs are intentionally different.",
      status: "active",
      objectives: [
        "Keep mission continuity separate from project workspace identity.",
      ],
      sourceReferences: [
        "test://mission-project-identity",
      ],
      createdAt: now,
      updatedAt: now,
    };

    const plan: MissionPlan = {
      id: "plan-kcm-identity-v1",
      missionId,
      version: 1,
      objective: "Create and verify one file in a distinct project.",
      milestones: [
        {
          id: "milestone-kcm-identity",
          missionId,
          name: "Identity-safe coding",
          objective: "Complete the distinct-project coding task.",
          taskIds: [taskId],
          dependencyIds: [],
          status: "active",
        },
      ],
      decisionIds: [],
      acceptanceCriteria: [
        "The file is created and verified.",
        "Mission state records the task under missionId, not projectId.",
      ],
      locked: false,
      approvedByHuman: false,
      createdAt: now,
      updatedAt: now,
    };

    const registry =
      new WorkforceRegistry();
    const machine =
      new KingsCodingMachine(
        undefined,
        undefined,
        new TaskControl(registry),
      );

    machine.startMission({
      mission,
      plan,
    });
    machine.approvePlan(missionId);
    machine.lockPlan(missionId);

    const editor =
      new EngineeringRepairEditor(
        new ControlledFileEditor({
          allowedReadPaths: [workspace],
          allowedWritePaths: [src],
          maxFileBytes: 100_000,
        }),
      );

    const result =
      await machine.executeCodingWorkUnit(
        {
          taskId,
          missionId,
          projectId,
          workUnit: {
            id: "work-unit-kcm-identity",
            role: "coding-engineer",
            objective: "Create identity-proof.ts.",
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
              maxTimeMs: 30_000,
              maxTokens: 4_000,
              maxIterations: 3,
            },
            dependencyIds: [],
            acceptanceCriteria: [
              "identity-proof.ts is created and verified.",
            ],
            requiredEvidenceTypes: [
              "write",
              "test",
            ],
            approved: true,
            createdAt: now,
            updatedAt: now,
          },
          proposal: {
            id: "proposal-kcm-identity",
            taskId,
            missionId,
            summary: "Create identity-proof.ts.",
            changes: [
              {
                path: "src/identity-proof.ts",
                operation: "create",
                content: "export const KINGS_IDENTITY_GREEN = true;\n",
              },
            ],
          },
          execution: {
            id: "execution-kcm-identity",
            projectId,
            status: "ready",
            steps: [
              {
                id: taskId,
                language: "typescript",
                operation: "create",
                capabilityId: "engineering-typescript",
                sequence: 1,
              },
            ],
            currentStepId: taskId,
            completedStepIds: [],
            blockedReasons: [],
          },
          step: {
            id: taskId,
            language: "typescript",
            operation: "create",
            capabilityId: "engineering-typescript",
            sequence: 1,
          },
          workspace: {
            id: "workspace-kcm-identity",
            projectId,
            rootPath: workspace,
            allowedPaths: ["src"],
            allowedLanguages: ["typescript"],
            allowedOperations: ["create"],
            active: true,
          },
          repairStep: {
            id: taskId,
            strategy: "edit",
            description: "Create identity-proof.ts.",
            reason: "Mission/project separation regression test.",
            required: true,
          },
          buildTestSteps: [
            {
              id: "verify-kcm-identity",
              operation: "test",
              command: process.execPath,
              args: [verify],
              workingDirectory: workspace,
              verifiesCriteria: [
                "identity-proof.ts is created and verified.",
              ],
            },
          ],
          requiredCriteria: [
            "identity-proof.ts is created and verified.",
          ],
        },
        editor,
        {
          sandboxPolicy: {
            allowedCommands: [process.execPath],
            allowedWorkingDirectories: [workspace],
            allowedReadPaths: [workspace],
            allowedWritePaths: [workspace, src],
            allowedEnvironmentKeys: [],
            allowedSideEffects: [
              "read",
              "write",
              "execute",
            ],
            timeoutMs: 10_000,
            maxOutputBytes: 16_384,
            maxConcurrentProcesses: 1,
            allowShell: false,
            allowNetwork: false,
          },
        },
      );

    assert(
      result.completed,
      "distinct mission/project coding must complete",
    );
    assert(
      result.missionId === missionId,
      "result must preserve mission identity",
    );
    assert(
      result.projectId === projectId,
      "result must preserve project identity",
    );

    const snapshot =
      machine.snapshot(missionId);

    assert(
      snapshot.state.completedTaskIds.includes(taskId),
      "mission continuity must record completion under missionId",
    );

    const source =
      await readFile(
        join(src, "identity-proof.ts"),
        "utf8",
      );

    assert(
      source.includes("KINGS_IDENTITY_GREEN"),
      "governed write must reach the distinct project workspace",
    );

    console.log(
      "K.I.N.G.S. MISSION/PROJECT IDENTITY → DISTINCT IDS: SUCCESS",
    );
    console.log(
      "K.I.N.G.S. MISSION/PROJECT IDENTITY → REAL WRITE + VERIFY: SUCCESS",
    );
    console.log(
      "TREE-KCM-MISSION-PROJECT-IDENTITY: SUCCESS",
    );
  } finally {
    await rm(
      root,
      {
        recursive: true,
        force: true,
      },
    );
  }
}

main().catch(
  (error) => {
    console.error(
      "TREE-KCM-MISSION-PROJECT-IDENTITY: FAILURE",
    );
    console.error(error);
    process.exitCode = 1;
  },
);
