import {
  EngineeringVerificationGateAuthority,
} from "./engineering-verification-gate";

import type {
  EngineeringCommandResult,
} from "./engineering-execution-loop";

import type {
  EngineeringRepairExecutionResult,
} from "./engineering-repair-execution";

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

function main(): void {
  const gate =
    new EngineeringVerificationGateAuthority();

  const commandResult:
    EngineeringCommandResult =
    {
      id:
        "result-tree-0817",
      commandId:
        "command-tree-0817",
      projectId:
        "project-tree-0817",
      status:
        "success",
      exitCode:
        0,
      stdout:
        "Build and test successful.",
      stderr:
        "",
      durationMs:
        100,
      completedAt:
        new Date().toISOString(),
    };

  const accepted =
    gate.verify({
      projectId:
        "project-tree-0817",
      requiredCriteria: [
        "Project must compile successfully.",
        "Project verification must pass.",
      ],
      commandResults: [
        commandResult,
      ],
      repairResults: [],
    });

  assert(
    accepted.accepted,
    "Successful engineering evidence must satisfy the verification gate.",
  );

  assert(
    accepted.unmetCriteria.length ===
      0,
    "Accepted engineering work must have no unmet criteria.",
  );

  assert(
    accepted.evidence.length ===
      2,
    "Every required criterion must produce explicit evidence.",
  );

  console.log(
    "08.17 successful engineering verification: SUCCESS",
  );

  const repairResult:
    EngineeringRepairExecutionResult =
    {
      id:
        "repair-execution-tree-0817",
      planId:
        "repair-plan-tree-0817",
      projectId:
        "project-tree-0817-repaired",
      status:
        "completed",
      stepResults: [],
      verified:
        true,
    };

  const repaired =
    gate.verify({
      projectId:
        "project-tree-0817-repaired",
      requiredCriteria: [
        "Repaired project must pass verification.",
      ],
      commandResults: [],
      repairResults: [
        repairResult,
      ],
    });

  assert(
    repaired.accepted,
    "Verified repair evidence must satisfy the engineering gate.",
  );

  console.log(
    "08.17 verified repair acceptance: SUCCESS",
  );

  const rejected =
    gate.verify({
      projectId:
        "project-tree-0817-rejected",
      requiredCriteria: [
        "Project must compile successfully.",
      ],
      commandResults: [
        {
          ...commandResult,
          id:
            "result-tree-0817-failed",
          projectId:
            "different-project",
          status:
            "failed",
          exitCode:
            1,
          stderr:
            "Compilation failed.",
        },
      ],
      repairResults: [],
    });

  assert(
    !rejected.accepted,
    "Missing successful evidence must reject project completion.",
  );

  assert(
    rejected.unmetCriteria.length ===
      1,
    "Rejected verification must identify the unmet criterion.",
  );

  assert(
    rejected.evidence[0].passed ===
      false,
    "Unverified criteria must produce failed evidence.",
  );

  console.log(
    "08.17 missing-evidence rejection: SUCCESS",
  );

  console.log(
    "TREE-08.17 ENGINEERING VERIFICATION GATE: SUCCESS",
  );
}

main();
