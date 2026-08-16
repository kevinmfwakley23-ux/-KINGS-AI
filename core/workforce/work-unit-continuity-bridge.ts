import type {
  ID,
} from "./types";

import type {
  ExecutionContinuityAuthority,
  ExecutionContinuityRecord,
} from "./execution-continuity";

import type {
  DurableWorkflowResumeAuthority,
  DurableWorkflowResumeResult,
  DurableWorkflowState,
} from "./durable-workflow-resume";

import type {
  WorkUnitExecutionState,
} from "./work-unit-execution-state";

export interface WorkUnitContinuityBridgeRequest {
  missionId:
    ID;

  workflowId:
    ID;

  ownerId:
    ID;

  runtimeSessionId:
    ID;

  runtimeDefinitionId:
    ID;

  executionId:
    ID;

  state:
    WorkUnitExecutionState;
}

export class WorkUnitContinuityBridge {
  constructor(
    private readonly executionContinuity:
      ExecutionContinuityAuthority,

    private readonly durableWorkflow:
      DurableWorkflowResumeAuthority,
  ) {}

  start(
    request:
      WorkUnitContinuityBridgeRequest,
    startedAt:
      string,
  ):
    ExecutionContinuityRecord {
    return this.executionContinuity.start({
      id:
        request.executionId,

      missionId:
        request.missionId,

      taskId:
        request.state.workUnitId,

      agentId:
        request.ownerId,

      runtimeSessionId:
        request.runtimeSessionId,

      runtimeDefinitionId:
        request.runtimeDefinitionId,

      startedAt,
    });
  }

  checkpoint(
    executionId:
      ID,
    updatedAt:
      string,
  ):
    ExecutionContinuityRecord {
    return this.executionContinuity.checkpoint({
      executionId,
      updatedAt,
    });
  }

  pause(
    executionId:
      ID,
    updatedAt:
      string,
  ):
    ExecutionContinuityRecord {
    return this.executionContinuity.pause(
      executionId,
      updatedAt,
    );
  }

  complete(
    request:
      WorkUnitContinuityBridgeRequest,
    execution:
      ExecutionContinuityRecord,
    updatedAt:
      string,
  ):
    DurableWorkflowState {
    const completedExecution =
      this.executionContinuity.complete(
        execution.id,
        updatedAt,
      );

    return this.durableWorkflow.recordTaskCompletion(
      request.workflowId,
      request.state.workUnitId,
      request.state.evidence.map(
        (
          _,
          index,
        ) =>
          `${request.state.workUnitId}:evidence:${index}`,
      ),
      [],
      updatedAt,
      updatedAt,
    );
  }

  fail(
    executionId:
      ID,
    updatedAt:
      string,
  ):
    ExecutionContinuityRecord {
    return this.executionContinuity.fail(
      executionId,
      updatedAt,
    );
  }

  resume(
    workflowId:
      ID,

    execution:
      ExecutionContinuityRecord,

    recovery:
      Parameters<
        DurableWorkflowResumeAuthority["resume"]
      >[2],

    updatedAt:
      string,
  ):
    DurableWorkflowResumeResult {
    return this.durableWorkflow.resume(
      workflowId,
      execution,
      recovery,
      updatedAt,
    );
  }

  interrupted(
    executionId:
      ID,
    workflowId:
      ID,
    recovery:
      Parameters<
        DurableWorkflowResumeAuthority["markInterrupted"]
      >[2],
    updatedAt:
      string,
  ):
    DurableWorkflowState {
    const execution =
      this.executionContinuity.get(
        executionId,
      );

    if (!execution) {
      throw new Error(
        `K.I.N.G.S. Work Unit Continuity: execution "${executionId}" was not found`,
      );
    }

    return this.durableWorkflow.markInterrupted(
      workflowId,
      execution,
      recovery,
      updatedAt,
    );
  }
}
