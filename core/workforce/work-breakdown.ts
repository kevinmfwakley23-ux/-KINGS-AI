import type {
  ID,
} from "./types";

import type {
  WorkflowPlanningResult,
  WorkflowTaskProposal,
} from "./workflow-planner";

export interface WorkBreakdownLayer {
  index:
    number;
  taskIds:
    ID[];
}

export interface WorkBreakdownItem {
  taskId:
    ID;
  proposalId:
    ID;
  dependencyIds:
    ID[];
  layer:
    number;
  workUnitId:
    ID;
}

export interface WorkBreakdownResult {
  missionId:
    ID;
  planId:
    ID;
  milestoneId:
    ID;
  layers:
    WorkBreakdownLayer[];
  items:
    WorkBreakdownItem[];
  readyTaskIds:
    ID[];
  blockedTaskIds:
    ID[];
  createdAt:
    string;
}

export class WorkBreakdownAuthority {
  build(
    workflow:
      WorkflowPlanningResult,
  ): WorkBreakdownResult {
    const proposalByTask =
      new Map<
        ID,
        WorkflowTaskProposal
      >();

    for (
      const proposal of
        workflow.proposals
    ) {
      if (
        proposalByTask.has(
          proposal.task.id,
        )
      ) {
        throw new Error(
          `K.I.N.G.S. Work Breakdown: duplicate proposal for task "${proposal.task.id}"`,
        );
      }

      proposalByTask.set(
        proposal.task.id,
        proposal,
      );
    }

    for (
      const taskId of
        workflow.orderedTaskIds
    ) {
      if (
        !proposalByTask.has(
          taskId,
        )
      ) {
        throw new Error(
          `K.I.N.G.S. Work Breakdown: workflow task "${taskId}" has no proposal`,
        );
      }
    }

    const layerByTask =
      new Map<
        ID,
        number
      >();

    const layers:
      WorkBreakdownLayer[] =
      [];

    for (
      const taskId of
        workflow.orderedTaskIds
    ) {
      const proposal =
        proposalByTask.get(
          taskId,
        )!;

      const dependencyLayers =
        proposal.workUnit.dependencyIds
          .filter(
            (dependencyId) =>
              layerByTask.has(
                dependencyId,
              ),
          )
          .map(
            (dependencyId) =>
              layerByTask.get(
                dependencyId,
              )!,
          );

      const layer =
        dependencyLayers.length ===
        0
          ? 0
          : Math.max(
              ...dependencyLayers,
            ) + 1;

      layerByTask.set(
        taskId,
        layer,
      );

      while (
        layers.length <=
        layer
      ) {
        layers.push({
          index:
            layers.length,
          taskIds: [],
        });
      }

      layers[layer].taskIds.push(
        taskId,
      );
    }

    const items:
      WorkBreakdownItem[] =
      workflow.orderedTaskIds.map(
        (taskId) => {
          const proposal =
            proposalByTask.get(
              taskId,
            )!;

          return {
            taskId,
            proposalId:
              proposal.id,
            dependencyIds: [
              ...proposal.workUnit
                .dependencyIds,
            ],
            layer:
              layerByTask.get(
                taskId,
              )!,
            workUnitId:
              proposal.workUnit.id,
          };
        },
      );

    const readyTaskIds =
      items
        .filter(
          (item) =>
            item.dependencyIds.length ===
            0,
        )
        .map(
          (item) =>
            item.taskId,
        );

    const blockedTaskIds =
      items
        .filter(
          (item) =>
            item.dependencyIds.length >
            0,
        )
        .map(
          (item) =>
            item.taskId,
        );

    return {
      missionId:
        workflow.missionId,
      planId:
        workflow.planId,
      milestoneId:
        workflow.milestoneId,
      layers,
      items,
      readyTaskIds,
      blockedTaskIds,
      createdAt:
        new Date().toISOString(),
    };
  }
}
