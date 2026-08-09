import type {
  ID,
  Task,
} from "./types";

import type {
  WorkforceRegistry,
} from "./registry";

import {
  WorkflowDependencyEvaluator,
} from "./workflow-dependency";

export type TaskReadiness =
  | "ready"
  | "blocked"
  | "invalid";

export interface TaskReadinessEvaluation {
  taskId: ID;
  status: TaskReadiness;
  reasons: string[];
}

export class WorkflowReadinessEvaluator {
  private readonly dependencyEvaluator:
    WorkflowDependencyEvaluator;

  constructor(
    private readonly registry: WorkforceRegistry,
  ) {
    this.dependencyEvaluator =
      new WorkflowDependencyEvaluator(
        registry,
      );
  }

  evaluate(
    task: Task,
  ): TaskReadinessEvaluation {
    const reasons: string[] = [];

    if (
      task.status !== "ready"
    ) {
      return {
        taskId: task.id,
        status: "blocked",
        reasons: [
          `Task status is "${task.status}".`,
        ],
      };
    }

    if (
      !task.assignedAgentId
    ) {
      return {
        taskId: task.id,
        status: "invalid",
        reasons: [
          "Task has no assigned agent.",
        ],
      };
    }

    const agent =
      this.registry.getAgent(
        task.assignedAgentId,
      );

    if (!agent) {
      return {
        taskId: task.id,
        status: "invalid",
        reasons: [
          `Assigned agent "${task.assignedAgentId}" does not exist.`,
        ],
      };
    }

    const missingCapabilities =
      task.requiredCapabilities.filter(
        (capability) =>
          !agent.capabilities.includes(
            capability,
          ),
      );

    if (
      missingCapabilities.length > 0
    ) {
      return {
        taskId: task.id,
        status: "invalid",
        reasons: [
          `Agent "${agent.id}" lacks required capabilities: ${missingCapabilities.join(", ")}.`,
        ],
      };
    }

    const unauthorizedTools: string[] =
      [];

    for (
      const toolId of task.requiredToolIds
    ) {
      const tool =
        this.registry.getTool(
          toolId,
        );

      if (!tool) {
        unauthorizedTools.push(
          `${toolId} (not registered)`,
        );
        continue;
      }

      if (
        !agent.toolIds.includes(
          toolId,
        )
      ) {
        unauthorizedTools.push(
          `${toolId} (agent not authorized)`,
        );
        continue;
      }

      if (!tool.enabled) {
        unauthorizedTools.push(
          `${toolId} (tool disabled)`,
        );
      }
    }

    if (
      unauthorizedTools.length > 0
    ) {
      return {
        taskId: task.id,
        status: "invalid",
        reasons: [
          `Agent "${agent.id}" cannot access required tools: ${unauthorizedTools.join(", ")}.`,
        ],
      };
    }

    const dependencies =
      this.dependencyEvaluator.evaluate(
        task,
      );

    if (
      !dependencies.satisfied
    ) {
      return {
        taskId: task.id,
        status: "blocked",
        reasons:
          dependencies.missingDependencyIds.map(
            (dependencyId) =>
              `Dependency "${dependencyId}" is not completed.`,
          ),
      };
    }

    return {
      taskId: task.id,
      status: "ready",
      reasons: [],
    };
  }
}
