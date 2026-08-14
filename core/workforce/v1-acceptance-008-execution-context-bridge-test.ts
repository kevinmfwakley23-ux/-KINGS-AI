import {
  V1AcceptanceAuthority,
} from "./v1-acceptance-001";

import {
  V1AcceptanceExecutionContextBridge,
  createObservingAdapter,
} from "./v1-acceptance-008-execution-context-bridge";

import {
  RuntimeAwareWorkforceExecutor,
} from "./execution/runtime-aware-executor";

import {
  WorkforceRegistry,
} from "./registry";

import {
  WorkforceRuntimeBindingRegistry,
} from "./runtime-binding-registry";

import {
  MemoryStore,
} from "./memory-store";

import {
  MemoryPromotionGate,
} from "./memory-promotion-gate";

import {
  MissionMemoryBridge,
} from "./mission-memory-bridge";

import type {
  AgentDefinition,
  Mission,
  Task,
} from "./types";

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

async function main(): Promise<void> {
  const now =
    new Date().toISOString();

  const registry =
    new WorkforceRegistry();

  const runtimeBindings =
    new WorkforceRuntimeBindingRegistry();

  const memoryStore =
    new MemoryStore();

  const promotionGate =
    new MemoryPromotionGate();

  const missionMemory =
    new MissionMemoryBridge(
      memoryStore,
      promotionGate,
    );

  const mission:
    Mission = {
    id:
      "mission-v1-acceptance-008",

    name:
      "V1 Acceptance 008",

    description:
      "Acceptance context execution integration.",

    status:
      "active",

    objectives: [
      "Deliver governed mission memory into execution.",
    ],

    sourceReferences: [],

    createdAt:
      now,

    updatedAt:
      now,
  };

  registry.registerMission(
    mission,
  );

  const agent:
    AgentDefinition = {
    id:
      "agent-v1-acceptance-008",

    name:
      "V1 Acceptance 008 Agent",

    role:
      "execution-context-observer",

    description:
      "Observes governed mission context at the adapter boundary.",

    capabilities: [
      "v1-acceptance-008",
    ],

    toolIds: [],

    status:
      "available",
  };

  registry.registerAgent(
    agent,
  );

  const task:
    Task = {
    id:
      "task-v1-acceptance-008",

    missionId:
      mission.id,

    name:
      "Consume accepted context",

    description:
      "Verify accepted mission memory reaches execution.",

    status:
      "ready",

    dependencyIds: [],

    assignedAgentId:
      agent.id,

    requiredCapabilities: [
      "v1-acceptance-008",
    ],

    requiredToolIds: [],

    createdAt:
      now,

    updatedAt:
      now,

    inputReferences: [],

    expectedOutputs: [
      "execution-context",
    ],
  };

  registry.registerTask(
    task,
  );

  missionMemory.rememberCheckpoint(
    {
      id:
        "checkpoint-v1-acceptance-008",

      missionId:
        mission.id,

      planId:
        "plan-v1-acceptance-008",

      planVersion:
        1,

      state: {
        missionId:
          mission.id,

        activeTaskIds: [
          task.id,
        ],

        completedTaskIds: [],

        blockedTaskIds: [],

        failedTaskIds: [],

        openQuestionIds: [],

        riskIds: [],

        artifactIds: [
          "artifact-v1-acceptance-008",
        ],

        evidenceIds: [
          "evidence-v1-acceptance-008",
        ],

        updatedAt:
          now,
      },

      summary:
        "Accepted execution-context checkpoint.",

      reason:
        "Acceptance 008 governed execution context.",

      createdAt:
        now,
    },
        "episodic",
  );

  const observed:
    {
      missionContext:
        boolean;

      memories:
        number;

      knowledge:
        boolean;
    } = {
    missionContext:
      false,

    memories:
      0,

    knowledge:
      false,
  };

  const adapter =
    createObservingAdapter(
      (
        context,
      ) => {
        observed.missionContext =
          context.missionContext !==
          undefined;

        observed.memories =
          context.missionContext
            ?.memories.length ??
          0;

        observed.knowledge =
          context.knowledge !==
          undefined;
      },
    );

  const executor =
    new RuntimeAwareWorkforceExecutor(
      registry,
      [adapter],
      runtimeBindings,
      missionMemory,
    );

  const bridge =
    new V1AcceptanceExecutionContextBridge(
      executor,
    );

  const authority =
    new V1AcceptanceAuthority();

  const acceptance =
    authority.evaluate({
      taskId:
        task.id,

      completion: {
        taskId:
          task.id,

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-v1-acceptance-008",
        ],
      },

      engineeringCompletion: {
        id:
          "completion-v1-acceptance-008",

        projectId:
          "project-kings",

        taskId:
          task.id,

        completed:
          true,

        reason:
          "Execution context integration verified.",

        verificationId:
          "verification-v1-acceptance-008",

        unmetCriteria: [],
      },
    });

  assert(
    acceptance.accepted,
    "Acceptance prerequisite must pass.",
  );

  console.log(
    "001.V1-ACCEPTANCE-008 acceptance prerequisite: SUCCESS",
  );

  const execution =
    await bridge.executeAccepted({
      acceptance,

      task,
    });

  assert(
    execution.accepted,
    "Accepted work must remain accepted.",
  );

  assert(
    execution.executed,
    "Accepted work must execute through the real workforce executor.",
  );

  console.log(
    "002.V1-ACCEPTANCE-008 accepted work → real workforce executor: SUCCESS",
  );

  assert(
    observed.missionContext,
    "Real execution adapter must receive unified mission context.",
  );

  assert(
    observed.memories >
      0,
    "Real execution adapter must receive governed mission memory.",
  );

  console.log(
    "003.V1-ACCEPTANCE-008 governed mission memory → adapter context: SUCCESS",
  );

  const rejectedAcceptance =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-008-rejected",

      completion: {
        taskId:
          "task-v1-acceptance-008-rejected",

        passed:
          false,

        reasons: [
          "Acceptance verification failed.",
        ],

        evidenceIds: [
          "partial-evidence",
        ],
      },
    });

  const rejected =
    await bridge.executeAccepted({
      acceptance:
        rejectedAcceptance,

      task,
    });

  assert(
    !rejected.accepted,
    "Rejected acceptance must remain rejected.",
  );

  assert(
    !rejected.executed,
    "Rejected acceptance must not execute.",
  );

  console.log(
    "004.V1-ACCEPTANCE-008 rejected acceptance blocked before executor: SUCCESS",
  );

  console.log(
    "V1-ACCEPTANCE-008 ACCEPTANCE → GOVERNED MISSION CONTEXT → REAL WORKFORCE EXECUTION: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );
    void 0;
  },
);
