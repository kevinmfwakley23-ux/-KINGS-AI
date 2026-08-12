import type {
  ID,
  Task,
} from "./types";

import {
  validateWorkUnitContract,
  type WorkUnitContract,
} from "./work-unit-contract";

import {
  WorkflowPlanningAuthority,
  type WorkflowPlanningRequest,
  type WorkflowPlanningResult,
  type WorkflowTaskValidationPort,
} from "./workflow-planner";

import {
  WorkUnitRegistry,
} from "./work-unit-registry";

import type {
  MissionPlan,
  MissionMilestone,
} from "./mission-continuity";

export interface BuildPlanningRequest {
  missionPlan:
    MissionPlan;

  milestoneId:
    ID;

  tasks:
    Task[];

  workUnitDefaults:
    WorkflowPlanningRequest["workUnitDefaults"];
}

export interface BuildPlanningResult {
  workflow:
    WorkflowPlanningResult;

  workUnitContracts:
    Record<ID, WorkUnitContract>;
}

export class BuildPlanningAuthority {
  constructor(
    private readonly planner:
      WorkflowPlanningAuthority,
    private readonly workUnits:
      WorkUnitRegistry,
  ) {}

  plan(
    request:
      BuildPlanningRequest,
  ): BuildPlanningResult {
    const workflow =
      this.planner.plan({
        missionPlan:
          request.missionPlan,
        milestoneId:
          request.milestoneId,
        tasks:
          request.tasks,
        workUnitDefaults:
          request.workUnitDefaults,
      });

    const contracts:
      Record<ID, WorkUnitContract> =
      {};

    for (
      const proposal of
        workflow.proposals
    ) {
      const contract =
        proposal.workUnit;

      const validation =
        validateWorkUnitContract(
          contract,
        );

      if (
        !validation.valid
      ) {
        throw new Error(
          `K.I.N.G.S. Build Planning: invalid Work Unit Contract for task "${proposal.task.id}": ` +
          validation.reasons.join(
            " ",
          ),
        );
      }

      contracts[
        proposal.task.id
      ] =
        {
          ...contract,
          capabilityIds: [
            ...contract.capabilityIds,
          ],
          allowedToolIds: [
            ...contract.allowedToolIds,
          ],
          allowedPaths: [
            ...contract.allowedPaths,
          ],
          dependencyIds: [
            ...contract.dependencyIds,
          ],
          acceptanceCriteria: [
            ...contract.acceptanceCriteria,
          ],
          requiredEvidenceTypes: [
            ...contract.requiredEvidenceTypes,
          ],
          budget: {
            ...contract.budget,
          },
        };
    }

    return {
      workflow,
      workUnitContracts:
        contracts,
    };
  }

  bind(
    result:
      BuildPlanningResult,
  ): void {
    for (
      const [
        taskId,
        contract,
      ] of Object.entries(
        result.workUnitContracts,
      )
    ) {
      if (
        this.workUnits.has(
          taskId,
        )
      ) {
        continue;
      }

      this.workUnits.register(
        taskId,
        contract,
      );
    }
  }
}
