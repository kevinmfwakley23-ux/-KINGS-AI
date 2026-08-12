import type {
  ID,
} from "./types";

import type {
  EngineeringLanguage,
  ToolchainOperation,
} from "./engineering-toolchain";

import type {
  ProjectEngineeringProfile,
  ProjectLanguageEvidence,
} from "./project-engineering-profile";

import type {
  ToolchainVerificationResult,
} from "./toolchain-verification";

export interface ProjectCapabilityAudit {
  id:
    ID;
  projectId:
    ID;
  requiredLanguages:
    EngineeringLanguage[];
  requiredOperations:
    ToolchainOperation[];
  verifiedLanguages:
    EngineeringLanguage[];
  missingLanguages:
    EngineeringLanguage[];
  verifiedOperations:
    ToolchainOperation[];
  missingOperations:
    ToolchainOperation[];
  ready:
    boolean;
}

export interface ProjectCapabilityAuditRequest {
  projectId:
    ID;
  profile:
    ProjectEngineeringProfile;
  verifications:
    ToolchainVerificationResult[];
}

export class ProjectCapabilityAuditor {
  audit(
    request:
      ProjectCapabilityAuditRequest,
  ):
    ProjectCapabilityAudit {
    const requiredLanguages =
      [
        ...new Set(
          request.profile.languages.map(
            (languageEvidence) =>
              languageEvidence.language,
          ),
        ),
      ];

    const requiredOperations =
      [
        ...new Set(
          request.profile.requiredOperations,
        ),
      ];

    const verifiedLanguages =
      requiredLanguages.filter(
        (language) =>
          request.verifications.some(
            (verification) =>
              verification.language ===
                language &&
              verification.verified,
          ),
      );

    const missingLanguages =
      requiredLanguages.filter(
        (language) =>
          !verifiedLanguages.includes(
            language,
          ),
      );

    const verifiedOperations =
      requiredOperations.filter(
        (operation) =>
          requiredLanguages.every(
            (language) =>
              request.verifications.some(
                (verification) =>
                  verification.language ===
                    language &&
                  verification.verified &&
                  !verification.unsupportedOperations.includes(
                    operation,
                  ),
              ),
          ),
      );

    const missingOperations =
      requiredOperations.filter(
        (operation) =>
          !verifiedOperations.includes(
            operation,
          ),
      );

    return {
      id:
        `capability-audit-${request.projectId}`,
      projectId:
        request.projectId,
      requiredLanguages,
      requiredOperations,
      verifiedLanguages,
      missingLanguages,
      verifiedOperations,
      missingOperations,
      ready:
        missingLanguages.length ===
          0 &&
        missingOperations.length ===
          0,
    };
  }
}
