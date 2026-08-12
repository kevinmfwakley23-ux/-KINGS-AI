import type {
  ID,
} from "./types";

import type {
  ProjectCapabilityAudit,
} from "./project-capability-auditor";

import type {
  CapabilityClosureResult,
} from "./capability-closure-bridge";

export interface EngineeringReadinessRecord {
  id:
    ID;
  projectId:
    ID;
  auditId:
    ID;
  closureId:
    ID;
  ready:
    boolean;
  verifiedAt:
    string;
}

export interface EngineeringReadinessResult {
  readiness:
    EngineeringReadinessRecord;
  audit:
    ProjectCapabilityAudit;
}

export class EngineeringReadinessAuthority {
  establish(
    audit:
      ProjectCapabilityAudit,
    closure:
      CapabilityClosureResult,
    verifiedAt:
      string,
  ):
    EngineeringReadinessResult {
    if (
      audit.projectId !==
      closure.closure.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Readiness: audit and capability closure belong to different projects",
      );
    }

    if (
      audit.id !==
      closure.audit.id
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Readiness: readiness audit does not match the closure audit",
      );
    }

    if (
      !closure.closure.closed
    ) {
      throw new Error(
        `K.I.N.G.S. Engineering Readiness: capability closure "${closure.closure.id}" is not closed`,
      );
    }

    if (
      !audit.ready ||
      !closure.ready
    ) {
      throw new Error(
        "K.I.N.G.S. Engineering Readiness: project capability audit is not ready",
      );
    }

    return {
      readiness: {
        id:
          `engineering-readiness-${audit.projectId}`,
        projectId:
          audit.projectId,
        auditId:
          audit.id,
        closureId:
          closure.closure.id,
        ready:
          true,
        verifiedAt,
      },
      audit,
    };
  }
}
