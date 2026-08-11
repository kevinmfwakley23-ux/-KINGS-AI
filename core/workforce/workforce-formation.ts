import type {
  AgentDefinition,
  ID,
  Task,
} from "./types";

import {
  WorkforceRegistry,
} from "./registry";

export interface WorkforceFormationRequest {
  missionId: ID;
  taskIds: ID[];

  /**
   * When true, one worker may receive more than one task.
   *
   * Default is false so formation prefers a distinct
   * available worker for each task whenever possible.
   */
  allowAgentReuse?: boolean;
}

export interface WorkforceFormationAssignment {
  taskId: ID;
  agentId: ID;
  score: number;
  reasons: string[];
}

export interface WorkforceFormationRejection {
  taskId: ID;
  agentId?: ID;
  reasons: string[];
}

export interface WorkforceFormationPlan {
  missionId: ID;

  assignments:
    WorkforceFormationAssignment[];

  rejectedTasks:
    WorkforceFormationRejection[];

  createdAt: string;
}

interface Candidate {
  agent: AgentDefinition;
  score: number;
  reasons: string[];
}

interface FormableTask {
  task: Task;
  candidates: Candidate[];
  originalIndex: number;
}

export class WorkforceFormationAuthority {
  constructor(
    private readonly registry:
      WorkforceRegistry,
  ) {}

  form(
    request:
      WorkforceFormationRequest,
  ): WorkforceFormationPlan {
    this.validateRequest(
      request,
    );

    const assignments:
      WorkforceFormationAssignment[] =
      [];

    const rejectedTasks:
      WorkforceFormationRejection[] =
      [];

    const usedAgentIds =
      new Set<ID>();

    const allowAgentReuse =
      request.allowAgentReuse ??
      false;

    const formableTasks:
      FormableTask[] =
      [];

    /*
     * First inspect every task before making
     * any assignment.
     *
     * This is critical: formation is a
     * workforce-level planning decision,
     * not a sequence of independent greedy
     * task decisions.
     */
    request.taskIds.forEach(
      (
        taskId,
        originalIndex,
      ) => {
        const task =
          this.registry.getTask(
            taskId,
          );

        if (!task) {
          rejectedTasks.push({
            taskId,
            reasons: [
              `Task "${taskId}" is not registered.`,
            ],
          });

          return;
        }

        if (
          task.missionId !==
          request.missionId
        ) {
          rejectedTasks.push({
            taskId,
            reasons: [
              `Task "${taskId}" belongs to mission "${task.missionId}", not "${request.missionId}".`,
            ],
          });

          return;
        }

        if (
          task.status !==
            "pending" &&
          task.status !==
            "ready"
        ) {
          rejectedTasks.push({
            taskId,
            reasons: [
              `Task "${taskId}" is not formable because its status is "${task.status}".`,
            ],
          });

          return;
        }

        const candidates =
          this.findAllCandidates(
            task,
          );

        if (
          candidates.length ===
          0
        ) {
          rejectedTasks.push({
            taskId,
            reasons:
              this.explainNoCandidate(
                task,
              ),
          });

          return;
        }

        formableTasks.push({
          task,
          candidates,
          originalIndex,
        });
      },
    );

    /*
     * Constrained-task-first formation:
     *
     * A task with fewer eligible workers
     * gets priority over a task with many
     * eligible workers.
     *
     * This prevents a flexible task from
     * consuming a worker that a constrained
     * task cannot replace.
     *
     * Original request order remains the
     * deterministic tie-breaker.
     */
    formableTasks.sort(
      (
        left,
        right,
      ) => {
        if (
          left.candidates.length !==
          right.candidates.length
        ) {
          return (
            left.candidates.length -
            right.candidates.length
          );
        }

        return (
          left.originalIndex -
          right.originalIndex
        );
      },
    );

    for (
      const formableTask of
      formableTasks
    ) {
      const availableCandidates =
        allowAgentReuse
          ? formableTask.candidates
          : formableTask.candidates.filter(
              (candidate) =>
                !usedAgentIds.has(
                  candidate.agent.id,
                ),
            );

      if (
        availableCandidates.length ===
        0
      ) {
        rejectedTasks.push({
          taskId:
            formableTask.task.id,
          reasons: [
            "All otherwise eligible workers have already been assigned in this formation.",
          ],
        });

        continue;
      }

      const selected =
        availableCandidates[0];

      assignments.push({
        taskId:
          formableTask.task.id,
        agentId:
          selected.agent.id,
        score:
          selected.score,
        reasons: [
          ...selected.reasons,
          ...(formableTask.candidates.length ===
          1
            ? [
                "Worker is the only eligible candidate for this task.",
              ]
            : [
                `Task had ${formableTask.candidates.length} eligible worker candidates.`,
              ]),
        ],
      });

      if (
        !allowAgentReuse
      ) {
        usedAgentIds.add(
          selected.agent.id,
        );
      }
    }

    /*
     * Return assignments in the same task
     * order requested by the caller.
     *
     * Internal formation ordering is an
     * implementation detail and must not
     * leak into the public plan.
     */
    const requestOrder =
      new Map<ID, number>();

    request.taskIds.forEach(
      (
        taskId,
        index,
      ) => {
        requestOrder.set(
          taskId,
          index,
        );
      },
    );

    assignments.sort(
      (
        left,
        right,
      ) =>
        (requestOrder.get(
          left.taskId,
        ) ?? Number.MAX_SAFE_INTEGER) -
        (requestOrder.get(
          right.taskId,
        ) ?? Number.MAX_SAFE_INTEGER),
    );

    rejectedTasks.sort(
      (
        left,
        right,
      ) =>
        (requestOrder.get(
          left.taskId,
        ) ?? Number.MAX_SAFE_INTEGER) -
        (requestOrder.get(
          right.taskId,
        ) ?? Number.MAX_SAFE_INTEGER),
    );

    return {
      missionId:
        request.missionId,
      assignments,
      rejectedTasks,
      createdAt:
        new Date().toISOString(),
    };
  }

