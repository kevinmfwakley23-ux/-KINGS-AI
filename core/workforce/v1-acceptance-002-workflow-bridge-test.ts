import {
  V1AcceptanceWorkflowBridge,
} from "./v1-acceptance-002-workflow-bridge";

import {
  V1AcceptanceAuthority,
} from "./v1-acceptance-001";

import type {
  AgentDefinition,
  Task,
  ToolDefinition,
  Workflow,
} from "./types";

import {
  WorkforceRegistry,
} from "./registry";

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

const MISSION_ID =
  "mission-v1-acceptance-002";

function createAgent(): AgentDefinition {
  return {
    id:
      "agent-v1-acceptance-002",

    name:
      "V1 Acceptance Integration Agent",

    role:
      "acceptance-workflow-integration",

    description:
      "Controlled agent for V1 acceptance workflow integration.",

    capabilities: [
      "engineering",
    ],

    toolIds: [
      "tool-v1-acceptance-002",
    ],

    status:
      "available",
  };
}

function createTool(): ToolDefinition {
  return {
    id:
      "tool-v1-acceptance-002",

    name:
      "V1 Acceptance Integration Tool",

    description:
      "Controlled tool for V1 acceptance workflow integration.",

    capabilities: [
      "engineering",
    ],

    enabled:
      true,
  };
}

function createTask(
  id: string,
  status:
    | "pending"
    | "ready"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "blocked",
  dependencyIds: string[],
): Task {
  const now =
    new Date().toISOString();

  return {
    id,

    missionId:
      MISSION_ID,

    name:
      `Task ${id}`,

    description:
      `Controlled V1 acceptance workflow task ${id}.`,

    status,

    dependencyIds,

    assignedAgentId:
      "agent-v1-acceptance-002",

    requiredCapabilities: [
      "engineering",
    ],

    requiredToolIds: [
      "tool-v1-acceptance-002",
    ],

    inputReferences: [],

    expectedOutputs: [
      "V1 acceptance workflow decision",
    ],

    createdAt:
      now,

    updatedAt:
      now,
  };
}

function createWorkflow(
  taskIds: string[],
): Workflow {
  return {
    id:
      "workflow-v1-acceptance-002",

    missionId:
      MISSION_ID,

    name:
      "V1 Acceptance Workflow Integration",

    description:
      "Controlled workflow for acceptance dependency propagation.",

    taskIds,

    requiresApproval:
      false,
  };
}

