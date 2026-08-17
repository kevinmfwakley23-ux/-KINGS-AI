import type {
  ID,
  Mission,
} from "./types";

import type {
  MissionPlan,
} from "./mission-continuity";

import {
  KingsCodingMachine,
} from "./kings-coding-machine";

import {
  ProjectOwnerUiController,
  type ProjectOwnerDesignInput,
  type ProjectOwnerMissionView,
  validateProjectOwnerDesignInput,
} from "./project-owner-ui-contract";

export interface ProjectOwnerMachineApiRequest {
  action:
    "create-mission"
    | "approve-plan"
    | "lock-plan"
    | "snapshot";

  input?:
    ProjectOwnerDesignInput;

  missionId?:
    ID;
}

export interface ProjectOwnerMachineApiResponse {
  ok:
    boolean;

  message:
    string;

  view?:
    ProjectOwnerMissionView;

  plan?:
    MissionPlan;
}

export interface ProjectOwnerMissionFactory {
  create(
    input:
      ProjectOwnerDesignInput,
  ):
    {
      mission:
        Mission;
      plan:
        MissionPlan;
    };
}

export class ProjectOwnerMachineApi {
  private readonly controller:
    ProjectOwnerUiController;

  constructor(
    private readonly machine:
      KingsCodingMachine,
    private readonly missionFactory:
      ProjectOwnerMissionFactory,
    controller:
      ProjectOwnerUiController =
        new ProjectOwnerUiController(),
  ) {
    this.controller =
      controller;
  }

  handle(
    request:
      ProjectOwnerMachineApiRequest,
  ):
    ProjectOwnerMachineApiResponse {
    try {
      if (
        request.action ===
        "create-mission"
      ) {
        if (!request.input) {
          return {
            ok:
              false,
            message:
              "A project design input is required.",
          };
        }

        const validation =
          validateProjectOwnerDesignInput(
            request.input,
          );

        if (
          validation.length >
          0
        ) {
          return {
            ok:
              false,
            message:
              validation.join(
                " ",
              ),
          };
        }

        const design =
          this.controller.createMissionRequest(
            request.input,
          );

        const created =
          this.missionFactory.create(
            design,
          );

        const snapshot =
          this.machine.startMission({
            mission:
              created.mission,
            plan:
              created.plan,
          });

        return {
          ok:
            true,
          message:
            "Mission created. Human approval is required before execution.",
          view: {
            mission:
              snapshot.mission,
            plan:
              snapshot.plan,
            state:
              snapshot.state,
          },
        };
      }

      const missionId =
        request.missionId?.trim();

      if (!missionId) {
        return {
          ok:
            false,
          message:
            "Mission id is required.",
        };
      }

      if (
        request.action ===
        "approve-plan"
      ) {
        const plan =
          this.machine.approvePlan(
            missionId,
          );

        const snapshot =
          this.machine.snapshot(
            missionId,
          );

        return {
          ok:
            true,
          message:
            "Mission plan approved.",
          plan,
          view: {
            mission:
              snapshot.mission,
            plan:
              snapshot.plan,
            state:
              snapshot.state,
          },
        };
      }

      if (
        request.action ===
        "lock-plan"
      ) {
        const plan =
          this.machine.lockPlan(
            missionId,
          );

        const snapshot =
          this.machine.snapshot(
            missionId,
          );

        return {
          ok:
            true,
          message:
            "Mission plan locked and ready for governed execution.",
          plan,
          view: {
            mission:
              snapshot.mission,
            plan:
              snapshot.plan,
            state:
              snapshot.state,
          },
        };
      }

      if (
        request.action ===
        "snapshot"
      ) {
        const snapshot =
          this.machine.snapshot(
            missionId,
          );

        return {
          ok:
            true,
          message:
            this.controller.summarize({
              mission:
                snapshot.mission,
              plan:
                snapshot.plan,
              state:
                snapshot.state,
            }),
          view: {
            mission:
              snapshot.mission,
            plan:
              snapshot.plan,
            state:
              snapshot.state,
          },
        };
      }

      return {
        ok:
          false,
        message:
          "Unsupported Project Owner action.",
      };
    } catch (
      error
    ) {
      return {
        ok:
          false,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }
}
