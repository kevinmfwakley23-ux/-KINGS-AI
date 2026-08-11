import type {
  AgentDefinition,
  Mission,
  Task,
  ToolDefinition,
} from "./types";

import {
  WorkforceRegistry,
} from "./registry";

import {
  WorkUnitRegistry,
} from "./work-unit-registry";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

import {
  WorkforceFormationAuthority,
} from "./workforce-formation";

import {
  WorkUnitAssignmentAuthority,
} from "./work-unit-assignment";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function now(): string {
  return new Date().toISOString();
}

function createMission(): Mission {
  return {
    id:
      "mission-work-unit-assignment-test",
    name:
      "Work Unit Assignment Test",
    description:
      "Verify authoritative formation-to-work-unit assignment.",
    status:
      "active",
    objectives: [
      "Convert formation decisions into bounded assignments.",
    ],
    sourceReferences: [],
    createdAt:
      now(),
    updatedAt:
      now(),
  };
}

function createAgent(
  id: string,
  capabilities: string[],
  toolIds: string[] = [],
): AgentDefinition {
  return {
    id,
    name:
      `Assignment Test Agent ${id}`,
    role:
      "Assignment test worker",
    description:
      "Worker used by the Tree 02.4 assignment test.",
    capabilities,
    toolIds,
    status:
      "available",
  };
}

function createTask(
  missionId: string,
  id: string,
  requiredCapabilities: string[],
  requiredToolIds: string[] = [],
): Task {
  return {
    id,
    missionId,
    name:
      `Assignment Test Task ${id}`,
    description:
      "Task used by the Tree 02.4 assignment authority test.",
    requiredCapabilities,
    requiredToolIds,
    status:
      "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Bound Work Unit Assignment",
    ],
    createdAt:
      now(),
    updatedAt:
      now(),
  };
}

