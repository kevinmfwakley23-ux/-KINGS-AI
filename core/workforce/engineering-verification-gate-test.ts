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

  const compileCriterion =
    "Project must compile successfully.";
  const verificationCriterion =
    "Project verification must pass.";

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
      verifiesCriteria: [
        compileCriterion,
        verificationCriterion,
      ],
    };

  const accepted =
    gate.verify({
      projectId:
        "project-tree-0817",
      requiredCriteria: [
        compileCriterion,
        verificationCriterion,
      ],
      commandResults: [
        commandResult,
      ],
      repairResults: [],
    });

  assert(
    accepted.accepted,
    "Explicit criterion-bound engineering evidence must satisfy the verification gate.",
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
    "08.17 criterion-bound engineering verification: SUCCESS",
  );

  const unrelated =
    gate.verify({
      projectId:
        "project-tree-0817",
      requiredCriteria: [
        "The real application must launch on the target platform.",
      ],
      commandResults: [
        commandResult,
      ],
      repairResults: [],
    });

  assert(
    !unrelated.accepted,
    "A successful unrelated command must not satisfy another acceptance criterion.",
  );

  console.log(
    "08.17 unrelated green command rejection: SUCCESS",
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

  const repairedWithoutCheck =
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
    !repairedWithoutCheck.accepted,
    "Repair completion alone must not replace a post-repair verification command.",
  );

  console.log(
    "08.17 repair-without-post-check rejection: SUCCESS",
  );

  const rejected =
    gate.verify({
      projectId:
        "project-tree-0817-rejected",
      requiredCriteria: [
        compileCriterion,
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
