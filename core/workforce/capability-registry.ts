import type {
  ID,
} from "./types";

export type CapabilityRisk =
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface CapabilityManifest {
  id: ID;
  name: string;
  description: string;

  /**
   * Capabilities required before this capability may be used.
   */
  dependencies: ID[];

  /**
   * Tools explicitly permitted to this capability.
   */
  allowedToolIds: ID[];

  /**
   * Repository or resource paths this capability may operate on.
   */
  allowedPaths: string[];

  /**
   * Risk classification used by deterministic policy.
   */
  risk: CapabilityRisk;

  /**
   * Evidence required to verify successful use.
   */
  verificationRequirements: string[];

  enabled: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface CapabilityDiscoveryQuery {
  requiredCapability?: ID;
  requiredToolId?: ID;
  risk?: CapabilityRisk;
  enabledOnly?: boolean;
}

export class CapabilityRegistry {
  private readonly capabilities =
    new Map<ID, CapabilityManifest>();

  register(
    capability: CapabilityManifest,
  ): void {
    if (
      this.capabilities.has(
        capability.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Capability Registry: duplicate capability id "${capability.id}"`,
      );
    }

    this.capabilities.set(
      capability.id,
      capability,
    );
  }

  get(
    capabilityId: ID,
  ): CapabilityManifest | undefined {
    return this.capabilities.get(
      capabilityId,
    );
  }

  list(): CapabilityManifest[] {
    return [
      ...this.capabilities.values(),
    ];
  }

  discover(
    query: CapabilityDiscoveryQuery = {},
  ): CapabilityManifest[] {
    return this.list().filter(
      (capability) => {
        if (
          query.enabledOnly &&
          !capability.enabled
        ) {
          return false;
        }

        if (
          query.requiredCapability &&
          capability.id !==
            query.requiredCapability
        ) {
          return false;
        }

        if (
          query.requiredToolId &&
          !capability.allowedToolIds.includes(
            query.requiredToolId,
          )
        ) {
          return false;
        }

        if (
          query.risk &&
          capability.risk !== query.risk
        ) {
          return false;
        }

        return true;
      },
    );
  }

  validateDependencies(
    capabilityId: ID,
  ): string[] {
    const missing: string[] = [];
    const visited = new Set<ID>();

    const visit = (
      currentId: ID,
    ): void => {
      if (
        visited.has(currentId)
      ) {
        return;
      }

      visited.add(currentId);

      const capability =
        this.get(currentId);

      if (!capability) {
        missing.push(
          currentId,
        );
        return;
      }

      for (
        const dependencyId of
        capability.dependencies
      ) {
        visit(dependencyId);
      }
    };

    visit(capabilityId);

    return missing;
  }

  clear(): void {
    this.capabilities.clear();
  }
}
