import {
  WorkUnitContinuityBridge,
  type WorkUnitContinuityBridgeRequest,
} from "./work-unit-continuity-bridge";

const assert: (
  condition: unknown,
  message: string,
) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
};

async function main(): Promise<void> {
  /*
   * This test intentionally uses the bridge's type-level surface
   * and validates the pure lifecycle contract without inventing
   * another persistence mechanism.
   *
   * Full authority construction belongs to the existing
   * ExecutionContinuityAuthority / DurableWorkflowResumeAuthority
   * tests.
   */

  const calls: string[] = [];

  const fakeExecutionContinuity = {
    start(request: any) {
      calls.push("start");
      return {
        id: request.id,
        missionId: request.missionId,
        taskId: request.taskId,
        agentId: request.agentId,
        runtimeSessionId: request.runtimeSessionId,
        runtimeDefinitionId: request.runtimeDefinitionId,
        status: "active",
        startedAt: request.startedAt,
        updatedAt: request.startedAt,
        resumeCount: 0,
      };
    },

    checkpoint(request: any) {
      calls.push("checkpoint");
      return {
        id: request.executionId,
        missionId: "mission-001",
        taskId: "unit-001",
        agentId: "owner-001",
        runtimeSessionId: "runtime-001",
        runtimeDefinitionId: "runtime-definition-001",
        status: "active",
        startedAt: "2026-08-15T00:00:00.000Z",
        updatedAt: request.updatedAt,
        resumeCount: 0,
      };
    },

    complete(id: string, updatedAt: string) {
      calls.push("complete");
      return {
        id,
        missionId: "mission-001",
        taskId: "unit-001",
        agentId: "owner-001",
        runtimeSessionId: "runtime-001",
        runtimeDefinitionId: "runtime-definition-001",
        status: "completed",
        startedAt: "2026-08-15T00:00:00.000Z",
        updatedAt,
        completedAt: updatedAt,
        resumeCount: 0,
      };
    },

    pause(id: string, updatedAt: string) {
      calls.push("pause");
      return {
        id,
        missionId: "mission-001",
        taskId: "unit-001",
        agentId: "owner-001",
        runtimeSessionId: "runtime-001",
        runtimeDefinitionId: "runtime-definition-001",
        status: "paused",
        startedAt: "2026-08-15T00:00:00.000Z",
        updatedAt,
        resumeCount: 0,
      };
    },

    fail(id: string, updatedAt: string) {
      calls.push("fail");
      return {
        id,
        missionId: "mission-001",
        taskId: "unit-001",
        agentId: "owner-001",
        runtimeSessionId: "runtime-001",
        runtimeDefinitionId: "runtime-definition-001",
        status: "failed",
        startedAt: "2026-08-15T00:00:00.000Z",
        updatedAt,
        resumeCount: 0,
      };
    },

    get() {
      return undefined;
    },
  };

  const fakeDurableWorkflow = {
    recordTaskCompletion(
      workflowId: string,
      taskId: string,
      evidenceIds: string[],
      artifactIds: string[],
      completedAt: string,
      updatedAt: string,
    ) {
      calls.push("recordTaskCompletion");

      return {
        id: workflowId,
        missionId: "mission-001",
        workflowId,
        ownerId: "owner-001",
        status: "completed",
        taskStates: [
          {
            taskId,
            status: "completed",
            dependencyIds: [],
            completedAt,
            evidenceIds,
            artifactIds,
          },
        ],
        updatedAt,
      };
    },

    markInterrupted() {
      calls.push("markInterrupted");
      throw new Error(
        "deterministic test stub",
      );
    },
  };

  const bridge =
    new WorkUnitContinuityBridge(
      fakeExecutionContinuity as any,
      fakeDurableWorkflow as any,
    );

  const request:
    WorkUnitContinuityBridgeRequest = {
    missionId:
      "mission-001",

    workflowId:
      "workflow-001",

    ownerId:
      "owner-001",

    runtimeSessionId:
      "runtime-001",

    runtimeDefinitionId:
      "runtime-definition-001",

    executionId:
      "execution-001",

    state: {
      workUnitId:
        "unit-001",

      missionId:
        "mission-001",

      status:
        "completed",

      attempt:
        1,

      targetPath:
        "generated/example.ts",

      reasoningCaptured:
        true,

      codingStarted:
        true,

      verificationPassed:
        true,

      evidence: [
        "reasoning:captured",
        "coding:completed",
        "verification:passed",
      ],

      reasons: [],

      lastCheckpointAt:
        "2026-08-15T00:00:00.000Z",
    },
  };

  const execution =
    bridge.start(
      request,
      "2026-08-15T00:00:00.000Z",
    );

  assert(
    execution.status === "active",
    "bridge did not start execution",
  );

  bridge.checkpoint(
    "execution-001",
    "2026-08-15T00:01:00.000Z",
  );

  const completed =
    bridge.complete(
      request,
      execution,
      "2026-08-15T00:02:00.000Z",
    );

  assert(
    completed.status === "completed",
    "bridge did not promote durable workflow to completed",
  );

  const resumeCalls: string[] = [];

  const resumeBridge =
    new WorkUnitContinuityBridge(
      fakeExecutionContinuity as any,
      {
        ...fakeDurableWorkflow,

        resume(
          workflowId: string,
          resumedExecution: any,
          recovery: any,
          updatedAt: string,
        ) {
          resumeCalls.push(
            workflowId,
          );

          return {
            workflow: {
              id: workflowId,
              missionId: "mission-001",
              workflowId,
              ownerId: "owner-001",
              status: "running",
              taskStates: [
                {
                  taskId: "unit-001",
                  status: "completed",
                  dependencyIds: [],
                  evidenceIds: [],
                  artifactIds: [],
                },
                {
                  taskId: "unit-002",
                  status: "running",
                  dependencyIds: ["unit-001"],
                  evidenceIds: [],
                  artifactIds: [],
                },
              ],
              activeTaskId:
                "unit-002",
              executionId:
                resumedExecution.id,
              runtimeSessionId:
                resumedExecution.runtimeSessionId,
              updatedAt,
            },
            execution:
              resumedExecution,
            recovery,
            resumedTaskId:
              "unit-002",
          };
        },
      } as any,
    );

  const resumed =
    resumeBridge.resume(
      "workflow-001",
      execution,
      {
        id: "recovery-001",
        status: "recovered",
      } as any,
      "2026-08-15T00:03:00.000Z",
    );

  assert(
    resumed.resumedTaskId === "unit-002",
    "bridge did not return the next unfinished work unit",
  );

  assert(
    resumeCalls.includes("workflow-001"),
    "bridge did not forward resume to durable workflow authority",
  );

  assert(
    calls.includes("start"),
    "execution start was not forwarded",
  );

  assert(
    calls.includes("checkpoint"),
    "execution checkpoint was not forwarded",
  );

  assert(
    calls.includes("complete"),
    "execution completion was not forwarded",
  );

  assert(
    calls.includes("recordTaskCompletion"),
    "durable task completion was not forwarded",
  );

  console.log(
    "001.WORK UNIT CONTINUITY → START: SUCCESS",
  );

  console.log(
    "002.WORK UNIT CONTINUITY → CHECKPOINT: SUCCESS",
  );

  console.log(
    "003.WORK UNIT CONTINUITY → COMPLETE: SUCCESS",
  );

  console.log(
    "004.WORK UNIT CONTINUITY → DURABLE WORKFLOW PROMOTION: SUCCESS",
  );

  console.log(
    "005.WORK UNIT CONTINUITY → RESUME HANDOFF: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. WORK-UNIT CONTINUITY BRIDGE: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
