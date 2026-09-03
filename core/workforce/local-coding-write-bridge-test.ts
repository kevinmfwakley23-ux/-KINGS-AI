import {
  mkdtemp,
  readFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import type {
  EngineeringRepairStep,
} from "./engineering-repair-planner";

import {
  ControlledFileEditor,
} from "./file-editor";

import {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import {
  LocalCodingWriteBridge,
} from "./local-coding-write-bridge";

import type {
  EngineeringWorkspaceProposalResult,
} from "./engineering-workspace-proposal";

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

function createEditStep():
  EngineeringRepairStep {
  return {
    id:
      "repair-step-006",
    strategy:
      "edit",
    description:
      "Apply a bounded local coding change.",
    reason:
      "Verified local coding proposal is authorized for this repair.",
    required:
      true,
  };
}

function createProposal(
  missionId =
    "mission-006",
):
  EngineeringWorkspaceProposalResult {
  return {
    command: {
      id:
        "command-repair-step-006",
      executionStepId:
        "repair-step-006",
      projectId:
        "project-006",
      language:
        "typescript",
      operation:
        "create",
      workingDirectory:
        "/workspace/project-006",
      allowed:
        true,
    },
    taskId:
      "repair-step-006",
    missionId,
    changes: [
      {
        path:
          "core/workforce/generated-local.ts",
        operation:
          "create",
        content:
          "export const kingsLocalGenerated = true;\n",
        language:
          "typescript",
      },
    ],
  };
}

async function main(): Promise<void> {
  const root =
    await mkdtemp(
      join(
        tmpdir(),
        "kings-tree06-",
      ),
    );

  const workspaceRoot =
    join(
      root,
      "workspace",
    );

  const allowedRoot =
    join(
      workspaceRoot,
      "core",
      "workforce",
    );

  const editor =
    new ControlledFileEditor({
      allowedReadPaths: [
        workspaceRoot,
      ],
      allowedWritePaths: [
        allowedRoot,
      ],
      maxFileBytes:
        100_000,
    });

  const repairEditor =
    new EngineeringRepairEditor(
      editor,
    );

  const bridge =
    new LocalCodingWriteBridge(
      repairEditor,
    );

  const step =
    createEditStep();

  const projectId =
    "project-006";

  const result =
    await bridge.execute({
      step,
      projectId,
      workspaceRoot,
      proposal:
        createProposal(),
    });

  assert(
    result.writes.length ===
      1,
    "Exactly one authorized write should occur.",
  );

  assert(
    result.projectId ===
      projectId,
    "Write result must preserve project identity independently of mission provenance.",
  );

  const expectedPath =
    join(
      workspaceRoot,
      "core",
      "workforce",
      "generated-local.ts",
    );

  assert(
    result.writes[0].path ===
      expectedPath,
    "Write result must contain the resolved absolute path.",
  );

  const content =
    await readFile(
      expectedPath,
      "utf8",
    );

  assert(
    content ===
      "export const kingsLocalGenerated = true;\n",
    "Authorized generated code must be written exactly.",
  );

  console.log(
    "06.WRITE authorized local-code write: SUCCESS",
  );

  console.log(
    "06.WRITE workspace-to-editor path resolution: SUCCESS",
  );

  const distinctMissionResult =
    await bridge.execute({
      step,
      projectId,
      workspaceRoot,
      proposal:
        createProposal(
          "mission-distinct-from-project-006",
        ),
    });

  assert(
    distinctMissionResult.projectId ===
      projectId,
    "Distinct mission provenance must not be conflated with the project workspace identity.",
  );

  console.log(
    "06.WRITE mission/project identity separation: SUCCESS",
  );

  let deniedBlankMission =
    false;

  try {
    await bridge.execute({
      step,
      projectId,
      workspaceRoot,
      proposal:
        createProposal(""),
    });
  } catch {
    deniedBlankMission =
      true;
  }

  assert(
    deniedBlankMission,
    "Missing mission provenance must block the write.",
  );

  console.log(
    "06.WRITE mission provenance protection: SUCCESS",
  );

  let deniedStrategy =
    false;

  try {
    await bridge.execute({
      step: {
        ...step,
        strategy:
          "retest",
      },
      projectId,
      workspaceRoot,
      proposal:
        createProposal(),
    });
  } catch {
    deniedStrategy =
      true;
  }

  assert(
    deniedStrategy,
    "Non-edit repair steps must never write files.",
  );

  console.log(
    "06.WRITE repair-strategy protection: SUCCESS",
  );

  console.log(
    "TREE-06 LOCAL CODING → GOVERNED FILE WRITE: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