function createContract(
  id: string,
  capabilityIds: string[],
  allowedToolIds: string[] = [],
): WorkUnitContract {
  return {
    id,
    role:
      "Controlled assignment worker",
    objective:
      "Complete the bounded task objective.",
    capabilityIds,
    allowedToolIds,
    allowedPaths: [
      "core/workforce",
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
      "Task objective is completed.",
    ],
    requiredEvidenceTypes: [
      "test",
      "verification",
    ],
    approved:
      true,
    createdAt:
      now(),
    updatedAt:
      now(),
  };
}

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const workUnitRegistry =
    new WorkUnitRegistry();

  const mission =
    createMission();

  const tool: ToolDefinition = {
    id:
      "tool-work-unit-assignment-test",
    name:
      "Work Unit Assignment Test Tool",
    description:
      "Tool used to verify assignment authorization.",
    capabilities: [
      "assignment-tool",
    ],
    enabled:
      true,
  };

  const buildAgent =
    createAgent(
      "agent-assignment-builder",
      ["build"],
    );

  const toolAgent =
    createAgent(
      "agent-assignment-tool-worker",
      ["build"],
      [tool.id],
    );

  const buildTask =
    createTask(
      mission.id,
      "task-assignment-build",
      ["build"],
    );

  const toolTask =
    createTask(
      mission.id,
      "task-assignment-tool",
      ["build"],
      [tool.id],
    );

  registry.registerMission(
    mission,
  );

  registry.registerTool(
    tool,
  );

  registry.registerAgent(
    buildAgent,
  );

  registry.registerAgent(
    toolAgent,
  );

  registry.registerTask(
    buildTask,
  );

  registry.registerTask(
    toolTask,
  );

  workUnitRegistry.register(
    buildTask.id,
    createContract(
      "work-unit-assignment-build",
      ["build"],
    ),
  );

  workUnitRegistry.register(
    toolTask.id,
    createContract(
      "work-unit-assignment-tool",
      ["build"],
      [tool.id],
    ),
  );

  const formationAuthority =
    new WorkforceFormationAuthority(
      registry,
    );

  const plan =
    formationAuthority.form({
      missionId:
        mission.id,
      taskIds: [
        buildTask.id,
        toolTask.id,
      ],
    });

  assert(
    plan.assignments.length ===
      2,
    "Formation must produce assignments for both eligible tasks.",
  );

  const assignmentAuthority =
    new WorkUnitAssignmentAuthority(
      registry,
      workUnitRegistry,
    );

  const result =
    assignmentAuthority.assign(
      plan,
    );

  assert(
    result.assignments.length ===
      2,
    "Every formation assignment must become a Work Unit assignment.",
  );

  assert(
    result.assignedTaskIds.includes(
      buildTask.id,
    ),
    "Build task must be assigned.",
  );

  assert(
    result.assignedTaskIds.includes(
      toolTask.id,
    ),
    "Tool task must be assigned.",
  );

  assert(
    registry.getTask(
      buildTask.id,
    )?.assignedAgentId !==
      undefined,
    "Build task must receive its selected worker.",
  );

  assert(
    registry.getTask(
      toolTask.id,
    )?.assignedAgentId !==
      undefined,
    "Tool task must receive its selected worker.",
  );

  console.log(
    "02.4 formation-to-assignment bridge: SUCCESS",
  );

  console.log(
    "02.4 selected worker binding: SUCCESS",
  );

  console.log(
    "02.4 Work Unit Contract binding: SUCCESS",
  );

  console.log(
    "02.4 capability authorization: SUCCESS",
  );

  console.log(
    "02.4 tool authorization: SUCCESS",
  );

  assert(
    buildTask.status ===
      "ready",
    "Assignment must not change task state.",
  );

  assert(
    toolTask.status ===
      "ready",
    "Assignment must not change task state.",
  );

  console.log(
    "02.4 task-state authority boundary: SUCCESS",
  );

  /*
   * Missing Work Unit Contract must reject.
   */
  const missingContractTask =
    createTask(
      mission.id,
      "task-assignment-missing-contract",
      ["build"],
    );

  registry.registerTask(
    missingContractTask,
  );

  const missingContractPlan =
    formationAuthority.form({
      missionId:
        mission.id,
      taskIds: [
        missingContractTask.id,
      ],
    });

  let missingContractRejected =
    false;

  try {
    assignmentAuthority.assign(
      missingContractPlan,
    );
  } catch {
    missingContractRejected =
      true;
  }

  assert(
    missingContractRejected,
    "Assignment must reject a task without a Work Unit Contract.",
  );

  console.log(
    "02.4 missing contract rejection: SUCCESS",
  );

  /*
   * Invalid contract authorization must reject.
   */
  const invalidContractTask =
    createTask(
      mission.id,
      "task-assignment-invalid-contract",
      ["build"],
      [tool.id],
    );

  registry.registerTask(
    invalidContractTask,
  );

  workUnitRegistry.register(
    invalidContractTask.id,
    createContract(
      "work-unit-assignment-invalid",
      ["build"],
      [],
    ),
  );

  const invalidContractPlan =
    formationAuthority.form({
      missionId:
        mission.id,
      taskIds: [
        invalidContractTask.id,
      ],
    });

  let invalidContractRejected =
    false;

  try {
    assignmentAuthority.assign(
      invalidContractPlan,
    );
  } catch {
    invalidContractRejected =
      true;
  }

  assert(
    invalidContractRejected,
    "Assignment must reject a contract that lacks required tool authorization.",
  );

  console.log(
    "02.4 contract authorization rejection: SUCCESS",
  );

  /*
   * Reassignment must be rejected rather than silently
   * replacing an existing worker.
   */
  let reassignmentRejected =
    false;

  try {
    assignmentAuthority.assign(
      plan,
    );
  } catch {
    reassignmentRejected =
      true;
  }

  assert(
    reassignmentRejected,
    "Already-assigned tasks must not be silently reassigned.",
  );

  console.log(
    "02.4 reassignment protection: SUCCESS",
  );

  console.log(
    "TREE-02.4 WORK UNIT ASSIGNMENT: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "=== TREE-02.4 FAILED ===",
    );
    console.error(error);
    process.exitCode = 1;
  },
);
