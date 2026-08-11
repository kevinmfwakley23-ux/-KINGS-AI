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
  WorkforceFormationAuthority,
} from "./workforce-formation";

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

function createMission(): Mission {
  const now =
    new Date().toISOString();

  return {
    id:
      "mission-workforce-formation-test",
    name:
      "Workforce Formation Test",
    description:
      "Verify deterministic K.I.N.G.S. workforce formation.",
    status:
      "active",
    objectives: [
      "Select workers according to task capabilities.",
      "Respect tool authorization.",
      "Prefer exact capability matches.",
      "Preserve K.I.N.G.S. authority over formation.",
    ],
    sourceReferences: [],
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function createTask(
  missionId: string,
  id: string,
  name: string,
  requiredCapabilities: string[],
  requiredToolIds: string[] = [],
): Task {
  const now =
    new Date().toISOString();

  return {
    id,
    missionId,
    name,
    description:
      "Deterministic workforce formation test task.",
    requiredCapabilities,
    requiredToolIds,
    status:
      "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Correct workforce formation assignment.",
    ],
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function createAgent(
  id: string,
  role: string,
  capabilities: string[],
  toolIds: string[] = [],
  status:
    AgentDefinition["status"] =
    "available",
): AgentDefinition {
  return {
    id,
    name:
      `Formation Test Agent ${id}`,
    role,
    description:
      "Deterministic worker used by the Tree 02 workforce formation test.",
    capabilities,
    toolIds,
    status,
  };
}

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const mission =
    createMission();

  const tool: ToolDefinition = {
    id:
      "tool-formation-test",
    name:
      "Formation Test Tool",
    description:
      "Tool used to verify workforce formation authorization.",
    capabilities: [
      "formation-tool",
    ],
    enabled:
      true,
  };

  const buildTask =
    createTask(
      mission.id,
      "task-formation-build",
      "Build task",
      ["build"],
    );

  const researchTask =
    createTask(
      mission.id,
      "task-formation-research",
      "Research task",
      ["research"],
    );

  const toolTask =
    createTask(
      mission.id,
      "task-formation-tool",
      "Tool task",
      ["build"],
      [tool.id],
    );

  const exactBuildAgent =
    createAgent(
      "agent-build-specialist",
      "Build Specialist",
      ["build"],
    );

  const generalBuildAgent =
    createAgent(
      "agent-general-builder",
      "General Builder",
      [
        "build",
        "research",
      ],
    );

  const researchAgent =
    createAgent(
      "agent-research-specialist",
      "Research Specialist",
      ["research"],
    );

  const unauthorizedToolAgent =
    createAgent(
      "agent-unauthorized-tool",
      "Unauthorized Tool Worker",
      ["build"],
    );

  const authorizedToolAgent =
    createAgent(
      "agent-authorized-tool",
      "Authorized Tool Worker",
      ["build"],
      [tool.id],
    );

  const busyAgent =
    createAgent(
      "agent-busy-build",
      "Busy Build Worker",
      ["build"],
      [],
      "busy",
    );

  registry.registerMission(
    mission,
  );

  registry.registerTool(
    tool,
  );

  registry.registerAgent(
    exactBuildAgent,
  );

  registry.registerAgent(
    generalBuildAgent,
  );

  registry.registerAgent(
    researchAgent,
  );

  registry.registerAgent(
    unauthorizedToolAgent,
  );

  registry.registerAgent(
    authorizedToolAgent,
  );

  registry.registerAgent(
    busyAgent,
  );

  registry.registerTask(
    buildTask,
  );

  registry.registerTask(
    researchTask,
  );

  registry.registerTask(
    toolTask,
  );

  const authority =
    new WorkforceFormationAuthority(
      registry,
    );

  const plan =
    authority.form({
      missionId:
        mission.id,
      taskIds: [
        buildTask.id,
        researchTask.id,
        toolTask.id,
      ],
    });

  assert(
    plan.assignments.length ===
      3,
    "All eligible tasks should receive a workforce assignment.",
  );

  const buildAssignment =
    plan.assignments.find(
      (assignment) =>
        assignment.taskId ===
        buildTask.id,
    );

  assert(
    buildAssignment !==
      undefined,
    "Build task must receive an assignment.",
  );

  assert(
    buildAssignment?.agentId ===
      exactBuildAgent.id,
    "Formation should prefer the exact specialist over the broader generalist.",
  );

  const researchAssignment =
    plan.assignments.find(
      (assignment) =>
        assignment.taskId ===
        researchTask.id,
    );

  assert(
    researchAssignment?.agentId ===
      researchAgent.id,
    "Research task must be assigned to the research-capable worker.",
  );

  const toolAssignment =
    plan.assignments.find(
      (assignment) =>
        assignment.taskId ===
        toolTask.id,
    );

  assert(
    toolAssignment?.agentId ===
      authorizedToolAgent.id,
    "Tool-requiring task must be assigned only to a worker authorized for the required tool.",
  );

  assert(
    toolAssignment?.agentId !==
      unauthorizedToolAgent.id,
    "Formation must reject workers lacking required tool authorization.",
  );

  assert(
    toolAssignment?.agentId !==
      busyAgent.id,
    "Formation must reject workers who are not available.",
  );

  assert(
    buildTask.assignedAgentId ===
      undefined,
    "Formation must not mutate task assignment state.",
  );

  console.log(
    "02.3 workforce formation authority: SUCCESS",
  );

  console.log(
    "02.3 capability matching during formation: SUCCESS",
  );

  console.log(
    "02.3 tool authorization during formation: SUCCESS",
  );

  console.log(
    "02.3 deterministic specialist preference: SUCCESS",
  );

  console.log(
    "02.3 formation preserves task authority boundary: SUCCESS",
  );

  const failureTask =
    createTask(
      mission.id,
      "task-formation-impossible",
      "Impossible task",
      [
        "capability-that-does-not-exist",
      ],
    );

  registry.registerTask(
    failureTask,
  );

  const failurePlan =
    authority.form({
      missionId:
        mission.id,
      taskIds: [
        failureTask.id,
      ],
    });

  assert(
    failurePlan.assignments.length ===
      0,
    "An impossible task must not receive an assignment.",
  );

  assert(
    failurePlan.rejectedTasks.length ===
      1,
    "An impossible task must be explicitly rejected.",
  );

  assert(
    failurePlan.rejectedTasks[0].reasons
      .length > 0,
    "Formation rejection must preserve an explanation.",
  );

  console.log(
    "02.3 unsatisfied workforce formation rejection: SUCCESS",
  );

  console.log(
    "TREE-02.3 WORKFORCE FORMATION: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "TREE-02.3 WORKFORCE FORMATION: FAILED",
    );

    console.error(
      error,
    );

    throw error;
  },
);
