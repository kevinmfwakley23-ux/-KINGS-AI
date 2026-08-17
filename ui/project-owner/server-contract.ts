import {
  ProjectOwnerUiController,
  type ProjectOwnerDesignInput,
  type ProjectOwnerUiResponse,
} from "../../core/workforce/project-owner-ui-contract";

export interface ProjectOwnerMissionApiHandler {
  createMission(
    input: ProjectOwnerDesignInput,
  ): Promise<ProjectOwnerUiResponse> | ProjectOwnerUiResponse;
}

export class ProjectOwnerMissionApiController
  implements ProjectOwnerMissionApiHandler {
  private readonly ui =
    new ProjectOwnerUiController();

  createMission(
    input: ProjectOwnerDesignInput,
  ): ProjectOwnerUiResponse {
    const request =
      this.ui.createMissionRequest(
        input,
      );

    return {
      ok: true,
      message:
        `Design received for project "${request.projectName}".`,
    };
  }
}
