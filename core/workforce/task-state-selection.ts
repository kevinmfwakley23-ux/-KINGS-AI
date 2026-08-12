import type {
  ID,
  Task,
} from "./types";

import type {
  MissionState,
  MissionContinuityStore,
} from "./mission-continuity";

export interface TaskStateSelectionLimits {
  maxDependencies: number;
  maxRelatedTasks: number;
}

export interface SelectedTaskState {
  id: ID;
  missionId: ID;
  status: Task["status"];
  dependencyIds: ID[];
  assignedAgentId?: ID;
  updatedAt: string;
}

export interface TaskStateSelection {
  missionId: ID;
  taskId: ID;
  missionState: MissionState;
  currentTask: SelectedTaskState;
  dependencies: SelectedTaskState[];
  relatedTasks: SelectedTaskState[];
}

export class TaskStateSelector {
  constructor(
    private readonly continuity:
      MissionContinuityStore,
    private readonly limits:
      TaskStateSelectionLimits = {
        maxDependencies: 20,
        maxRelatedTasks: 20,
      },
  ) {
    if (
      limits.maxDependencies < 1 ||
      limits.maxRelatedTasks < 1
    ) {
      throw new Error(
        "K.I.N.G.S. Task State Selector: limits must be at least 1",
      );
    }
  }

  select(
    task: Task,
    tasks: readonly Task[],
  ): TaskStateSelection {
    if (!task.id.trim()) {
      throw new Error(
        "K.I.N.G.S. Task State Selector: task id is required",
      );
    }

    if (!task.missionId.trim()) {
      throw new Error(
        `K.I.N.G.S. Task State Selector: task "${task.id}" requires a mission id`,
      );
    }

    const missionState =
      this.getMissionState(
        task.missionId,
      );

    const missionTasks =
      tasks.filter(
        (candidate) =>
          candidate.missionId ===
          task.missionId,
      );

    const currentTask =
      this.toSelectedTaskState(
        task,
      );

    const taskMap =
      new Map<ID, Task>(
        missionTasks.map(
          (candidate) => [
            candidate.id,
            candidate,
          ],
        ),
      );

    const dependencies =
      task.dependencyIds
        .map(
          (dependencyId) =>
            taskMap.get(
              dependencyId,
            ),
        )
        .filter(
          (
            candidate,
          ): candidate is Task =>
            candidate !== undefined,
        )
        .slice(
          0,
          this.limits.maxDependencies,
        )
        .map(
          (candidate) =>
            this.toSelectedTaskState(
              candidate,
            ),
        );

    const dependencyIds =
      new Set(
        task.dependencyIds,
      );

    const relatedTasks =
      missionTasks
        .filter(
          (candidate) =>
            candidate.id !==
              task.id &&
            !dependencyIds.has(
              candidate.id,
            ) &&
            (
              candidate.status ===
                "running" ||
              candidate.status ===
                "blocked" ||
              candidate.status ===
                "ready"
            ),
        )
        .sort(
          (left, right) => {
            const leftPriority =
              this.taskPriority(
                left,
              );

            const rightPriority =
              this.taskPriority(
                right,
              );

            if (
              leftPriority !==
              rightPriority
            ) {
              return (
                rightPriority -
                leftPriority
              );
            }

            return left.id.localeCompare(
              right.id,
            );
          },
        )
        .slice(
          0,
          this.limits.maxRelatedTasks,
        )
        .map(
          (candidate) =>
            this.toSelectedTaskState(
              candidate,
            ),
        );

    return {
      missionId:
        task.missionId,
      taskId:
        task.id,
      missionState:
        this.cloneMissionState(
          missionState,
        ),
      currentTask,
      dependencies,
      relatedTasks,
    };
  }

  private getMissionState(
    missionId: ID,
  ): MissionState {
    const snapshot =
      this.continuity.snapshot(
        missionId,
      );

    if (
      snapshot.state.missionId !==
      missionId
    ) {
      throw new Error(
        `K.I.N.G.S. Task State Selector: mission state "${missionId}" does not match requested mission`,
      );
    }

    return snapshot.state;
  }

  private toSelectedTaskState(
    task: Task,
  ): SelectedTaskState {
    return {
      id:
        task.id,
      missionId:
        task.missionId,
      status:
        task.status,
      dependencyIds: [
        ...task.dependencyIds,
      ],
      assignedAgentId:
        task.assignedAgentId,
      updatedAt:
        task.updatedAt,
    };
  }

  private cloneMissionState(
    state: MissionState,
  ): MissionState {
    return {
      ...state,
      activeTaskIds: [
        ...state.activeTaskIds,
      ],
      completedTaskIds: [
        ...state.completedTaskIds,
      ],
      blockedTaskIds: [
        ...state.blockedTaskIds,
      ],
      failedTaskIds: [
        ...state.failedTaskIds,
      ],
      openQuestionIds: [
        ...state.openQuestionIds,
      ],
      riskIds: [
        ...state.riskIds,
      ],
      artifactIds: [
        ...state.artifactIds,
      ],
      evidenceIds: [
        ...state.evidenceIds,
      ],
    };
  }

  private taskPriority(
    task: Task,
  ): number {
    switch (task.status) {
      case "running":
        return 100;
      case "blocked":
        return 80;
      case "ready":
        return 60;
      default:
        return 0;
    }
  }
}
