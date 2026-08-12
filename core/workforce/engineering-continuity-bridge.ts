import type {
  ID,
} from "./types";

import type {
  EngineeringCompletionResult,
} from "./engineering-completion-authority";

import type {
  EngineeringWorkflowTask,
} from "./engineering-workflow-bridge";

import type {
  DurableEngineeringWorkflow,
} from "./durable-engineering-workflow";

export interface EngineeringContinuityState {
  id:
    ID;
  projectId:
    ID;
  workflowId:
    ID;
  activeTaskId?:
    ID;
  completedTaskIds:
    ID[];
  readyTaskIds:
    ID[];
  interrupted:
    boolean;
  resumeCount:
    number;
  updatedAt:
    string;
}

export interface EngineeringContinuityResumeResult {
  state:
    EngineeringContinuityState;
  workflow:
    DurableEngineeringWorkflow;
}

export class EngineeringContinuityBridgeAuthority {
  create(
    workflow:
      DurableEngineeringWorkflow,
    updatedAt:
      string,
  ):
    EngineeringContinuityState {
    const completedTaskIds =
      workflow.tasks
        .filter(
          (task) =>
            task.status ===
            "completed",
        )
        .map(
          (task) =>
            task.id,
        );

    const readyTaskIds =
      workflow.tasks
        .filter(
          (task) =>
            task.status ===
            "ready",
        )
        .map(
          (task) =>
            task.id,
        );

    return {
      id:
        `engineering-continuity-${workflow.id}`,
      projectId:
        workflow.projectId,
      workflowId:
        workflow.id,
      activeTaskId:
        workflow.activeTaskId,
      completedTaskIds,
      readyTaskIds,
      interrupted:
        false,
      resumeCount:
        0,
      updatedAt,
    };
  }

  interrupt(
    state:
      EngineeringContinuityState,
    updatedAt:
      string,
  ):
    EngineeringContinuityState {
    return {
      ...state,
      interrupted:
        true,
      updatedAt,
    };
  }

  resume(
    state:
      EngineeringContinuityState,
    workflow:
      DurableEngineeringWorkflow,
    updatedAt:
      string,
  ):
    EngineeringContinuityResumeResult {
    if (
      state.projectId !==
      workflow.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Continuity: project identity mismatch",
      );
    }

    if (
      state.workflowId !==
      workflow.id
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Continuity: workflow identity mismatch",
      );
    }

    const completedTaskIds =
      workflow.tasks
        .filter(
          (task) =>
            task.status ===
            "completed",
        )
        .map(
          (task) =>
            task.id,
        );

    const readyTaskIds =
      workflow.tasks
        .filter(
          (task) =>
            task.status ===
            "ready",
        )
        .map(
          (task) =>
            task.id,
        );

    const nextState:
      EngineeringContinuityState =
      {
        ...state,
        activeTaskId:
          workflow.activeTaskId,
        completedTaskIds,
        readyTaskIds,
        interrupted:
          false,
        resumeCount:
          state.resumeCount +
          1,
        updatedAt,
      };

    return {
      state:
        nextState,
      workflow,
    };
  }

  acceptCompletion(
    state:
      EngineeringContinuityState,
    workflow:
      DurableEngineeringWorkflow,
    completion:
      EngineeringCompletionResult,
    updatedAt:
      string,
  ):
    EngineeringContinuityState {
    if (
      !completion.completed
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Continuity: unverified engineering work cannot advance continuity",
      );
    }

    if (
      completion.projectId !==
      workflow.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Continuity: completion project does not match workflow project",
      );
    }

    const completedTaskIds =
      new Set(
        state.completedTaskIds,
      );

    completedTaskIds.add(
      completion.taskId,
    );

    const readyTaskIds =
      workflow.tasks
        .filter(
          (task) =>
            task.status ===
            "ready",
        )
        .map(
          (task) =>
            task.id,
        );

    return {
      ...state,
      activeTaskId:
        workflow.activeTaskId,
      completedTaskIds: [
        ...completedTaskIds,
      ],
      readyTaskIds,
      updatedAt,
    };
  }
}
