import type {
  ID,
  Mission,
} from "./types";

import {
  MissionContinuityStore,
  type MissionCheckpoint,
  type MissionPlan,
  type MissionState,
} from "./mission-continuity";

import {
  ProjectBrainCheckpointAdapter,
} from "./project-brain-checkpoint";

import {
  BuildPlanningAuthority,
  type BuildPlanningResult,
  type BuildPlanningRequest,
} from "./build-planner";

import {
  WorkflowPlanningAuthority,
} from "./workflow-planner";

import {
  WorkUnitRegistry,
} from "./work-unit-registry";

import type {
  WorkflowTaskValidationPort,
} from "./workflow-planner";

export interface KingsCodingMissionRequest {
  mission:
    Mission;

  plan:
    MissionPlan;
}

export interface KingsCodingMachineSnapshot {
  mission:
    Mission;

  plan:
    MissionPlan;

  state:
    MissionState;

  latestCheckpoint?:
    MissionCheckpoint;
}

export class KingsCodingMachine {
  private readonly buildPlanner:
    BuildPlanningAuthority;

  constructor(
    private readonly continuity:
      MissionContinuityStore =
        new MissionContinuityStore(),
    private readonly projectBrain:
      ProjectBrainCheckpointAdapter =
        new ProjectBrainCheckpointAdapter(
          continuity,
        ),
    taskControl:
      WorkflowTaskValidationPort,
    workUnits:
      WorkUnitRegistry =
        new WorkUnitRegistry(),
  ) {
    this.buildPlanner =
      new BuildPlanningAuthority(
        new WorkflowPlanningAuthority(
          taskControl,
        ),
        workUnits,
      );
  }

  startMission(
    request:
      KingsCodingMissionRequest,
  ): KingsCodingMachineSnapshot {
    this.continuity.registerMission(
      request.mission,
    );

    this.continuity.registerPlan(
      request.plan,
    );

    return this.snapshot(
      request.mission.id,
    );
  }

  approvePlan(
    missionId:
      ID,
  ): MissionPlan {
    return this.continuity.approvePlan(
      missionId,
    );
  }

  lockPlan(
    missionId:
      ID,
  ): MissionPlan {
    return this.continuity.lockPlan(
      missionId,
    );
  }

  planMission(
    request:
      BuildPlanningRequest,
  ):
    BuildPlanningResult {
    const result =
      this.buildPlanner.plan(
        request,
      );

    this.buildPlanner.bind(
      result,
    );

    return result;
  }

  updateState(
    missionId:
      ID,
    changes:
      Partial<
        Omit<
          MissionState,
          "missionId"
        >
      >,
  ): MissionState {
    return this.continuity.updateState(
      missionId,
      changes,
    );
  }

  checkpoint(
    checkpoint:
      MissionCheckpoint,
  ): MissionCheckpoint {
    return this.projectBrain.create(
      checkpoint,
    );
  }

  restoreLatest(
    missionId:
      ID,
  ): MissionState {
    return this.projectBrain.restoreLatest(
      missionId,
    );
  }

  snapshot(
    missionId:
      ID,
  ): KingsCodingMachineSnapshot {
    const mission =
      this.continuity.getMission(
        missionId,
      );

    const plan =
      this.continuity.getPlan(
        missionId,
      );

    const state =
      this.continuity.getState(
        missionId,
      );

    if (
      !mission ||
      !plan ||
      !state
    ) {
      throw new Error(
        `K.I.N.G.S. Coding Machine: mission "${missionId}" is not initialized`,
      );
    }

    return {
      mission,
      plan,
      state,
      latestCheckpoint:
        this.projectBrain.latest(
          missionId,
        ),
    };
  }
}
