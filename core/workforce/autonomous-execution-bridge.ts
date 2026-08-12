import type {
  ID,
} from "./types";

import type {
  AutonomousEngineeringHandoff,
} from "./autonomous-engineering-handoff";

import type {
  AutonomousEngineeringPlan,
} from "./autonomous-engineering-execution";

import type {
  EngineeringExecutionResult,
} from "./autonomous-engineering-execution";

export interface AutonomousExecutionBridgeResult {
  id:
    ID;
  projectId:
    ID;
  handoffId:
    ID;
  planId:
    ID;
  authorized:
    boolean;
  executionStarted:
    boolean;
  execution:
    EngineeringExecutionResult;
}

export class AutonomousExecutionBridge {
  start(
    handoff:
      AutonomousEngineeringHandoff,
    plan:
      AutonomousEngineeringPlan,
    execution:
      EngineeringExecutionResult,
  ):
    AutonomousExecutionBridgeResult {
    if (
      !handoff.authorized
    ) {
      throw new Error(
        `K.I.N.G.S. Autonomous Execution Bridge: handoff "${handoff.id}" is not authorized`,
      );
    }

    if (
      handoff.projectId !==
      plan.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Autonomous Execution Bridge: handoff and plan belong to different projects",
      );
    }

    if (
      execution.projectId !==
      plan.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Autonomous Execution Bridge: execution result belongs to a different project",
      );
    }

    if (
      execution.planId !==
      plan.id
    ) {
      throw new Error(
        "K.I.N.G.S. Autonomous Execution Bridge: execution result does not match the authorized engineering plan",
      );
    }

    if (
      !execution.started
    ) {
      throw new Error(
        "K.I.N.G.S. Autonomous Execution Bridge: engineering execution did not start",
      );
    }

    return {
      id:
        `autonomous-execution-${plan.projectId}`,
      projectId:
        plan.projectId,
      handoffId:
        handoff.id,
      planId:
        plan.id,
      authorized:
        true,
      executionStarted:
        true,
      execution,
    };
  }
}
