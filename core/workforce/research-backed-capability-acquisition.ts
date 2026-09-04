import type { ID } from "./types";
import type { ResourceSnapshot, ResourceAwareAcquisitionPlan } from "./resource-aware-capability-acquisition";
import { ResourceAwareCapabilityAcquisitionAuthority } from "./resource-aware-capability-acquisition";

export interface ResearchAcquisitionSource {
  sourceId: ID;
  evidenceId: ID;
  title: string;
  sourceUrl: string;
  sourceType: string;
  verified: boolean;
  provenance: string;
}

export interface ResearchAcquisitionFinding {
  findingId: ID;
  capabilityId: ID;
  language: string;
  operation: string;
  source: ResearchAcquisitionSource;
  strategy: "local-install" | "remote-provider" | "existing-runtime";
  estimatedDownloadBytes: number;
  estimatedInstalledBytes: number;
  estimatedCost: number;
  locallyExecutable: boolean;
  remotelyExecutable: boolean;
  requiresExternalProvider: boolean;
  verified: boolean;
}

export interface ResearchBackedCapabilityAcquisitionRequest {
  projectId: ID;
  capabilityId: ID;
  findings: ResearchAcquisitionFinding[];
  resources: ResourceSnapshot;
  budgetLimit: number;
  projectOwnerApprovedRemote: boolean;
}

export interface ResearchBackedCapabilityAcquisitionPlan {
  projectId: ID;
  capabilityId: ID;
  resourcePlan: ResourceAwareAcquisitionPlan;
  ready: boolean;
  provenance: string;
}

export class ResearchBackedCapabilityAcquisitionAuthority {
  private readonly resourceAuthority = new ResourceAwareCapabilityAcquisitionAuthority();

  createPlan(request: ResearchBackedCapabilityAcquisitionRequest): ResearchBackedCapabilityAcquisitionPlan {
    const finding = request.findings.find(
      (item) => item.capabilityId === request.capabilityId && item.verified && item.source.verified,
    );
    if (!finding) {
      throw new Error("K.I.N.G.S. Research-Backed Acquisition: a verified finding and source are required");
    }
    if (!finding.source.sourceUrl.startsWith("https://")) {
      throw new Error("K.I.N.G.S. Research-Backed Acquisition: verified sources must use HTTPS");
    }

    const resourcePlan = this.resourceAuthority.select({
      capabilityId: request.capabilityId,
      locallyExecutable: finding.locallyExecutable,
      remotelyExecutable: finding.remotelyExecutable,
      estimatedInstalledBytes: finding.estimatedInstalledBytes,
      estimatedCost: finding.estimatedCost,
      requiresExternalProvider: finding.requiresExternalProvider,
      resources: request.resources,
      budgetLimit: request.budgetLimit,
      projectOwnerApprovedRemote: request.projectOwnerApprovedRemote,
    });

    return {
      projectId: request.projectId,
      capabilityId: request.capabilityId,
      resourcePlan,
      ready: true,
      provenance: [
        `finding:${finding.findingId}`,
        `source:${finding.source.sourceId}`,
        finding.source.provenance,
      ].join(" | "),
    };
  }
}
