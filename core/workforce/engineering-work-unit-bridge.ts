import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
  ToolchainOperation,
} from "./engineering-toolchain";

import type {
  ProjectEngineeringProfile,
} from "./project-engineering-profile";

export interface EngineeringWorkUnitRequirement {
  language:
    EngineeringLanguage;
  operations:
    ToolchainOperation[];
  required:
    boolean;
}

export interface EngineeringWorkUnitPlan {
  id:
    ID;
  projectId:
    ID;
  requirements:
    EngineeringWorkUnitRequirement[];
  capabilityIds:
    ID[];
  blocked:
    boolean;
  blockReasons:
    string[];
}

export class EngineeringWorkUnitBridge {
  createPlan(
    projectId:
      ID,
    profile:
      ProjectEngineeringProfile,
  ):
    EngineeringWorkUnitPlan {
    const requirements =
      profile.languages.map(
        (language) => ({
          language:
            language.language,
          operations:
            [
              ...profile.requiredOperations,
            ],
          required:
            true,
        }),
      );

    const capabilityIds =
      profile.languages.map(
        (language) =>
          `engineering-${language.language}`,
      );

    const blockReasons:
      string[] = [];

    if (
      !profile.buildReady &&
      profile.requiredOperations.includes(
        "build",
      )
    ) {
      blockReasons.push(
        "Required build toolchain is not verified.",
      );
    }

    if (
      !profile.testReady &&
      profile.requiredOperations.includes(
        "test",
      )
    ) {
      blockReasons.push(
        "Required test toolchain is not verified.",
      );
    }

    if (
      !profile.debugReady &&
      profile.requiredOperations.includes(
        "run",
      )
    ) {
      blockReasons.push(
        "Required runtime toolchain is not verified.",
      );
    }

    return {
      id:
        `engineering-plan-${projectId}`,
      projectId,
      requirements,
      capabilityIds,
      blocked:
        blockReasons.length > 0,
      blockReasons,
    };
  }
}
