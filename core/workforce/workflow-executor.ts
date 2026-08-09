import type {
  ID,
  WorkforceResult,
  Workflow,
} from "./types";

import type {
  WorkforceRegistry,
} from "./registry";

import {
  WorkforceExecutor,
} from "./execution/executor";

import {
  WorkflowReadinessEvaluator,
} from "./workflow-readiness";

export interface WorkflowTaskEvaluation {
  taskId: ID;
  status:
    | "ready"
    | "blocked"
    | "invalid"
    | "completed"
    | "failed"
    | "cancelled";
  reasons: string[];
  result?: WorkforceResult;
}

export interface WorkflowExecutionResult {
  workflowId: ID;
  evaluations: WorkflowTaskEvaluation[];
}

export class WorkflowExecutor {
  private readonly readinessEvaluator:
    WorkflowReadinessEvaluator;

  private readonly workforceExecutor:
    WorkforceExecutor;

  constructor(
    private readonly registry: WorkforceRegistry,
    workforceExecutor: WorkforceExecutor,
  ) {
    this.readinessEvaluator =
      new WorkflowReadinessEvaluator(
        registry,
      );

    this.workforceExecutor =
      workforceExecutor;
  }

  async execute(
    workflowId: ID,
  ): Promise<WorkflowExecutionResult> {
    const workflow =
      this.registry.getWorkflow(
        workflowId,
      );

    if (!workflow) {
      throw new Error(
        `K.I.N.G.S. Workflow Executor: workflow "${workflowId}" not found`,
      );
    }

    const evaluations:
      WorkflowTaskEvaluation[] = [];

    const evaluatedTaskIds =
      new Set<ID>();

    let progressed = true;

    while (progressed) {
      progressed = false;

      for (
        const taskId of workflow.taskIds
      ) {
        const task =
          this.registry.getTask(
            taskId,
          );

        if (!task) {
          if (
            !evaluatedTaskIds.has(
              taskId,
            )
          ) {
            evaluations.push({
              taskId,
              status: "invalid",
              reasons: [
                `Task "${taskId}" does not exist.`,
              ],
            });

            evaluatedTaskIds.add(
              taskId,
            );
          }

          continue;
        }

        if (
          task.status ===
          "completed"
        ) {
          if (
            !evaluatedTaskIds.has(
              taskId,
            )
          ) {
            evaluations.push({
              taskId,
              status: "completed",
              reasons: [],
            });

            evaluatedTaskIds.add(
              taskId,
            );
          }

          continue;
        }

        if (
          task.status ===
          "failed"
        ) {
          if (
            !evaluatedTaskIds.has(
              taskId,
            )
          ) {
            evaluations.push({
              taskId,
              status: "failed",
              reasons: [
                "Task has already failed.",
              ],
            });

            evaluatedTaskIds.add(
              taskId,
            );
          }

          continue;
        }

        if (
          task.status ===
          "cancelled"
        ) {
          if (
            !evaluatedTaskIds.has(
              taskId,
            )
          ) {
            evaluations.push({
              taskId,
              status: "cancelled",
              reasons: [
                "Task has been cancelled.",
              ],
            });

            evaluatedTaskIds.add(
              taskId,
            );
          }

          continue;
        }

        const readiness =
          this.readinessEvaluator.evaluate(
            task,
          );

        if (
          readiness.status !==
          "ready"
        ) {
          if (
            !evaluatedTaskIds.has(
              taskId,
            )
          ) {
            evaluations.push({
              taskId,
              status:
                readiness.status,
              reasons:
                readiness.reasons,
            });

            evaluatedTaskIds.add(
              taskId,
            );
          }

          continue;
        }

        const result =
          await this.workforceExecutor.execute(
            taskId,
          );

        task.status =
          result.status ===
          "success"
            ? "completed"
            : "failed";

        task.updatedAt =
          new Date().toISOString();

        evaluations.push({
          taskId,
          status:
            result.status ===
            "success"
              ? "completed"
              : "failed",
          reasons:
            result.status ===
            "success"
              ? []
              : [
                  `Workforce execution returned "${result.status}".`,
                ],
          result,
        });

        evaluatedTaskIds.add(
          taskId,
        );

        progressed = true;
      }
    }

    return {
      workflowId,
      evaluations,
    };
  }
}
