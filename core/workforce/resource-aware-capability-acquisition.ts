import type { ID } from "./types";

export interface ResourceSnapshot {
  availableStorageBytes: number;
  availableMemoryBytes: number;
  maxLocalInstallBytes: number;
  localExecutionAvailable: boolean;
  remoteExecutionAvailable: boolean;
}

export interface ResourceAcquisitionOption {
  id: ID;
  strategy: "existing-runtime" | "local-install" | "remote-provider";
  location: string;
  estimatedCost: number;
  requiresExternalProvider: boolean;
}

export interface ResourceAwareAcquisitionPlan {
  selectedOption: ResourceAcquisitionOption;
  storageImpactBytes: number;
}

export interface ResourceAwareAcquisitionRequest {
  capabilityId: ID;
  locallyExecutable: boolean;
  remotelyExecutable: boolean;
  estimatedInstalledBytes: number;
  estimatedCost: number;
  requiresExternalProvider: boolean;
  resources: ResourceSnapshot;
  budgetLimit: number;
  projectOwnerApprovedRemote: boolean;
}

export class ResourceAwareCapabilityAcquisitionAuthority {
  select(request: ResourceAwareAcquisitionRequest): ResourceAwareAcquisitionPlan {
    if (request.estimatedCost > request.budgetLimit) {
      throw new Error("K.I.N.G.S. Resource-Aware Acquisition: estimated cost exceeds budget");
    }
    if (
      request.locallyExecutable &&
      request.resources.localExecutionAvailable &&
      request.estimatedInstalledBytes <= request.resources.availableStorageBytes &&
      request.estimatedInstalledBytes <= request.resources.maxLocalInstallBytes
    ) {
      return {
        selectedOption: {
          id: `${request.capabilityId}:local-install`,
          strategy: "local-install",
          location: "local",
          estimatedCost: request.estimatedCost,
          requiresExternalProvider: false,
        },
        storageImpactBytes: request.estimatedInstalledBytes,
      };
    }
    if (
      request.remotelyExecutable &&
      request.resources.remoteExecutionAvailable &&
      request.projectOwnerApprovedRemote
    ) {
      return {
        selectedOption: {
          id: `${request.capabilityId}:remote-provider`,
          strategy: "remote-provider",
          location: "remote",
          estimatedCost: request.estimatedCost,
          requiresExternalProvider: true,
        },
        storageImpactBytes: 0,
      };
    }
    throw new Error("K.I.N.G.S. Resource-Aware Acquisition: no approved executable option is available");
  }
}
