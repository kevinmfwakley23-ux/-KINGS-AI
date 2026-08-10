import type {
  ID,
  Task,
} from "./types";

import type {
  MissionPlan,
  MissionMilestone,
} from "./mission-continuity";

import type {
  TaskContractValidation,
} from "./task-control";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

export interface WorkflowTaskValidationPort {
  validate(
    task: Task,
  ): TaskContractValidation;
}

export interface WorkflowTaskProposal {
  id: ID;
  task: Task;
  workUnit: WorkUnitContract;
}

export interface WorkflowPlanningRequest {
  missionPlan: MissionPlan;
  milestoneId: ID;
  tasks: Task[];
  workUnitDefaults: {
    role: string;
    capabilityIds: ID[];
    allowedToolIds: ID[];
    allowedPaths: string[];
    maxTimeMs: number;
    maxTokens: number;
    maxIterations: number;
    requiredEvidenceTypes: string[];
    approved: boolean;
  };
}

export interface WorkflowPlanningResult {
  missionId: ID;
  planId: ID;
  planVersion: number;
  milestoneId: ID;
  milestoneObjective: string;
  orderedTaskIds: ID[];
  proposals: WorkflowTaskProposal[];
  acceptanceCriteria: string[];
  createdAt: string;
}

export class WorkflowPlanningAuthority {
  constructor(
    private readonly taskControl: WorkflowTaskValidationPort,
  ) {}

  plan(
    request: WorkflowPlanningRequest,
  ): WorkflowPlanningResult {
    this.validateRequest(
      request,
    );

    const milestone =
      this.findMilestone(
        request.missionPlan,
        request.milestoneId,
      );

    const milestoneTaskIds =
      new Set(
        milestone.taskIds,
      );

    const tasksById =
      new Map<ID, Task>();

    for (
      const task of request.tasks
    ) {
      if (
        tasksById.has(task.id)
      ) {
        throw new Error(
          `K.I.N.G.S. Workflow Planning: duplicate task "${task.id}"`,
        );
      }

      tasksById.set(
        task.id,
        task,
      );
    }

    for (
      const taskId of milestone.taskIds
    ) {
      const task =
        tasksById.get(
          taskId,
        );

      if (!task) {
        throw new Error(
          `K.I.N.G.S. Workflow Planning: milestone "${milestone.id}" references missing task "${taskId}"`,
        );
      }

      if (
        task.missionId !==
        request.missionPlan.missionId
      ) {
        throw new Error(
          `K.I.N.G.S. Workflow Planning: task "${task.id}" belongs to mission "${task.missionId}", not "${request.missionPlan.missionId}"`,
        );
      }

      const validation =
        this.taskControl.validate(
          task,
        );

      if (!validation.valid) {
        throw new Error(
          `K.I.N.G.S. Workflow Planning: task "${task.id}" failed TaskControl validation: ${validation.reasons.join(
            " ",
          )}`,
        );
      }

      for (
        const dependencyId of
        task.dependencyIds
      ) {
        if (
          !tasksById.has(
            dependencyId,
          )
        ) {
          throw new Error(
            `K.I.N.G.S. Workflow Planning: task "${task.id}" depends on missing task "${dependencyId}"`,
          );
        }

        if (
          dependencyId ===
          task.id
        ) {
          throw new Error(
            `K.I.N.G.S. Workflow Planning: task "${task.id}" cannot depend on itself`,
          );
        }
      }
    }

    const orderedTaskIds =
      this.orderTasks(
        milestoneTaskIds,
        tasksById,
      );

    const proposals =
      orderedTaskIds.map(
        (taskId) => {
          const task =
            tasksById.get(
              taskId,
            )!;

          return {
            id:
              `WORKFLOW-PROPOSAL-${request.missionPlan.id}-${task.id}`,
            task:
              this.cloneTask(
                task,
              ),
            workUnit:
              this.createWorkUnit(
                request,
                milestone,
                task,
              ),
          };
        },
      );

    return {
      missionId:
        request.missionPlan.missionId,
      planId:
        request.missionPlan.id,
      planVersion:
        request.missionPlan.version,
      milestoneId:
        milestone.id,
      milestoneObjective:
        milestone.objective,
      orderedTaskIds,
      proposals,
      acceptanceCriteria: [
        ...request.missionPlan.acceptanceCriteria,
      ],
      createdAt:
        new Date().toISOString(),
    };
  }

  private validateRequest(
    request: WorkflowPlanningRequest,
  ): void {
    if (
      !request.missionPlan.id.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Planning: mission plan id is required",
      );
    }

