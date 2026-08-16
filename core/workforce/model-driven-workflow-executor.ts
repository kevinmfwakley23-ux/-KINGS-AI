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


import {
  WorkUnitExecutionStateStore,
} from "./work-unit-execution-state";


import {
  WorkUnitContinuityBridge,
} from "./work-unit-continuity-bridge";

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

  executionState?:
    WorkUnitExecutionStateStore;

  continuityBridge?:
    WorkUnitContinuityBridge;

  continuityContext?:
    {
      ownerId:
        ID;

      runtimeSessionId:
        ID;

      runtimeDefinitionId:
        ID;
    };
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

    const executionState =
      request.executionState ??
      new WorkUnitExecutionStateStore();

    if (
      request.continuityBridge &&
      !request.continuityContext
    ) {
      throw new Error(
        "K.I.N.G.S. Model-Driven Workflow: continuityBridge requires continuityContext",
      );
    }

    for (
      const workUnit of
      request.workUnits
    ) {
      const state =
        executionState.start(
          workUnit.id,
          request.missionId,
          workUnit.targetPath,
        );

      const continuityExecution =
        request.continuityBridge &&
        request.continuityContext
          ? request.continuityBridge.start(
              {
                missionId:
                  request.missionId,

                workflowId:
                  request.id,

                ownerId:
                  request.continuityContext
                    .ownerId,

                runtimeSessionId:
                  request.continuityContext
                    .runtimeSessionId,

                runtimeDefinitionId:
                  request.continuityContext
                    .runtimeDefinitionId,

                executionId:
                  `${request.id}:${workUnit.id}:execution`,

                state,
              },
              new Date().toISOString(),
            )
          : undefined;

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

        executionState.block(
          state,
          [
            reasonedResult.failureReason ??
              "Model-driven reasoning failed.",
          ],
          reasonedResult.evidence,
        );

        if (
          continuityExecution &&
          request.continuityBridge
        ) {
          request.continuityBridge.fail(
            continuityExecution.id,
            new Date().toISOString(),
          );
        }

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

      if (
        continuityExecution &&
        request.continuityBridge
      ) {
        request.continuityBridge.checkpoint(
          continuityExecution.id,
          new Date().toISOString(),
        );
      }

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

          executionState.block(
            state,
            codingResult.verification.reasons,
            codingResult.evidence,
          );

          if (
            continuityExecution &&
            request.continuityBridge
          ) {
            request.continuityBridge.fail(
              continuityExecution.id,
              new Date().toISOString(),
            );
          }

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

        executionState.markVerified(
          state,
          [
            ...reasonedResult.evidence,
            ...codingResult.evidence,
          ],
        );

        if (
          continuityExecution &&
          request.continuityBridge &&
          request.continuityContext
        ) {
          request.continuityBridge.complete(
            {
              missionId:
                request.missionId,

              workflowId:
                request.id,

              ownerId:
                request.continuityContext
                  .ownerId,

              runtimeSessionId:
                request.continuityContext
                  .runtimeSessionId,

              runtimeDefinitionId:
                request.continuityContext
                  .runtimeDefinitionId,

              executionId:
                continuityExecution.id,

              state:
                executionState.get(
                  workUnit.id,
                ) ?? state,
            },

            continuityExecution,

            new Date().toISOString(),
          );
        }

        evidence.push(
          `work-unit:${workUnit.id}:coding-complete`,
        );

        evidence.push(
          ...codingResult.evidence,
        );
      } else {
        executionState.markVerified(
          state,
          reasonedResult.evidence,
        );

        if (
          continuityExecution &&
          request.continuityBridge
        ) {
          request.continuityBridge.complete(
            {
              missionId:
                request.missionId,

              workflowId:
                request.id,

              ownerId:
                request.continuityContext!.ownerId,

              runtimeSessionId:
                request.continuityContext!
                  .runtimeSessionId,

              runtimeDefinitionId:
                request.continuityContext!
                  .runtimeDefinitionId,

              executionId:
                continuityExecution.id,

              state:
                executionState.get(
                  workUnit.id,
                ) ?? state,
            },

            continuityExecution,

            new Date().toISOString(),
          );
        }
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
