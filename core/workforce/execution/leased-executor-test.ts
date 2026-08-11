import type {
  AgentDefinition,
  Mission,
  Task,
  ToolDefinition,
} from "../types";

import {
  WorkforceRegistry,
} from "../registry";

import {
  TaskLeaseManager,
} from "../task-lease";

import {
  WorkforceExecutor,
} from "./executor";

import {
  LeasedWorkforceExecutor,
} from "./leased-executor";

import {
  TestExecutionAdapter,
} from "./test-adapter";

import {
  WorkUnitRegistry,
} from "../work-unit-registry";

import {
  registerTestWorkUnit,
} from "./test-work-unit";

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

async function main(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const tool: ToolDefinition = {
    id: "tool-control-003",
    name: "CONTROL-003 Test Tool",
    description:
      "Tool used to verify leased execution authority.",
    capabilities: ["test-tool"],
    enabled: true,
  };

  const agent: AgentDefinition = {
    id: "agent-control-003",
    name: "CONTROL-003 Test Agent",
    role: "Leased execution worker",
    description:
      "Agent used to verify lease-bound execution.",
    capabilities: ["test"],
    toolIds: [tool.id],
    status: "available",
  };

  const mission: Mission = {
    id: "mission-control-003",
    name: "Leased Execution Authority Test",
    description:
      "Verify execution requires valid lease ownership.",
    status: "active",
    objectives: [
      "Reject execution without a lease.",
      "Reject execution by a non-owner.",
      "Allow execution by the lease owner.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  const task: Task = {
    id: "task-control-003",
    missionId: mission.id,
    name: "Leased Execution Test",
    description:
      "Verify execution authority is bound to lease ownership.",
    assignedAgentId: agent.id,
    requiredCapabilities: ["test"],
    requiredToolIds: [tool.id],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "lease-bound execution",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };

  registry.registerTool(tool);
  registry.registerAgent(agent);
  registry.registerMission(mission);
  registry.registerTask(task);

  const leaseManager =
    new TaskLeaseManager(
      registry,
    );

  const workUnitRegistry =
    new WorkUnitRegistry();

  registerTestWorkUnit(
    workUnitRegistry,
    task.id,
  );

  const workforceExecutor =
    new WorkforceExecutor(
      registry,
      [new TestExecutionAdapter()],
      undefined,
      workUnitRegistry,
    );

  const leasedExecutor =
    new LeasedWorkforceExecutor(
      registry,
      leaseManager,
      workforceExecutor,
    );

  let noLeaseRejected =
    false;

  try {
    await leasedExecutor.execute(
      task.id,
      "worker-001",
    );
  } catch {
    noLeaseRejected =
      true;
  }

  assert(
    noLeaseRejected,
    "Execution without a lease must be rejected.",
  );

  const lease =
    leaseManager.claim(
      task.id,
      "worker-001",
      60_000,
    );

  assert(
    task.status === "ready",
    "Claiming a task must not change its execution state.",
  );

  let wrongOwnerRejected =
    false;

  try {
    await leasedExecutor.execute(
      task.id,
      "worker-002",
    );
  } catch {
    wrongOwnerRejected =
      true;
  }

  assert(
    wrongOwnerRejected,
    "Execution by a non-owner must be rejected.",
  );

  const result =
    await leasedExecutor.execute(
      task.id,
      "worker-001",
    );

  assert(
    result.status === "success",
    "Lease owner should be allowed to execute the task.",
  );

  assert(
    result.taskId === task.id,
    "Execution result should reference the leased task.",
  );

  assert(
    task.status === "ready",
    "Execution authority must not alter task execution state.",
  );

  assert(
    leaseManager.get(task.id)
      ?.leaseId === lease.leaseId,
    "Lease must remain active during authorized execution.",
  );

  leaseManager.release(
    task.id,
    "worker-001",
  );

  assert(
    leaseManager.get(task.id)
      === undefined,
    "Lease should be removed after release.",
  );

  console.log(
    "Execution without lease rejection: SUCCESS",
  );

  console.log(
    "Lease claim preserves task state: SUCCESS",
  );

  console.log(
    "Wrong lease owner rejection: SUCCESS",
  );

  console.log(
    "Lease owner execution: SUCCESS",
  );

  console.log(
    "Execution preserves task state: SUCCESS",
  );

  console.log(
    "Lease remains active during execution: SUCCESS",
  );

  console.log(
    "Lease release after execution: SUCCESS",
  );

  console.log(
    "CONTROL-003 execution authority boundary: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "CONTROL-003 execution authority boundary: FAILED",
    );
    console.error(error);
    throw error;
  },
);
