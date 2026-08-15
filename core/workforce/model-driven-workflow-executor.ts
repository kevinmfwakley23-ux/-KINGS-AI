import type {
  ID,
} from "./types";

import {
  ModelDrivenMissionExecutor,
  type ModelDrivenMissionRequest,
  type ModelDrivenMissionResult,
} from "./model-driven-mission-executor";

export interface ModelDrivenWorkUnit {
  id:
    ID;

  missionId:
    ID;

  objective:
    string;

  context:
    string;

  requiredCapabilities:
    ModelDrivenMissionRequest["requiredCapabilities"];
}

export interface ModelDrivenWorkflowRequest {
  id:
    ID;

  missionId:
    ID;

  objective:
    string;

  workUnits:
    readonly ModelDrivenWorkUnit[];

  executor:
    ModelDrivenMissionExecutor;

  model:
    ModelDrivenMissionRequest["model"];
}

export interface ModelDrivenWorkflowResult {
  success:
    boolean;

  completedWorkUnitIds:
    readonly ID[];

  blockedWorkUnitIds:
    readonly ID[];

  results:
    readonly ModelDrivenMissionResult[];

  evidence:
    readonly string[];
}

export class ModelDrivenWorkflowExecutor {
  async execute(
    request:
      ModelDrivenWorkflowRequest,
  ):
    Promise<
      ModelDrivenWorkflowResult
    > {
    const completedWorkUnitIds:
      ID[] = [];

    const blockedWorkUnitIds:
      ID[] = [];

    const results:
      ModelDrivenMissionResult[] = [];

    const evidence:
      string[] = [
        "workflow:started",
        `mission:${request.missionId}`,
      ];

    for (
      const workUnit of
      request.workUnits
    ) {
      const result =
        await request.executor.execute({
          id:
            `${request.id}:${workUnit.id}`,

          taskId:
            workUnit.id,

          missionId:
            request.missionId,

          objective:
            workUnit.objective,

          context:
            workUnit.context,

          requiredCapabilities:
            workUnit.requiredCapabilities,

          model:
            request.model,
        });

      results.push(
        result,
      );

      if (
        result.success
      ) {
        completedWorkUnitIds.push(
          workUnit.id,
        );

        evidence.push(
          `work-unit:${workUnit.id}:reasoned`,
        );
      } else {
        blockedWorkUnitIds.push(
          workUnit.id,
        );

        evidence.push(
          `work-unit:${workUnit.id}:blocked`,
        );

        break;
      }
    }

    const success =
      blockedWorkUnitIds.length ===
      0 &&
      completedWorkUnitIds.length ===
      request.workUnits.length;

    evidence.push(
      success
        ? "workflow:planning-stage-complete"
        : "workflow:blocked",
    );

    return {
      success,
      completedWorkUnitIds,
      blockedWorkUnitIds,
      results,
      evidence,
    };
  }
}
