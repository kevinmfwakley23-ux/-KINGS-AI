import {
  ProjectOwnerMachineApi,
  type ProjectOwnerMachineApiRequest,
  type ProjectOwnerMachineApiResponse,
  type ProjectOwnerMissionFactory,
} from "../../core/workforce/project-owner-machine-api";

import {
  ProjectOwnerUiController,
  type ProjectOwnerDesignInput,
} from "../../core/workforce/project-owner-ui-contract";

export interface ProjectOwnerMachineApiHandler {
  handle(
    request:
      ProjectOwnerMachineApiRequest,
  ): Promise<ProjectOwnerMachineApiResponse>;
}

export class ProjectOwnerMachineServerController
  implements ProjectOwnerMachineApiHandler {
  private readonly api:
    ProjectOwnerMachineApi;

  constructor(
    machine: ConstructorParameters<
      typeof ProjectOwnerMachineApi
    >[0],
    missionFactory: ProjectOwnerMissionFactory,
  ) {
    this.api =
      new ProjectOwnerMachineApi(
        machine,
        missionFactory,
        new ProjectOwnerUiController(),
      );
  }

  handle(
    request: ProjectOwnerMachineApiRequest,
  ): Promise<ProjectOwnerMachineApiResponse> {
    return this.api.handle(
      request,
    );
  }
}

export function createProjectOwnerMissionRequest(
  input:
    ProjectOwnerDesignInput,
): ProjectOwnerMachineApiRequest {
  return {
    action:
      "create-mission",
    input,
  };
}