function main(): void {
  const registry =
    new WorkforceRegistry();

  registry.registerAgent(
    createAgent(),
  );

  registry.registerTool(
    createTool(),
  );

  const dependencyTask =
    createTask(
      "task-v1-acceptance-002-dependency",
      "completed",
      [],
    );

  const dependentTask =
    createTask(
      "task-v1-acceptance-002-dependent",
      "ready",
      [
        dependencyTask.id,
      ],
    );

  registry.registerTask(
    dependencyTask,
  );

  registry.registerTask(
    dependentTask,
  );

  registry.registerWorkflow(
    createWorkflow([
      dependencyTask.id,
      dependentTask.id,
    ]),
  );

  const authority =
    new V1AcceptanceAuthority();

  const bridge =
    new V1AcceptanceWorkflowBridge(
      registry,
    );

  const accepted =
    authority.evaluate({
      taskId:
        dependencyTask.id,

      completion: {
        taskId:
          dependencyTask.id,

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-typecheck",
          "evidence-runtime",
        ],
      },
    });

  const acceptedBridge =
    bridge.evaluate({
      dependencyTask,

      dependentTask,

      acceptance:
        accepted,
    });

  assert(
    accepted.accepted,
    "Completed dependency acceptance should pass.",
  );

  assert(
    acceptedBridge.accepted,
    "Accepted completed work should satisfy the workflow acceptance bridge.",
  );

  assert(
    acceptedBridge.dependency.status ===
      "satisfied",
    "Accepted dependency should be marked satisfied.",
  );

  assert(
    acceptedBridge.dependency.evidenceIds.includes(
      "evidence-typecheck",
    ),
    "Acceptance evidence must propagate into dependency decision.",
  );

  assert(
    acceptedBridge.dependency.acceptanceId ===
      accepted.id,
    "Acceptance identity must propagate into dependency decision.",
  );

  console.log(
    "001.V1-ACCEPTANCE-002 accepted dependency propagation: SUCCESS",
  );

  const rejected =
    authority.evaluate({
      taskId:
        dependencyTask.id,

      completion: {
        taskId:
          dependencyTask.id,

        passed:
          false,

        reasons: [
          "Required runtime evidence is missing.",
        ],

        evidenceIds: [
          "evidence-typecheck",
        ],
      },
    });

  const rejectedBridge =
    bridge.evaluate({
      dependencyTask,

      dependentTask,

      acceptance:
        rejected,
    });

  assert(
    !rejected.accepted,
    "Rejected dependency acceptance must fail.",
  );

  assert(
    !rejectedBridge.accepted,
    "Rejected acceptance must not unlock dependent workflow work.",
  );

  assert(
    rejectedBridge.dependency.status ===
      "blocked",
    "Rejected acceptance must produce a blocked dependency decision.",
  );

  assert(
    rejectedBridge.dependency.reasons.some(
      (reason) =>
        reason.includes(
          "Acceptance rejected:",
        ),
    ),
    "Acceptance rejection provenance must be preserved.",
  );

  console.log(
    "002.V1-ACCEPTANCE-002 rejection propagation: SUCCESS",
  );

  const incompleteDependency =
    createTask(
      "task-v1-acceptance-002-incomplete",
      "ready",
      [],
    );

  const blockedDependent =
    createTask(
      "task-v1-acceptance-002-blocked-dependent",
      "ready",
      [
        incompleteDependency.id,
      ],
    );

  registry.registerTask(
    incompleteDependency,
  );

  registry.registerTask(
    blockedDependent,
  );

  const blockedAcceptance =
    authority.evaluate({
      taskId:
        incompleteDependency.id,

      completion: {
        taskId:
          incompleteDependency.id,

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-typecheck",
        ],
      },
    });

  const blockedBridge =
    bridge.evaluate({
      dependencyTask:
        incompleteDependency,

      dependentTask:
        blockedDependent,

      acceptance:
        blockedAcceptance,
    });

  assert(
    !blockedBridge.accepted,
    "Uncompleted dependency work must not satisfy workflow dependency requirements.",
  );

  assert(
    blockedBridge.dependency.status ===
      "blocked",
    "Incomplete dependency must remain blocked.",
  );

  assert(
    blockedBridge.dependentReadiness.status ===
      "blocked",
    "Dependent task must remain blocked while its dependency is incomplete.",
  );

  console.log(
    "003.V1-ACCEPTANCE-002 incomplete dependency blocking: SUCCESS",
  );

  const invalidDependent =
    createTask(
      "task-v1-acceptance-002-invalid-dependent",
      "ready",
      [
        dependencyTask.id,
      ],
    );

  invalidDependent.assignedAgentId =
    "missing-agent";

  registry.registerTask(
    invalidDependent,
  );

  const invalidBridge =
    bridge.evaluate({
      dependencyTask,

      dependentTask:
        invalidDependent,

      acceptance:
        accepted,
    });

  assert(
    !invalidBridge.accepted,
    "Invalid dependent workflow work must not be accepted.",
  );

  assert(
    invalidBridge.dependency.status ===
      "invalid",
    "Invalid dependent workflow state must be explicitly classified.",
  );

  assert(
    invalidBridge.dependency.reasons.some(
      (reason) =>
        reason.includes(
          "Dependent task invalid:",
        ),
    ),
    "Invalid workflow rejection provenance must be preserved.",
  );

  console.log(
    "004.V1-ACCEPTANCE-002 invalid dependent rejection: SUCCESS",
  );

  assert(
    acceptedBridge.dependency.dependencyTaskId ===
      dependencyTask.id,
    "Dependency task identity must be preserved.",
  );

  assert(
    acceptedBridge.dependency.verificationIds.length ===
      accepted.verificationIds.length,
    "Acceptance verification provenance must be preserved.",
  );

  assert(
    acceptedBridge.dependency.evidenceIds.length ===
      accepted.evidenceIds.length,
    "Acceptance evidence provenance must be preserved.",
  );

  console.log(
    "005.V1-ACCEPTANCE-002 provenance preservation: SUCCESS",
  );

  console.log(
    "V1-ACCEPTANCE-002 ACCEPTANCE → DEPENDENCY → READINESS BRIDGE: SUCCESS",
  );
}

main();