  private findAllCandidates(
    task: Task,
  ): Candidate[] {
    return this.registry
      .listAgents()
      .filter(
        (agent) =>
          agent.status ===
            "available" &&
          this.agentSatisfiesTask(
            agent,
            task,
          ),
      )
      .map(
        (agent) =>
          this.scoreCandidate(
            agent,
            task,
          ),
      )
      .sort(
        (
          left,
          right,
        ) => {
          if (
            right.score !==
            left.score
          ) {
            return (
              right.score -
              left.score
            );
          }

          return left.agent.id.localeCompare(
            right.agent.id,
          );
        },
      );
  }

  private agentSatisfiesTask(
    agent: AgentDefinition,
    task: Task,
  ): boolean {
    const hasCapabilities =
      task.requiredCapabilities.every(
        (
          requiredCapability,
        ) =>
          agent.capabilities.includes(
            requiredCapability,
          ),
      );

    if (
      !hasCapabilities
    ) {
      return false;
    }

    return task.requiredToolIds.every(
      (toolId) => {
        const tool =
          this.registry.getTool(
            toolId,
          );

        if (!tool) {
          return false;
        }

        if (!tool.enabled) {
          return false;
        }

        return agent.toolIds.includes(
          toolId,
        );
      },
    );
  }

  private scoreCandidate(
    agent: AgentDefinition,
    task: Task,
  ): Candidate {
    let score = 0;

    const reasons: string[] =
      [];

    for (
      const capability of
      task.requiredCapabilities
    ) {
      if (
        agent.capabilities.includes(
          capability,
        )
      ) {
        score += 100;

        reasons.push(
          `Required capability "${capability}" is present.`,
        );
      }
    }

    for (
      const toolId of
      task.requiredToolIds
    ) {
      if (
        agent.toolIds.includes(
          toolId,
        )
      ) {
        score += 25;

        reasons.push(
          `Required tool "${toolId}" is authorized.`,
        );
      }
    }

    if (
      agent.status ===
      "available"
    ) {
      score += 10;

      reasons.push(
        "Worker is currently available.",
      );
    }

    const extraCapabilities =
      Math.max(
        0,
        agent.capabilities.length -
          task.requiredCapabilities.length,
      );

    if (
      extraCapabilities ===
      0
    ) {
      score += 5;

      reasons.push(
        "Worker has an exact capability footprint for the task.",
      );
    }

    return {
      agent,
      score,
      reasons,
    };
  }

  private explainNoCandidate(
    task: Task,
  ): string[] {
    const reasons: string[] =
      [];

    const agents =
      this.registry.listAgents();

    if (
      agents.length ===
      0
    ) {
      reasons.push(
        "No workers are registered.",
      );

      return reasons;
    }

    const availableAgents =
      agents.filter(
        (agent) =>
          agent.status ===
          "available",
      );

    if (
      availableAgents.length ===
      0
    ) {
      reasons.push(
        "No registered workers are currently available.",
      );

      return reasons;
    }

    const capabilityMatches =
      availableAgents.filter(
        (agent) =>
          task.requiredCapabilities.every(
            (capability) =>
              agent.capabilities.includes(
                capability,
              ),
          ),
      );

    if (
      capabilityMatches.length ===
      0
    ) {
      reasons.push(
        "No available worker possesses all required capabilities.",
      );

      return reasons;
    }

    const toolMatches =
      capabilityMatches.filter(
        (agent) =>
          task.requiredToolIds.every(
            (toolId) => {
              const tool =
                this.registry.getTool(
                  toolId,
                );

              return (
                tool !==
                  undefined &&
                tool.enabled &&
                agent.toolIds.includes(
                  toolId,
                )
              );
            },
          ),
      );

    if (
      toolMatches.length ===
        0 &&
      capabilityMatches.length >
        0
    ) {
      reasons.push(
        "Available capability-matched workers cannot satisfy all required tool authorizations.",
      );
    }

    if (
      reasons.length ===
      0
    ) {
      reasons.push(
        "No worker satisfied the complete formation requirements.",
      );
    }

    return reasons;
  }

  private validateRequest(
    request:
      WorkforceFormationRequest,
  ): void {
    if (
      !request.missionId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Workforce Formation: missionId is required.",
      );
    }

    if (
      request.taskIds.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Workforce Formation: at least one task is required.",
      );
    }

    const duplicateTaskIds =
      request.taskIds.filter(
        (
          taskId,
          index,
        ) =>
          request.taskIds.indexOf(
            taskId,
          ) !== index,
      );

    if (
      duplicateTaskIds.length >
      0
    ) {
      throw new Error(
        `K.I.N.G.S. Workforce Formation: duplicate task ids are not allowed: ${[
          ...new Set(
            duplicateTaskIds,
          ),
        ].join(", ")}`,
      );
    }
  }
}
