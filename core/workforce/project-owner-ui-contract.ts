import type {
  ID,
  Mission,
} from "./types";

import type {
  MissionPlan,
  MissionState,
} from "./mission-continuity";

import type {
  GitHubRepositorySource,
} from "./github-repository-workspace";

export interface ProjectOwnerDesignInput {
  id:
    ID;

  projectName:
    string;

  objective:
    string;

  requirements:
    string[];

  preferredPlatform?:
    string;

  preferredLanguage?:
    string;

  constraints:
    string[];

  acceptanceCriteria:
    string[];

  repository?:
    GitHubRepositorySource;
}

export interface ProjectOwnerMissionView {
  mission:
    Mission;

  plan:
    MissionPlan;

  state:
    MissionState;
}

export interface ProjectOwnerUiAction {
  type:
    | "create-mission"
    | "approve-plan"
    | "lock-plan"
    | "execute-next"
    | "pause"
    | "resume";

  missionId:
    ID;
}

export interface ProjectOwnerUiResponse {
  ok:
    boolean;

  message:
    string;

  view?:
    ProjectOwnerMissionView;
}

export function validateProjectOwnerDesignInput(
  input:
    ProjectOwnerDesignInput,
): string[] {
  const reasons: string[] = [];

  if (!input.id.trim()) {
    reasons.push(
      "Design input id is required.",
    );
  }

  if (!input.projectName.trim()) {
    reasons.push(
      "Project name is required.",
    );
  }

  if (!input.objective.trim()) {
    reasons.push(
      "Project objective is required.",
    );
  }

  if (input.requirements.length === 0) {
    reasons.push(
      "At least one project requirement is required.",
    );
  }

  if (input.acceptanceCriteria.length === 0) {
    reasons.push(
      "At least one acceptance criterion is required.",
    );
  }

  if (input.repository) {
    if (!input.repository.url?.trim()) {
      reasons.push(
        "GitHub repository URL is required when repository mode is enabled.",
      );
    }
    if (
      input.repository.publishBranch &&
      ["main", "master"].includes(
        input.repository.publishBranch.trim().toLowerCase(),
      )
    ) {
      reasons.push(
        "GitHub repository changes must publish to a K.I.N.G.S. work branch, not directly to main/master.",
      );
    }
  }

  return reasons;
}

export class ProjectOwnerUiController {
  createMissionRequest(
    input:
      ProjectOwnerDesignInput,
  ): ProjectOwnerDesignInput {
    const reasons =
      validateProjectOwnerDesignInput(
        input,
      );

    if (reasons.length > 0) {
      throw new Error(
        `K.I.N.G.S. Project Owner UI: ${reasons.join(" ")}`,
      );
    }

    return {
      ...input,
      requirements: [
        ...input.requirements,
      ],
      constraints: [
        ...input.constraints,
      ],
      acceptanceCriteria: [
        ...input.acceptanceCriteria,
      ],
      repository:
        input.repository
          ? { ...input.repository }
          : undefined,
    };
  }

  summarize(
    view:
      ProjectOwnerMissionView,
  ): string {
    const completed =
      view.state.completedTaskIds.length;

    const active =
      view.state.activeTaskIds.length;

    const failed =
      view.state.failedTaskIds.length;

    return [
      `${view.mission.name}`,
      `Status: ${view.mission.status}`,
      `Completed tasks: ${completed}`,
      `Active tasks: ${active}`,
      `Failed tasks: ${failed}`,
    ].join(" | ");
  }
}
