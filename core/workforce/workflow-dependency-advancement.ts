import type {
  ID,
} from "./types";

export type WorkflowTaskState =
  | "completed"
  | "ready"
  | "blocked"
  | "pending";

export interface WorkflowTaskNode {
  id:
    ID;

  dependencyIds:
    ID[];

  state:
    WorkflowTaskState;
}

export interface WorkflowDependencyState {
  workflowId:
    ID;

  ownerId:
    ID;

  currentTaskId:
    ID;

  tasks:
    WorkflowTaskNode[];

  updatedAt:
    string;
}

export interface WorkflowDependencyAdvanceResult {
  workflow:
    WorkflowDependencyState;

  newlyReadyTaskIds:
    ID[];

  blockedTaskIds:
    ID[];

  pendingTaskIds:
    ID[];

  completedTaskIds:
    ID[];
}

export class WorkflowDependencyAdvancementAuthority {
  private readonly workflows =
    new Map<
      ID,
      WorkflowDependencyState
    >();

  register(
    workflow:
      WorkflowDependencyState,
  ):
    WorkflowDependencyState {
    if (
      this.workflows.has(
        workflow.workflowId,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Workflow Dependency Advancement: workflow "${workflow.workflowId}" already exists`,
      );
    }

    this.validate(
      workflow,
    );

    this.workflows.set(
      workflow.workflowId,
      this.clone(
        workflow,
      ),
    );

    return this.clone(
      workflow,
    );
  }

  advance(
    workflowId:
      ID,
    ownerId:
      ID,
    completedTaskId:
      ID,
    updatedAt:
      string,
  ):
    WorkflowDependencyAdvanceResult {
    const workflow =
      this.require(
        workflowId,
      );

    if (
      workflow.ownerId !==
      ownerId
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Dependency Advancement: owner identity does not match workflow owner",
      );
    }

    const completedTask =
      workflow.tasks.find(
        (task) =>
          task.id ===
          completedTaskId,
      );

    if (!completedTask) {
      throw new Error(
        `K.I.N.G.S. Workflow Dependency Advancement: completed task "${completedTaskId}" was not found`,
      );
    }

    if (
      completedTask.state ===
      "completed"
    ) {
      throw new Error(
        `K.I.N.G.S. Workflow Dependency Advancement: task "${completedTaskId}" is already completed`,
      );
    }

    completedTask.state =
      "completed";

    const newlyReadyTaskIds:
      ID[] = [];

    for (
      const task of workflow.tasks
    ) {
      if (
        task.state !==
        "pending"
      ) {
        continue;
      }

      const dependencies =
        task.dependencyIds.map(
          (dependencyId) =>
            workflow.tasks.find(
              (candidate) =>
                candidate.id ===
                dependencyId,
            ),
        );

      if (
        dependencies.some(
          (dependency) =>
            !dependency,
        )
      ) {
        task.state =
          "blocked";
        continue;
      }

      const allDependenciesComplete =
        dependencies.every(
          (dependency) =>
            dependency?.state ===
            "completed",
        );

      if (
        allDependenciesComplete
      ) {
        task.state =
          "ready";

        newlyReadyTaskIds.push(
          task.id,
        );
      }
    }

    workflow.currentTaskId =
      newlyReadyTaskIds[0] ??
      this.findCurrentTask(
        workflow,
      );

    workflow.updatedAt =
      updatedAt;

    this.validate(
      workflow,
    );

    this.workflows.set(
      workflow.workflowId,
      workflow,
    );

    return {
      workflow:
        this.clone(
          workflow,
        ),
      newlyReadyTaskIds: [
        ...newlyReadyTaskIds,
      ],
      blockedTaskIds:
        workflow.tasks
          .filter(
            (task) =>
              task.state ===
              "blocked",
          )
          .map(
            (task) =>
              task.id,
          ),
      pendingTaskIds:
        workflow.tasks
          .filter(
            (task) =>
              task.state ===
              "pending",
          )
          .map(
            (task) =>
              task.id,
          ),
      completedTaskIds:
        workflow.tasks
          .filter(
            (task) =>
              task.state ===
              "completed",
          )
          .map(
            (task) =>
              task.id,
          ),
    };
  }

  get(
    workflowId:
      ID,
  ):
    WorkflowDependencyState |
    undefined {
    const workflow =
      this.workflows.get(
        workflowId,
      );

    return workflow
      ? this.clone(
          workflow,
        )
      : undefined;
  }

  private findCurrentTask(
    workflow:
      WorkflowDependencyState,
  ):
    ID {
    const ready =
      workflow.tasks.find(
        (task) =>
          task.state ===
          "ready",
      );

    if (ready) {
      return ready.id;
    }

    const pending =
      workflow.tasks.find(
        (task) =>
          task.state ===
          "pending",
      );

    if (pending) {
      return pending.id;
    }

    return workflow.currentTaskId;
  }

  private require(
    workflowId:
      ID,
  ):
    WorkflowDependencyState {
    const workflow =
      this.workflows.get(
        workflowId,
      );

    if (!workflow) {
      throw new Error(
        `K.I.N.G.S. Workflow Dependency Advancement: workflow "${workflowId}" was not found`,
      );
    }

    return workflow;
  }

  private validate(
    workflow:
      WorkflowDependencyState,
  ):
    void {
    if (
      !workflow.workflowId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Dependency Advancement: workflow id is required",
      );
    }

    if (
      !workflow.ownerId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Dependency Advancement: owner id is required",
      );
    }

    const taskIds =
      new Set<ID>();

    for (
      const task of workflow.tasks
    ) {
      if (
        taskIds.has(
          task.id,
        )
      ) {
        throw new Error(
          `K.I.N.G.S. Workflow Dependency Advancement: duplicate task "${task.id}"`,
        );
      }

      taskIds.add(
        task.id,
      );
    }

    for (
      const task of workflow.tasks
    ) {
      for (
        const dependencyId of
          task.dependencyIds
      ) {
        if (
          dependencyId ===
          task.id
        ) {
          throw new Error(
            `K.I.N.G.S. Workflow Dependency Advancement: task "${task.id}" cannot depend on itself`,
          );
        }

        if (
          !taskIds.has(
            dependencyId,
          )
        ) {
          throw new Error(
            `K.I.N.G.S. Workflow Dependency Advancement: dependency "${dependencyId}" for task "${task.id}" was not found`,
          );
        }
      }
    }
  }

  private clone(
    workflow:
      WorkflowDependencyState,
  ):
    WorkflowDependencyState {
    return {
      ...workflow,
      tasks:
        workflow.tasks.map(
          (task) => ({
            ...task,
            dependencyIds: [
              ...task.dependencyIds,
            ],
          }),
        ),
    };
  }
}
