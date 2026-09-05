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
    const requestedLanguages =
      new Set(
        request.languages.map(
          (language) =>
            language.language,
        ),
      );

    const verifiedByLanguage =
      new Map<
        EngineeringLanguage,
        ToolchainVerificationResult
      >();

    for (
      const result of
        request.toolchainResults
    ) {
      if (
        !requestedLanguages.has(
          result.language,
        ) ||
        !result.verified ||
        verifiedByLanguage.has(
          result.language,
        )
      ) {
        continue;
      }

      verifiedByLanguage.set(
        result.language,
        result,
      );
    }

    const verifiedToolchains =
      [
        ...verifiedByLanguage.values(),
      ];

    const unsupportedLanguages =
      request.languages
        .map(
          (language) =>
            language.language,
        )
        .filter(
          (language) =>
            !verifiedByLanguage.has(
              language,
            ),
        );

    const allRequiredLanguagesVerified =
      unsupportedLanguages.length ===
      0;

    const buildReady =
      request.requiredOperations.includes(
        "build",
      )
        ? allRequiredLanguagesVerified
        : true;

    const testReady =
      request.requiredOperations.includes(
        "test",
      )
        ? allRequiredLanguagesVerified
        : true;

    const debugReady =
      request.requiredOperations.includes(
        "run",
      ) &&
      allRequiredLanguagesVerified;

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
      unsupportedLanguages: [
        ...unsupportedLanguages,
      ],
      buildReady,
      testReady,
      debugReady,
    };
  }
}
