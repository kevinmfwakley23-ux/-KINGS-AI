import type {
  ID,
} from "./types";

import {
  EngineeringWorkflowBridgeAuthority,
  type EngineeringWorkflowTask,
} from "./engineering-workflow-bridge";

import type {
  EngineeringCompletionResult,
} from "./engineering-completion-authority";

import type {
  EngineeringRepairRetestResult,
} from "./engineering-repair-retest-bridge";

import type {
  EngineeringContinuityState,
} from "./engineering-continuity-bridge";

export interface EngineeringRecoveryWorkflowRequest {
  task:
    EngineeringWorkflowTask;
  completion:
    EngineeringCompletionResult;
  repair:
    EngineeringRepairRetestResult;
  continuity:
    EngineeringContinuityState;
  tasks:
    EngineeringWorkflowTask[];
}

export interface EngineeringRecoveryWorkflowResult {
  task:
    EngineeringWorkflowTask;
  unlockedTaskIds:
    ID[];
  workflowAdvanced:
    boolean;
  recoveryVerified:
    boolean;
  continuityAccepted:
    boolean;
}

export class EngineeringRecoveryWorkflowBridge {
  private readonly workflow:
    EngineeringWorkflowBridgeAuthority;

  constructor() {
    this.workflow =
      new EngineeringWorkflowBridgeAuthority();
  }

  advance(
    request:
      EngineeringRecoveryWorkflowRequest,
  ):
    EngineeringRecoveryWorkflowResult {
    if (
      !request.repair.verified
    ) {
      return {
        task: {
          ...request.task,
        },
        unlockedTaskIds: [],
        workflowAdvanced:
          false,
        recoveryVerified:
          false,
        continuityAccepted:
          false,
      };
    }

    if (
      request.repair.projectId !==
      request.completion.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Recovery Workflow: repair project does not match completion project",
      );
    }

    if (
      request.repair.projectId !==
      request.continuity.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Recovery Workflow: repair project does not match continuity project",
      );
    }

    if (
      request.repair.planId.trim().length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Recovery Workflow: verified repair must have a durable repair plan",
      );
    }

    if (
      !request.completion.completed
    ) {
      throw new Error(
        "K.I.N.G.S. Recovery Workflow: repaired work must pass the completion authority before workflow advancement",
      );
    }

    const advanced =
      this.workflow.advance(
        request.task,
        request.completion,
        request.tasks,
      );

    return {
      task:
        advanced.task,
      unlockedTaskIds:
        advanced.unlockedTaskIds,
      workflowAdvanced:
        advanced.completed,
      recoveryVerified:
        true,
      continuityAccepted:
        advanced.completed,
    };
  }
}
