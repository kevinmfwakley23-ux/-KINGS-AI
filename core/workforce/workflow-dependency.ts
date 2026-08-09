import type {
  ID,
  Task,
} from "./types";

import type {
  WorkforceRegistry,
} from "./registry";

export interface DependencyEvaluation {
  taskId: ID;
  satisfied: boolean;
  missingDependencyIds: ID[];
}

export class WorkflowDependencyEvaluator {
  constructor(
    private readonly registry: WorkforceRegistry,
  ) {}

  evaluate(
    task: Task,
  ): DependencyEvaluation {
    const missingDependencyIds: ID[] = [];

    for (
      const dependencyId of task.dependencyIds
    ) {
      const dependency =
        this.registry.getTask(
          dependencyId,
        );

      if (!dependency) {
        missingDependencyIds.push(
          dependencyId,
        );
        continue;
      }

      if (
        dependency.status !==
        "completed"
      ) {
        missingDependencyIds.push(
          dependencyId,
        );
      }
    }

    return {
      taskId: task.id,
      satisfied:
        missingDependencyIds.length === 0,
      missingDependencyIds,
    };
  }
}
