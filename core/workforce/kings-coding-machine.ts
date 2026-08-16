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
  constructor(
    private readonly continuity:
      MissionContinuityStore =
        new MissionContinuityStore(),
    private readonly projectBrain:
      ProjectBrainCheckpointAdapter =
        new ProjectBrainCheckpointAdapter(
          continuity,
        ),
  ) {}

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
