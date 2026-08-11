import type {
  ID,
} from "./types";

import {
  validateWorkUnitContract,
} from "./work-unit-contract";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

import {
  WorkUnitRegistry,
} from "./work-unit-registry";

import {
  WorkforceRegistry,
} from "./registry";

import type {
  WorkforceFormationAssignment,
  WorkforceFormationPlan,
} from "./workforce-formation";

export interface WorkUnitAssignment {
  taskId: ID;
  agentId: ID;
  workUnitId: ID;
  contract: WorkUnitContract;
  assignedAt: string;
}

export interface WorkUnitAssignmentResult {
  missionId: ID;
  assignments: WorkUnitAssignment[];
  assignedTaskIds: ID[];
  createdAt: string;
}

export class WorkUnitAssignmentAuthority {
  constructor(
    private readonly registry:
      WorkforceRegistry,
    private readonly workUnitRegistry:
      WorkUnitRegistry,
  ) {}

  assign(
    plan:
      WorkforceFormationPlan,
  ): WorkUnitAssignmentResult {
    this.validatePlan(
      plan,
    );

    const assignments:
      WorkUnitAssignment[] =
      [];

    for (
      const formationAssignment of
      plan.assignments
    ) {
      assignments.push(
        this.assignOne(
          plan,
          formationAssignment,
        ),
      );
    }

    return {
      missionId:
        plan.missionId,
      assignments,
      assignedTaskIds:
        assignments.map(
          (assignment) =>
            assignment.taskId,
        ),
      createdAt:
        new Date().toISOString(),
    };
  }

  private assignOne(
    plan:
      WorkforceFormationPlan,
    formationAssignment:
      WorkforceFormationAssignment,
  ): WorkUnitAssignment {
    const task =
      this.registry.getTask(
        formationAssignment.taskId,
      );

    if (!task) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: task "${formationAssignment.taskId}" not found.`,
      );
    }

    if (
      task.missionId !==
      plan.missionId
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: task "${task.id}" does not belong to mission "${plan.missionId}".`,
      );
    }

    if (
      task.status !==
        "pending" &&
      task.status !==
        "ready"
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: task "${task.id}" is not assignable while status is "${task.status}".`,
      );
    }

    const agent =
      this.registry.getAgent(
        formationAssignment.agentId,
      );

    if (!agent) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: selected worker "${formationAssignment.agentId}" does not exist.`,
      );
    }

    if (
      agent.status !==
      "available"
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: selected worker "${agent.id}" is not available.`,
      );
    }

    if (
      task.assignedAgentId !==
        undefined &&
      task.assignedAgentId !==
        agent.id
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: task "${task.id}" is already assigned to worker "${task.assignedAgentId}".`,
      );
    }

    if (
      task.assignedAgentId ===
      agent.id
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: task "${task.id}" is already assigned to worker "${agent.id}".`,
      );
    }

    this.validateCapabilities(
      task.id,
      task.requiredCapabilities,
      agent.id,
      agent.capabilities,
    );

    this.validateTools(
      task.id,
      task.requiredToolIds,
      agent.id,
      agent.toolIds,
    );

    const contract =
      this.workUnitRegistry.get(
        task.id,
      );

    if (!contract) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: no Work Unit Contract is bound to task "${task.id}".`,
      );
    }

    const contractValidation =
      validateWorkUnitContract(
        contract,
      );

    if (
      !contractValidation.valid
    ) {
      throw new Error(
        "K.I.N.G.S. Work Unit Assignment: invalid Work Unit Contract for task " +
        `"${task.id}": ` +
        contractValidation.reasons.join(
          " ",
        ),
      );
    }

    this.validateContractAuthorization(
      task.id,
      task.requiredCapabilities,
      task.requiredToolIds,
      contract,
    );

    /*
     * 02.4 is the assignment authority.
     *
     * It establishes who owns this task,
     * but it does not transition task state.
     * TaskControl remains the sole state
     * authority.
     */
    task.assignedAgentId =
      agent.id;

    task.updatedAt =
      new Date().toISOString();

    return {
      taskId:
        task.id,
      agentId:
        agent.id,
      workUnitId:
        contract.id,
      contract,
      assignedAt:
        task.updatedAt,
    };
  }

  private validateCapabilities(
    taskId: ID,
    requiredCapabilities: string[],
    agentId: ID,
    agentCapabilities: string[],
  ): void {
    const missing =
      requiredCapabilities.filter(
        (capability) =>
          !agentCapabilities.includes(
            capability,
          ),
      );

    if (
      missing.length > 0
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: worker "${agentId}" cannot satisfy task "${taskId}" capabilities: ${missing.join(", ")}.`,
      );
    }
  }

  private validateTools(
    taskId: ID,
    requiredToolIds: ID[],
    agentId: ID,
    agentToolIds: ID[],
  ): void {
    const missing =
      requiredToolIds.filter(
        (toolId) => {
          const tool =
            this.registry.getTool(
              toolId,
            );

          return (
            tool ===
              undefined ||
            !tool.enabled ||
            !agentToolIds.includes(
              toolId,
            )
          );
        },
      );

    if (
      missing.length > 0
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: worker "${agentId}" is not authorized for required tools on task "${taskId}": ${missing.join(", ")}.`,
      );
    }
  }

  private validateContractAuthorization(
    taskId: ID,
    requiredCapabilities: string[],
    requiredToolIds: ID[],
    contract: WorkUnitContract,
  ): void {
    const missingCapabilities =
      requiredCapabilities.filter(
        (capability) =>
          !contract.capabilityIds.includes(
            capability,
          ),
      );

    if (
      missingCapabilities.length >
      0
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: Work Unit Contract "${contract.id}" does not authorize required capabilities for task "${taskId}": ${missingCapabilities.join(", ")}.`,
      );
    }

    const missingTools =
      requiredToolIds.filter(
        (toolId) =>
          !contract.allowedToolIds.includes(
            toolId,
          ),
      );

    if (
      missingTools.length >
      0
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: Work Unit Contract "${contract.id}" does not authorize required tools for task "${taskId}": ${missingTools.join(", ")}.`,
      );
    }
  }

  private validatePlan(
    plan:
      WorkforceFormationPlan,
  ): void {
    if (
      !plan.missionId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Work Unit Assignment: missionId is required.",
      );
    }

    const mission =
      this.registry.getMission(
        plan.missionId,
      );

    if (!mission) {
      throw new Error(
        `K.I.N.G.S. Work Unit Assignment: mission "${plan.missionId}" not found.`,
      );
    }

    const seenTaskIds =
      new Set<ID>();

    for (
      const assignment of
      plan.assignments
    ) {
      if (
        seenTaskIds.has(
          assignment.taskId,
        )
      ) {
        throw new Error(
          `K.I.N.G.S. Work Unit Assignment: formation plan contains duplicate task "${assignment.taskId}".`,
        );
      }

      seenTaskIds.add(
        assignment.taskId,
      );
    }
  }
}
