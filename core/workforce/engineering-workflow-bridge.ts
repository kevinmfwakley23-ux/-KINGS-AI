import type {
  ID,
} from "./types";

import type {
  EngineeringCompletionResult,
} from "./engineering-completion-authority";

export interface EngineeringWorkflowTask {
  id:
    ID;
  projectId:
    ID;
  dependencyIds:
    ID[];
  status:
    "blocked"
    | "ready"
    | "active"
    | "completed";
}

export interface EngineeringWorkflowBridgeResult {
  task:
    EngineeringWorkflowTask;
  unlockedTaskIds:
    ID[];
  completed:
    boolean;
}

export class EngineeringWorkflowBridgeAuthority {
  advance(
    completedTask:
      EngineeringWorkflowTask,
    completion:
      EngineeringCompletionResult,
    tasks:
      EngineeringWorkflowTask[],
  ):
    EngineeringWorkflowBridgeResult {
    if (
      !completion.completed
    ) {
      return {
        task: {
          ...completedTask,
          dependencyIds: [
            ...completedTask.dependencyIds,
          ],
        },
        unlockedTaskIds: [],
        completed:
          false,
      };
    }

    const updatedTasks =
      tasks.map(
        (task) => {
          if (
            task.id ===
            completedTask.id
          ) {
            return {
              ...task,
              status:
                "completed" as const,
            };
          }

          if (
            task.status !==
              "blocked" ||
            !task.dependencyIds.includes(
              completedTask.id,
            )
          ) {
            return task;
          }

          const dependenciesSatisfied =
            task.dependencyIds.every(
              (dependencyId) => {
                if (
                  dependencyId ===
                  completedTask.id
                ) {
                  return true;
                }

                const dependency =
                  tasks.find(
                    (candidate) =>
                      candidate.id ===
                      dependencyId,
                  );

                return (
                  dependency?.status ===
                  "completed"
                );
              },
            );

          if (
            dependenciesSatisfied
          ) {
            return {
              ...task,
              status:
                "ready" as const,
            };
          }

          return task;
        },
      );

    const unlockedTaskIds =
      updatedTasks
        .filter(
          (task) =>
            task.status ===
              "ready" &&
            task.dependencyIds.includes(
              completedTask.id,
            ),
        )
        .map(
          (task) =>
            task.id,
        );

    return {
      task: {
        ...completedTask,
        status:
          "completed",
      },
      unlockedTaskIds,
      completed:
        true,
    };
  }
}
