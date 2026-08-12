import type {
  ID,
} from "./types";

import type {
  EngineeringReadinessResult,
} from "./engineering-readiness-bridge";

import type {
  AutonomousEngineeringPlan,
} from "./autonomous-engineering-execution";

export interface AutonomousEngineeringHandoff {
  id:
    ID;
  projectId:
    ID;
  readinessId:
    ID;
  planId:
    ID;
  authorized:
    boolean;
  handedOffAt:
    string;
}

export class AutonomousEngineeringHandoffAuthority {
  authorize(
    readiness:
      EngineeringReadinessResult,
    plan:
      AutonomousEngineeringPlan,
    handedOffAt:
      string,
  ):
    AutonomousEngineeringHandoff {
    if (
      readiness.readiness.projectId !==
      plan.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Autonomous Engineering Handoff: readiness and engineering plan belong to different projects",
      );
    }

    if (
      !readiness.readiness.ready
    ) {
      throw new Error(
        "K.I.N.G.S. Autonomous Engineering Handoff: project is not engineering-ready",
      );
    }

    if (
      !plan.steps.length
    ) {
      throw new Error(
        "K.I.N.G.S. Autonomous Engineering Handoff: engineering plan contains no executable steps",
      );
    }

    return {
      id:
        `engineering-handoff-${plan.projectId}`,
      projectId:
        plan.projectId,
      readinessId:
        readiness.readiness.id,
      planId:
        plan.id,
      authorized:
        true,
      handedOffAt,
    };
  }
}
