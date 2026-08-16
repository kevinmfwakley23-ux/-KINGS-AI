import type {
  ID,
} from "./types";

import {
  ModelDrivenMissionExecutor,
  type ModelDrivenMissionRequest,
  type ModelDrivenMissionResult,
} from "./model-driven-mission-executor";


import {
  TargetAwareLocalCodingWorkflowExecutor,
} from "./target-aware-local-coding-workflow-executor";

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

  allowedToolIds:
    readonly ID[];

  allowedPaths:
    readonly string[];

  targetPath:
    string;

  acceptanceCriteria:
    readonly string[];

  requiredEvidenceTypes:
    readonly string[];

  approved:
    boolean;
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

  codingExecutor?:
    TargetAwareLocalCodingWorkflowExecutor;

  workspacePath?:
    string;
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
      const reasonedResult =
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

      if (
        !reasonedResult.success
      ) {
        results.push(
          reasonedResult,
        );

        blockedWorkUnitIds.push(
          workUnit.id,
        );

        evidence.push(
          `work-unit:${workUnit.id}:reasoning-blocked`,
        );

        break;
      }

      evidence.push(
        `work-unit:${workUnit.id}:reasoned`,
      );

      /*
       * Coding becomes an execution phase only for work units
       * that explicitly carry an approved target contract.
       */
      if (
        request.codingExecutor &&
        request.workspacePath &&
        workUnit.approved &&
        workUnit.targetPath
      ) {
        const codingResult =
          await request.codingExecutor.execute({
            id:
              `${request.id}:${workUnit.id}:coding`,

            missionId:
              request.missionId,

            workspacePath:
              request.workspacePath,

            workUnit,

            instruction:
              [
                request.objective,
                workUnit.context,
                workUnit.objective,
              ].join("\n\n"),

            maxFileBytes:
              128 * 1024,

            maxOutputTokens:
              1024,

            maxRepairAttempts:
              3,
          });

        if (
          !codingResult.success
        ) {
          /*
           * The mission result remains represented by the model
           * reasoning result, while the evidence makes the coding
           * boundary failure explicit.
           */
          results.push(
            reasonedResult,
          );

          blockedWorkUnitIds.push(
            workUnit.id,
          );

          evidence.push(
            `work-unit:${workUnit.id}:coding-blocked`,
          );

          evidence.push(
            ...codingResult.evidence,
          );

          break;
        }

        evidence.push(
          `work-unit:${workUnit.id}:coding-complete`,
        );

        evidence.push(
          ...codingResult.evidence,
        );
      }

      results.push(
        reasonedResult,
      );

      completedWorkUnitIds.push(
        workUnit.id,
      );
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
