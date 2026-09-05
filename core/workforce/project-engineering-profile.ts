import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
  ToolchainOperation,
} from "./engineering-toolchain";

import type {
  ToolchainVerificationResult,
} from "./toolchain-verification";

export interface ProjectLanguageEvidence {
  language:
    EngineeringLanguage;
  fileCount:
    number;
  extensions:
    string[];
}

export interface ProjectEngineeringProfile {
  id:
    ID;
  projectPath:
    string;
  languages:
    ProjectLanguageEvidence[];
  requiredOperations:
    ToolchainOperation[];
  verifiedToolchains:
    ToolchainVerificationResult[];
  unsupportedLanguages:
    EngineeringLanguage[];
  buildReady:
    boolean;
  testReady:
    boolean;
  debugReady:
    boolean;
}

export interface ProjectEngineeringProfileRequest {
  id:
    ID;
  projectPath:
    string;
  languages:
    ProjectLanguageEvidence[];
  requiredOperations:
    ToolchainOperation[];
  toolchainResults:
    ToolchainVerificationResult[];
}

export class ProjectEngineeringProfileAuthority {
  build(
    request:
      ProjectEngineeringProfileRequest,
  ):
    ProjectEngineeringProfile {
    const verifiedToolchains =
      request.toolchainResults.filter(
        (result) =>
          result.verified,
      );

    const unsupportedLanguages =
      request.toolchainResults
        .filter(
          (result) =>
            !result.verified,
        )
        .map(
          (result) =>
            result.language,
        );

    const uniqueUnsupported =
      [
        ...new Set(
          unsupportedLanguages,
        ),
      ];

    const buildReady =
      request.requiredOperations.includes(
        "build",
      )
        ? verifiedToolchains.length ===
          request.languages.length
        : true;

    const testReady =
      request.requiredOperations.includes(
        "test",
      )
        ? verifiedToolchains.length ===
          request.languages.length
        : true;

    const debugReady =
      request.requiredOperations.includes(
        "run",
      ) &&
      verifiedToolchains.length ===
        request.languages.length;

    return {
      id:
        request.id,
      projectPath:
        request.projectPath,
      languages:
        request.languages.map(
          (language) => ({
            ...language,
            extensions: [
              ...language.extensions,
            ],
          }),
        ),
      requiredOperations: [
        ...request.requiredOperations,
      ],
      verifiedToolchains:
        verifiedToolchains.map(
          (result) => ({
            ...result,
            availableExecutables: [
              ...result.availableExecutables,
            ],
            missingExecutables: [
              ...result.missingExecutables,
            ],
            missingCapabilities: [
              ...(result.missingCapabilities ?? []),
            ],
            unsupportedOperations: [
              ...result.unsupportedOperations,
            ],
          }),
        ),
      unsupportedLanguages:
        uniqueUnsupported,
      buildReady,
      testReady,
      debugReady,
    };
  }
}
