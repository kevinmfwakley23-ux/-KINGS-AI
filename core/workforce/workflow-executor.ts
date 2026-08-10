import type {
  ID,
  WorkforceResult,
} from "./types";

import type {
  WorkforceRegistry,
} from "./registry";

import {
  TaskControl,
} from "./task-control";

import {
  TaskLeaseManager,
} from "./task-lease";

import {
  WorkforceExecutor,
} from "./execution/executor";

import {
  TaskExecutionController,
} from "./execution/task-execution";

import {
  LeasedTaskExecutionController,
} from "./execution/leased-task-execution";

import {
  WorkflowDependencyEvaluator,
} from "./workflow-dependency";

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

  private readonly dependencyEvaluator:
    WorkflowDependencyEvaluator;

  private readonly taskControl:
    TaskControl;

  private readonly taskLeaseManager:
    TaskLeaseManager;

  private readonly taskExecutionController:
    TaskExecutionController;

  private readonly leasedTaskExecutionController:
    LeasedTaskExecutionController;

  constructor(
    private readonly registry: WorkforceRegistry,
    workforceExecutor: WorkforceExecutor,
  ) {
    this.readinessEvaluator =
      new WorkflowReadinessEvaluator(
        registry,
      );

    this.dependencyEvaluator =
      new WorkflowDependencyEvaluator(
        registry,
      );

    this.taskControl =
      new TaskControl(
        registry,
      );

    this.taskLeaseManager =
      new TaskLeaseManager(
        registry,
      );

    this.taskExecutionController =
      new TaskExecutionController(
        registry,
        this.taskControl,
        workforceExecutor,
      );

    this.leasedTaskExecutionController =
      new LeasedTaskExecutionController(
        this.taskLeaseManager,
        this.taskExecutionController,
      );
  }

  async execute(
    workflowId: ID,
    ownerId: ID,
    leaseDurationMs: number,
  ): Promise<WorkflowExecutionResult> {
    if (!ownerId.trim()) {
      throw new Error(
        "K.I.N.G.S. Workflow Executor: ownerId is required",
      );
    }

    if (
      !Number.isFinite(leaseDurationMs) ||
      leaseDurationMs <= 0
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Executor: leaseDurationMs must be greater than zero",
      );
    }

    const workflow =
      this.registry.getWorkflow(
        workflowId,
      );

    if (!workflow) {
      throw new Error(
        `K.I.N.G.S. Workflow Executor: workflow "${workflowId}" not found`,
      );
    }

    const evaluationMap =
      new Map<
        ID,
        WorkflowTaskEvaluation
      >();

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
          evaluationMap.set(
            taskId,
            {
              taskId,
              status: "invalid",
              reasons: [
                `Task "${taskId}" does not exist.`,
              ],
            },
          );

          continue;
        }

        if (
          task.status ===
          "completed"
        ) {
          evaluationMap.set(
            taskId,
            {
              taskId,
              status: "completed",
              reasons: [],
            },
          );

          continue;
        }

        if (
          task.status ===
          "failed"
        ) {
          evaluationMap.set(
            taskId,
            {
              taskId,
              status: "failed",
              reasons: [
                "Task has already failed.",
              ],
            },
          );

          continue;
        }

        if (
          task.status ===
          "cancelled"
        ) {
          evaluationMap.set(
            taskId,
            {
              taskId,
              status: "cancelled",
              reasons: [
                "Task has been cancelled.",
              ],
            },
          );

          continue;
        }

        /*
         * Dependency progression happens before readiness
         * evaluation.
         *
         * A pending or blocked task is allowed to become
         * ready only when every dependency is completed.
         *
         * TaskControl remains the sole authority for the
         * state transition.
         */
        const dependencies =
          this.dependencyEvaluator.evaluate(
            task,
          );

        if (
          !dependencies.satisfied
        ) {
          evaluationMap.set(
            taskId,
            {
              taskId,
              status: "blocked",
              reasons:
                dependencies.missingDependencyIds.map(
                  (dependencyId) =>
                    `Dependency "${dependencyId}" is not completed.`,
                ),
            },
          );

          continue;
        }

        if (
          task.status ===
            "pending" ||
          task.status ===
            "blocked"
        ) {
          this.taskControl.transition(
            taskId,
            "ready",
          );

          progressed = true;
        }

        const readiness =
          this.readinessEvaluator.evaluate(
            task,
          );

        if (
          readiness.status !==
          "ready"
        ) {
          evaluationMap.set(
            taskId,
            {
              taskId,
              status:
                readiness.status,
              reasons:
                readiness.reasons,
            },
          );

          continue;
        }

        const result =
          await this.leasedTaskExecutionController.execute(
            taskId,
            ownerId,
            leaseDurationMs,
          );

        evaluationMap.set(
          taskId,
          {
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
          },
        );

        progressed = true;
      }
    }

    return {
      workflowId,
      evaluations:
        Array.from(
          evaluationMap.values(),
        ),
    };
  }
}
