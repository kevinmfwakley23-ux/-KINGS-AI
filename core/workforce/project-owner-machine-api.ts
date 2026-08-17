import type {
  ID,
  Mission,
} from "./types";

import type {
  MissionPlan,
} from "./mission-continuity";

import {
  KingsCodingMachine,
  type KingsCodingMachineModelExecutionRequest,
} from "./kings-coding-machine";

import type {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import type {
  ProjectOwnerDesignInput,
  ProjectOwnerMissionView,
} from "./project-owner-ui-contract";

import {
  ProjectOwnerUiController,
  validateProjectOwnerDesignInput,
} from "./project-owner-ui-contract";

import {
  ModelDrivenCodingExecutionAuthority,
  type ModelDrivenCodingExecutionRequest,
} from "./model-driven-coding-execution";

import type {
  ModelExecutionRequest,
} from "./model-interface";

import type {
  ModelRouter,
  ModelRoutingRequest,
} from "./model-routing";

import type {
  ProviderAdapterRegistry,
} from "./provider-adapters";

export interface ProjectOwnerMachineApiRequest {
  action:
    | "create-mission"
    | "approve-plan"
    | "lock-plan"
    | "snapshot"
    | "execute-next";

  input?:
    ProjectOwnerDesignInput;

  missionId?:
    ID;

  modelExecution?: {
    modelRequest:
      ModelExecutionRequest;
    routing:
      ModelRoutingRequest;
    machineRequest:
      Omit<
        KingsCodingMachineModelExecutionRequest,
        "modelResult"
      >;
  };

  editor?:
    EngineeringRepairEditor;

  buildTestOptions?:
    ConstructorParameters<
      typeof import("./coding-work-unit-execution").CodingWorkUnitExecutionAuthority
    >[1];
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

export interface ProjectOwnerModelExecutionDefaults {
  request:
    ModelExecutionRequest;

  routing:
    ModelRoutingRequest;
}

export class ProjectOwnerMachineApi {
  private readonly controller:
    ProjectOwnerUiController;

  private readonly modelDrivenCoding:
    ModelDrivenCodingExecutionAuthority;

  constructor(
    private readonly machine:
      KingsCodingMachine,
    private readonly missionFactory:
      ProjectOwnerMissionFactory,
    modelRouter:
      ModelRouter,
    providers:
      ProviderAdapterRegistry,
    modelDefaults:
      ProjectOwnerModelExecutionDefaults,
    controller:
      ProjectOwnerUiController =
        new ProjectOwnerUiController(),
  ) {
    this.controller =
      controller;

    this.modelDrivenCoding =
      new ModelDrivenCodingExecutionAuthority(
        machine,
        modelRouter,
        providers,
      );

    this.modelDefaults =
      modelDefaults;
  }

  private readonly modelDefaults:
    ProjectOwnerModelExecutionDefaults;

  async handle(
    request:
      ProjectOwnerMachineApiRequest,
  ):
    Promise<ProjectOwnerMachineApiResponse> {
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
              validation.join(" "),
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

      if (
        request.action ===
        "execute-next"
      ) {
        if (!request.modelExecution) {
          return {
            ok:
              false,
            message:
              "A model execution request is required.",
          };
        }

        if (!request.editor) {
          return {
            ok:
              false,
            message:
              "A governed engineering editor is required.",
          };
        }

        if (!request.buildTestOptions) {
          return {
            ok:
              false,
            message:
              "Build/test runtime options are required.",
          };
        }

        const executionRequest:
          ModelDrivenCodingExecutionRequest = {
          modelRequest: {
            ...this.modelDefaults.request,
            ...request.modelExecution.modelRequest,
            id:
              request.modelExecution.modelRequest.id,
            taskId:
              request.modelExecution.machineRequest.taskId,
            missionId:
              request.modelExecution.machineRequest.projectId,
          },
          routing: {
            ...this.modelDefaults.routing,
            ...request.modelExecution.routing,
          },
          machineRequest:
            request.modelExecution.machineRequest,
        };

        const result =
          await this.modelDrivenCoding.execute(
            executionRequest,
            request.editor,
            request.buildTestOptions,
          );

        const snapshot =
          this.machine.snapshot(
            missionId,
          );

        return {
          ok:
            result.completed,
          message:
            result.completed
              ? "Coding work unit completed and verified."
              : "Coding work unit did not satisfy completion criteria.",
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
      error,
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
