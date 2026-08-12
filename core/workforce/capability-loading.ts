import type {
  ID,
} from "./types";

import type {
  AgentDefinition,
} from "./types";

import {
  CapabilityRegistry,
} from "./capability-registry";

import type {
  CapabilityManifest,
} from "./capability-registry";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

export interface CapabilityLoadingRequest {
  requiredCapabilityIds: ID[];
  agent?: AgentDefinition;
  workUnitContract?: WorkUnitContract;
}

export interface CapabilityLoadingRejection {
  capabilityId: ID;
  reasons: string[];
}

export interface CapabilityLoadingResult {
  requestedCapabilityIds: ID[];
  loadedCapabilityIds: ID[];
  capabilities: CapabilityManifest[];
  rejected: CapabilityLoadingRejection[];
  dependencyOrder: ID[];
}

export class CapabilityLoadingAuthority {
  constructor(
    private readonly registry:
      CapabilityRegistry,
  ) {}

  load(
    request:
      CapabilityLoadingRequest,
  ): CapabilityLoadingResult {
    this.validateRequest(
      request,
    );

    const loaded =
      new Map<ID, CapabilityManifest>();

    const rejected =
      new Map<
        ID,
        CapabilityLoadingRejection
      >();

    const visiting =
      new Set<ID>();

    const visit = (
      capabilityId: ID,
    ): boolean => {
      if (
        loaded.has(
          capabilityId,
        )
      ) {
        return true;
      }

      if (
        rejected.has(
          capabilityId,
        )
      ) {
        return false;
      }

      if (
        visiting.has(
          capabilityId,
        )
      ) {
        rejected.set(
          capabilityId,
          {
            capabilityId,
            reasons: [
              `Capability dependency cycle detected at "${capabilityId}".`,
            ],
          },
        );

        return false;
      }

      const capability =
        this.registry.get(
          capabilityId,
        );

      if (!capability) {
        rejected.set(
          capabilityId,
          {
            capabilityId,
            reasons: [
              `Capability "${capabilityId}" is not registered.`,
            ],
          },
        );

        return false;
      }

      if (!capability.enabled) {
        rejected.set(
          capabilityId,
          {
            capabilityId,
            reasons: [
              `Capability "${capabilityId}" is disabled.`,
            ],
          },
        );

        return false;
      }

      if (
        request.agent &&
        !request.agent.capabilities.includes(
          capabilityId,
        )
      ) {
        rejected.set(
          capabilityId,
          {
            capabilityId,
            reasons: [
              `Worker "${request.agent.id}" does not possess capability "${capabilityId}".`,
            ],
          },
        );

        return false;
      }

      if (
        request.workUnitContract &&
        !request.workUnitContract.capabilityIds.includes(
          capabilityId,
        )
      ) {
        rejected.set(
          capabilityId,
          {
            capabilityId,
            reasons: [
              `Work Unit Contract "${request.workUnitContract.id}" does not authorize capability "${capabilityId}".`,
            ],
          },
        );

        return false;
      }

      visiting.add(
        capabilityId,
      );

      const dependencies =
        [
          ...capability.dependencies,
        ].sort(
          (left, right) =>
            left.localeCompare(
              right,
            ),
        );

      for (
        const dependencyId of
        dependencies
      ) {
        if (
          !visit(
            dependencyId,
          )
        ) {
          visiting.delete(
            capabilityId,
          );

          rejected.set(
            capabilityId,
            {
              capabilityId,
              reasons: [
                `Required dependency "${dependencyId}" for capability "${capabilityId}" could not be loaded.`,
              ],
            },
          );

          return false;
        }
      }

      visiting.delete(
        capabilityId,
      );

      loaded.set(
        capabilityId,
        capability,
      );

      return true;
    };

    for (
      const capabilityId of
      request.requiredCapabilityIds
    ) {
      visit(
        capabilityId,
      );
    }

    const loadedCapabilities =
      [
        ...loaded.values(),
      ];

    const loadedCapabilityIds =
      loadedCapabilities.map(
        (capability) =>
          capability.id,
      );

    return {
      requestedCapabilityIds: [
        ...request.requiredCapabilityIds,
      ],
      loadedCapabilityIds,
      capabilities:
        loadedCapabilities,
      rejected: [
        ...rejected.values(),
      ].sort(
        (
          left,
          right,
        ) =>
          left.capabilityId.localeCompare(
            right.capabilityId,
          ),
      ),
      dependencyOrder:
        loadedCapabilityIds,
    };
  }

  private validateRequest(
    request:
      CapabilityLoadingRequest,
  ): void {
    if (
      request.requiredCapabilityIds.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Loading: at least one required capability is required.",
      );
    }

    const duplicateIds =
      request.requiredCapabilityIds.filter(
        (
          capabilityId,
          index,
        ) =>
          request.requiredCapabilityIds.indexOf(
            capabilityId,
          ) !== index,
      );

    if (
      duplicateIds.length >
      0
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Loading: duplicate capability ids are not allowed: ${[
          ...new Set(
            duplicateIds,
          ),
        ].join(", ")}`,
      );
    }
  }
}