    if (
      !request.missionPlan.missionId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Planning: mission id is required",
      );
    }

    if (
      request.missionPlan.version <= 0
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Planning: mission plan version must be positive",
      );
    }

    if (
      !request.milestoneId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Planning: milestone id is required",
      );
    }

    if (
      request.tasks.length === 0
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Planning: at least one task is required",
      );
    }

    if (
      !request.workUnitDefaults.role.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Planning: work unit role is required",
      );
    }

    if (
      request.workUnitDefaults.capabilityIds.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Planning: at least one work unit capability is required",
      );
    }

    if (
      request.workUnitDefaults.maxTimeMs <= 0 ||
      request.workUnitDefaults.maxTokens <= 0 ||
      request.workUnitDefaults.maxIterations <= 0
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Planning: work unit budgets must be positive",
      );
    }

    if (
      request.workUnitDefaults.requiredEvidenceTypes.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Workflow Planning: work unit evidence requirements are required",
      );
    }
  }

  private findMilestone(
    plan: MissionPlan,
    milestoneId: ID,
  ): MissionMilestone {
    const milestone =
      plan.milestones.find(
        (item) =>
          item.id ===
          milestoneId,
      );

    if (!milestone) {
      throw new Error(
        `K.I.N.G.S. Workflow Planning: milestone "${milestoneId}" not found in plan "${plan.id}"`,
      );
    }

    if (
      milestone.missionId !==
      plan.missionId
    ) {
      throw new Error(
        `K.I.N.G.S. Workflow Planning: milestone "${milestone.id}" belongs to a different mission`,
      );
    }

    if (
      milestone.taskIds.length ===
      0
    ) {
      throw new Error(
        `K.I.N.G.S. Workflow Planning: milestone "${milestone.id}" contains no tasks`,
      );
    }

    return milestone;
  }

  private orderTasks(
    milestoneTaskIds: Set<ID>,
    tasksById: Map<ID, Task>,
  ): ID[] {
    const ordered: ID[] = [];
    const visiting = new Set<ID>();
    const visited = new Set<ID>();

    const visit = (
      taskId: ID,
    ): void => {
      if (
        visited.has(taskId)
      ) {
        return;
      }

      if (
        visiting.has(taskId)
      ) {
        throw new Error(
          `K.I.N.G.S. Workflow Planning: dependency cycle detected at task "${taskId}"`,
        );
      }

      const task =
        tasksById.get(
          taskId,
        );

      if (!task) {
        throw new Error(
          `K.I.N.G.S. Workflow Planning: task "${taskId}" was not found`,
        );
      }

      visiting.add(
        taskId,
      );

      for (
        const dependencyId of
        task.dependencyIds
      ) {
        if (
          milestoneTaskIds.has(
            dependencyId,
          )
        ) {
          visit(
            dependencyId,
          );
        }
      }

      visiting.delete(
        taskId,
      );

      visited.add(
        taskId,
      );

      ordered.push(
        taskId,
      );
    };

    for (
      const taskId of
      milestoneTaskIds
    ) {
      visit(
        taskId,
      );
    }

    return ordered;
  }

  private createWorkUnit(
    request: WorkflowPlanningRequest,
    milestone: MissionMilestone,
    task: Task,
  ): WorkUnitContract {
    const dependencyIds =
      task.dependencyIds.filter(
        (dependencyId) =>
          milestone.taskIds.includes(
            dependencyId,
          ),
      );

    return {
      id:
        `WORK-UNIT-${request.missionPlan.missionId}-${task.id}`,
      role:
        request.workUnitDefaults.role,
      objective:
        task.description,
      capabilityIds: [
        ...request.workUnitDefaults
          .capabilityIds,
      ],
      allowedToolIds: [
        ...request.workUnitDefaults
          .allowedToolIds,
      ],
      allowedPaths: [
        ...request.workUnitDefaults
          .allowedPaths,
      ],
      budget: {
        maxTimeMs:
          request.workUnitDefaults
            .maxTimeMs,
        maxTokens:
          request.workUnitDefaults
            .maxTokens,
        maxIterations:
          request.workUnitDefaults
            .maxIterations,
      },
      dependencyIds,
      acceptanceCriteria: [
        ...(
          task.expectedOutputs.length > 0
            ? task.expectedOutputs
            : [milestone.objective]
        ),
      ],
      requiredEvidenceTypes: [
        ...request.workUnitDefaults
          .requiredEvidenceTypes,
      ],
      approved:
        request.workUnitDefaults
          .approved,
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString(),
    };
  }

  private cloneTask(
    task: Task,
  ): Task {
    return {
      ...task,
      requiredCapabilities: [
        ...task.requiredCapabilities,
      ],
      requiredToolIds: [
        ...task.requiredToolIds,
      ],
      dependencyIds: [
        ...task.dependencyIds,
      ],
      inputReferences: [
        ...task.inputReferences,
      ],
      expectedOutputs: [
        ...task.expectedOutputs,
      ],
      knowledgeQuery:
        task.knowledgeQuery
          ? {
              ...task.knowledgeQuery,
              memoryTypes:
                task.knowledgeQuery
                  .memoryTypes
                  ? [
                      ...task
                        .knowledgeQuery
                        .memoryTypes,
                    ]
                  : undefined,
              sourceIds:
                task.knowledgeQuery
                  .sourceIds
                  ? [
                      ...task
                        .knowledgeQuery
                        .sourceIds,
                    ]
                  : undefined,
            }
          : undefined,
    };
  }
}
