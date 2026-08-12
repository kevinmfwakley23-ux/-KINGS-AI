import type {
  ID,
} from "./types";

import type {
  ProjectCapabilityAudit,
  ProjectCapabilityAuditRequest,
} from "./project-capability-auditor";

import type {
  CapabilityGapResolutionPlan,
} from "./capability-gap-resolution";

import type {
  CapabilityVerificationBridgeResult,
} from "./capability-acquisition-verification";

export interface CapabilityClosureRecord {
  id:
    ID;
  projectId:
    ID;
  gapId:
    ID;
  verificationId:
    ID;
  closed:
    boolean;
  closedAt?:
    string;
}

export interface CapabilityClosureResult {
  audit:
    ProjectCapabilityAudit;
  closure:
    CapabilityClosureRecord;
  ready:
    boolean;
}

export class CapabilityClosureBridge {
  close(
    request:
      ProjectCapabilityAuditRequest,
    plan:
      CapabilityGapResolutionPlan,
    verification:
      CapabilityVerificationBridgeResult,
    audit:
      ProjectCapabilityAudit,
    closedAt:
      string,
  ):
    CapabilityClosureResult {
    if (
      request.projectId !==
      verification.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Closure: project identity does not match verification",
      );
    }

    if (
      plan.projectId !==
      request.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Closure: capability plan belongs to another project",
      );
    }

    if (
      !verification.verified
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Closure: verification "${verification.id}" is not verified`,
      );
    }

    const gap =
      plan.gaps.find(
        (candidate) =>
          candidate.id ===
          verification.gapId,
      );

    if (!gap) {
      throw new Error(
        `K.I.N.G.S. Capability Closure: gap "${verification.gapId}" was not found`,
      );
    }

    if (
      !gap.verified
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Closure: gap "${gap.id}" is not verified in the durable capability plan`,
      );
    }

    if (
      audit.projectId !==
      request.projectId
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Closure: audit belongs to another project",
      );
    }

    if (
      !audit.ready
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Closure: project remains unready after capability verification",
      );
    }

    const closure:
      CapabilityClosureRecord =
      {
        id:
          `capability-closure-${gap.id}`,
        projectId:
          request.projectId,
        gapId:
          gap.id,
        verificationId:
          verification.id,
        closed:
          true,
        closedAt,
      };

    return {
      audit,
      closure,
      ready:
        true,
    };
  }
}
