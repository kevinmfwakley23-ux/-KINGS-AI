import type {
  ID,
  MemoryQuery,
  WorkforceResult,
} from "./types";

import type {
  WorkforceExecutionPort,
} from "./execution/execution-port";

import type {
  ProjectBrainStateSnapshot,
  ProjectBrainStateAuthority,
} from "./project-brain-state";

import {
  ProjectBrainStateDeltaAuthority,
} from "./project-brain-state-delta";

import {
  ProjectBrainChangeLedger,
  type ProjectBrainChangeEvent,
} from "./project-brain-change-ledger";

import {
  ProjectBrainChangeImpactAuthority,
  type ProjectBrainChangeImpactAssessment,
} from "./project-brain-change-impact";

export interface BuilderV1Request {
  missionId: ID;
  objective: string;
  taskIds: ID[];
  knowledgeQuery: MemoryQuery;

  /**
   * Previous Project Brain state for this mission.
   *
   * When supplied, Builder V1 derives the
   * 016 → 017 → 018 change chain before
   * executing work.
   */
  previousState?: ProjectBrainStateSnapshot;
}

export interface BuilderV1Plan {
  missionId: ID;
  objective: string;
  taskIds: ID[];
  knowledgeQuery: MemoryQuery;
  createdAt: string;
}

export interface BuilderV1Execution {
  taskId: ID;
  result: WorkforceResult;
}

export interface BuilderV1Result {
  missionId: ID;
  plan: BuilderV1Plan;
  state: ProjectBrainStateSnapshot;
  delta?: ReturnType<
    ProjectBrainStateDeltaAuthority["compare"]
  >;
  changeEvent?: ProjectBrainChangeEvent;
  impact?: ProjectBrainChangeImpactAssessment;
  executions: BuilderV1Execution[];
  completedAt: string;
}

export class BuilderV1 {
  private readonly deltaAuthority =
    new ProjectBrainStateDeltaAuthority();

  private readonly changeLedger =
    new ProjectBrainChangeLedger();

  private readonly impactAuthority =
    new ProjectBrainChangeImpactAuthority();

  constructor(
    private readonly execution:
      WorkforceExecutionPort,
    private readonly stateAuthority:
      ProjectBrainStateAuthority,
  ) {}

  async build(
    request: BuilderV1Request,
  ): Promise<BuilderV1Result> {
    this.validateRequest(
      request,
    );

    const state =
      this.stateAuthority.snapshot({
        missionId:
          request.missionId,
        knowledgeQuery:
          request.knowledgeQuery,
      });

    let delta:
      ReturnType<
        ProjectBrainStateDeltaAuthority["compare"]
      > | undefined;

    let changeEvent:
      ProjectBrainChangeEvent | undefined;

    let impact:
      ProjectBrainChangeImpactAssessment
      | undefined;

    if (request.previousState) {
      delta =
        this.deltaAuthority.compare(
          request.previousState,
          state,
        );

      if (delta.changed) {
        changeEvent =
          this.changeLedger.register(
            delta,
          );

        impact =
          this.impactAuthority.assess(
            changeEvent,
          );

        if (
          impact.impact ===
          "blocking"
        ) {
          throw new Error(
            `K.I.N.G.S. Builder V1: mission "${request.missionId}" ` +
            "has a blocking Project Brain change impact",
          );
        }
      }
    }

    const plan: BuilderV1Plan = {
      missionId:
        request.missionId,
      objective:
        request.objective,
      taskIds: [
        ...request.taskIds,
      ],
      knowledgeQuery: {
        ...request.knowledgeQuery,
      },
      createdAt:
        new Date().toISOString(),
    };

    const executions:
      BuilderV1Execution[] = [];

    for (
      const taskId of plan.taskIds
    ) {
      const result =
        await this.execution.execute(
          taskId,
        );

      executions.push({
        taskId,
        result,
      });
    }

    return {
      missionId:
        request.missionId,
      plan,
      state,
      delta,
      changeEvent,
      impact,
      executions,
      completedAt:
        new Date().toISOString(),
    };
  }

  private validateRequest(
    request: BuilderV1Request,
  ): void {
    if (
      !request.missionId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Builder V1: mission id is required",
      );
    }

    if (
      !request.objective.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Builder V1: objective is required",
      );
    }

    if (
      !Array.isArray(
        request.taskIds,
      ) ||
      request.taskIds.length === 0
    ) {
      throw new Error(
        "K.I.N.G.S. Builder V1: at least one task id is required",
      );
    }

    for (
      const taskId of request.taskIds
    ) {
      if (!taskId.trim()) {
        throw new Error(
          "K.I.N.G.S. Builder V1: task ids must not be empty",
        );
      }
    }

    if (
      !request.knowledgeQuery ||
      !request.knowledgeQuery.query.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Builder V1: knowledge query is required",
      );
    }

    if (
      request.previousState &&
      request.previousState.missionId !==
        request.missionId
    ) {
      throw new Error(
        "K.I.N.G.S. Builder V1: previous state must belong to the requested mission",
      );
    }
  }
}
