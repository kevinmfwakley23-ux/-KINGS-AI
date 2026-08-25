import type { ID } from "./types";
import type { ProjectEngineeringProfile } from "./project-engineering-profile";
import type { ToolchainVerificationResult } from "./toolchain-verification";
import { ProjectCapabilityAuditor, type ProjectCapabilityAudit } from "./project-capability-auditor";
import {
  CapabilityGapResolutionAuthority,
  type CapabilityGapResolutionPlan,
} from "./capability-gap-resolution";

export interface MissionCapabilityGateResult {
  projectId: ID;
  audit: ProjectCapabilityAudit;
  gapPlan: CapabilityGapResolutionPlan;
  ready: boolean;
  reason: string;
}

/**
 * Mission-facing engineering capability gate.
 *
 * It does not acquire capabilities or grant tool authority. It determines
 * whether a mission is ready to proceed and, when it is not, emits the
 * governed gap plan that can be routed into the research/acquisition path.
 */
export class MissionCapabilityGate {
  private readonly auditor = new ProjectCapabilityAuditor();
  private readonly gapResolution = new CapabilityGapResolutionAuthority();

  evaluate(
    projectId: ID,
    profile: ProjectEngineeringProfile,
    verifications: ToolchainVerificationResult[],
  ): MissionCapabilityGateResult {
    const audit = this.auditor.audit({
      projectId,
      profile,
      verifications,
    });

    const gapPlan = this.gapResolution.createPlan(audit);

    return {
      projectId,
      audit,
      gapPlan,
      ready: audit.ready && gapPlan.ready,
      reason: audit.ready
        ? "All required engineering capabilities are verified."
        : `Mission blocked by ${gapPlan.gaps.length} unverified engineering capability gap(s).`,
    };
  }
}
