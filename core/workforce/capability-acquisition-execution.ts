import type {
  ID,
} from "./types";

import type {
  CapabilityAcquisitionAction,
  CapabilityAcquisitionPlan,
} from "./capability-acquisition";

export type CapabilityAcquisitionExecutionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed";

export interface CapabilityAcquisitionExecution {
  id:
    ID;
  actionId:
    ID;
  projectId:
    ID;
  status:
    CapabilityAcquisitionExecutionStatus;
  startedAt:
    string;
  completedAt?:
    string;
  evidence?:
    string;
  error?:
    string;
}

export class CapabilityAcquisitionExecutionAuthority {
  start(
    plan:
      CapabilityAcquisitionPlan,
    actionId:
      ID,
    startedAt:
      string,
  ):
    CapabilityAcquisitionExecution {
    const action =
      this.requireAction(
        plan,
        actionId,
      );

    if (!action.approved) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition Execution: action "${actionId}" is not approved`,
      );
    }

    if (action.completed) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition Execution: action "${actionId}" is already completed`,
      );
    }

    return {
      id:
        `acquisition-execution-${actionId}`,
      actionId,
      projectId:
        action.projectId,
      status:
        "running",
      startedAt,
    };
  }

  succeed(
    execution:
      CapabilityAcquisitionExecution,
    evidence:
      string,
    completedAt:
      string,
  ):
    CapabilityAcquisitionExecution {
    if (
      execution.status !==
      "running"
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition Execution: execution "${execution.id}" cannot succeed from "${execution.status}"`,
      );
    }

    if (!evidence.trim()) {
      throw new Error(
        "K.I.N.G.S. Capability Acquisition Execution: successful acquisition requires evidence",
      );
    }

    return {
      ...execution,
      status:
        "succeeded",
      completedAt,
      evidence,
    };
  }

  fail(
    execution:
      CapabilityAcquisitionExecution,
    error:
      string,
    completedAt:
      string,
  ):
    CapabilityAcquisitionExecution {
    if (
      execution.status !==
      "running"
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition Execution: execution "${execution.id}" cannot fail from "${execution.status}"`,
      );
    }

    return {
      ...execution,
      status:
        "failed",
      completedAt,
      error,
    };
  }

  completeAction(
    plan:
      CapabilityAcquisitionPlan,
    execution:
      CapabilityAcquisitionExecution,
  ):
    CapabilityAcquisitionPlan {
    if (
      execution.status !==
      "succeeded"
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition Execution: execution "${execution.id}" has not succeeded`,
      );
    }

    if (
      !execution.evidence?.trim()
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition Execution: execution "${execution.id}" has no acquisition evidence`,
      );
    }

    const action =
      this.requireAction(
        plan,
        execution.actionId,
      );

    return {
      ...plan,
      actions:
        plan.actions.map(
          (candidate) =>
            candidate.id ===
              action.id
              ? {
                  ...candidate,
                  completed:
                    true,
                }
              : candidate,
        ),
      ready:
        plan.actions.every(
          (candidate) =>
            candidate.id ===
              action.id
              ? true
              : candidate.completed,
        ),
    };
  }

  private requireAction(
    plan:
      CapabilityAcquisitionPlan,
    actionId:
      ID,
  ):
    CapabilityAcquisitionAction {
    const action =
      plan.actions.find(
        (candidate) =>
          candidate.id ===
          actionId,
      );

    if (!action) {
      throw new Error(
        `K.I.N.G.S. Capability Acquisition Execution: action "${actionId}" was not found`,
      );
    }

    return action;
  }
}
