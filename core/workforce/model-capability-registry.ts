import type {
  ID,
} from "./types";

import type {
  IntelligenceCapability,
  ModelIdentity,
} from "./model-interface";

export type ModelCapabilityVerificationStatus =
  | "unverified"
  | "verified"
  | "degraded"
  | "failed";

export interface ModelCapabilityProfile {
  capability:
    IntelligenceCapability;
  strength:
    number;
  status:
    ModelCapabilityVerificationStatus;
  evidenceReferences:
    string[];
  verifiedAt?:
    string;
}

export interface ModelCapabilityRegistration {
  model:
    ModelIdentity;
  capabilities:
    ModelCapabilityProfile[];
}

export interface ModelCapabilityQuery {
  requiredCapabilities?:
    IntelligenceCapability[];
  minimumStrength?:
    number;
  verifiedOnly?:
    boolean;
  availableOnly?:
    boolean;
}

export interface ModelCapabilityMatch {
  model:
    ModelIdentity;
  capabilities:
    ModelCapabilityProfile[];
  weakestRequiredStrength:
    number;
}

export class ModelCapabilityRegistry {
  private readonly models =
    new Map<
      ID,
      ModelCapabilityRegistration
    >();

  register(
    registration:
      ModelCapabilityRegistration,
  ): void {
    const modelId =
      registration.model.modelId;

    if (
      this.models.has(
        modelId,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Model Capability Registry: duplicate model id "${modelId}"`,
      );
    }

    this.validateRegistration(
      registration,
    );

    this.models.set(
      modelId,
      {
        model:
          registration.model,
        capabilities:
          [
            ...registration.capabilities,
          ].sort(
            (
              left,
              right,
            ) =>
              left.capability.localeCompare(
                right.capability,
              ),
          ),
      },
    );
  }

  get(
    modelId: ID,
  ):
    ModelCapabilityRegistration
    | undefined {
    return this.models.get(
      modelId,
    );
  }

  list():
    ModelCapabilityRegistration[] {
    return Array.from(
      this.models.values(),
    ).sort(
      (
        left,
        right,
      ) =>
        left.model.modelId.localeCompare(
          right.model.modelId,
        ),
    );
  }

  discover(
    query:
      ModelCapabilityQuery = {},
  ): ModelCapabilityMatch[] {
    const minimumStrength =
      query.minimumStrength ??
      0;

    if (
      minimumStrength < 0 ||
      minimumStrength > 100
    ) {
      throw new Error(
        "K.I.N.G.S. Model Capability Registry: minimum strength must be between 0 and 100",
      );
    }

    return this.list()
      .filter(
        (registration) => {
          if (
            query.availableOnly &&
            !registration.model.available
          ) {
            return false;
          }

          const required =
            query.requiredCapabilities ??
            [];

          if (
            required.length === 0
          ) {
            return true;
          }

          return required.every(
            (
              capability,
            ) => {
              const profile =
                registration.capabilities.find(
                  (
                    item,
                  ) =>
                    item.capability ===
                    capability,
                );

              if (!profile) {
                return false;
              }

              if (
                query.verifiedOnly &&
                profile.status !==
                  "verified"
              ) {
                return false;
              }

              return (
                profile.strength >=
                minimumStrength
              );
            },
          );
        },
      )
      .map(
        (
          registration,
        ) => {
          const required =
            query.requiredCapabilities ??
            [];

          const selectedProfiles =
            required.length === 0
              ? registration.capabilities
              : registration.capabilities.filter(
                  (
                    profile,
                  ) =>
                    required.includes(
                      profile.capability,
                    ),
                );

          const weakestRequiredStrength =
            selectedProfiles.length ===
              0
              ? 0
              : Math.min(
                  ...selectedProfiles.map(
                    (
                      profile,
                    ) =>
                      profile.strength,
                  ),
                );

          return {
            model:
              registration.model,
            capabilities:
              selectedProfiles,
            weakestRequiredStrength,
          };
        },
      )
      .sort(
        (
          left,
          right,
        ) => {
          if (
            left.weakestRequiredStrength !==
            right.weakestRequiredStrength
          ) {
            return (
              right.weakestRequiredStrength -
              left.weakestRequiredStrength
            );
          }

          return left.model.modelId.localeCompare(
            right.model.modelId,
          );
        },
      );
  }

  recordVerification(
    modelId: ID,
    capability:
      IntelligenceCapability,
    status:
      ModelCapabilityVerificationStatus,
    strength:
      number,
    evidenceReferences:
      string[],
    verifiedAt:
      string,
  ): void {
    const registration =
      this.models.get(
        modelId,
      );

    if (!registration) {
      throw new Error(
        `K.I.N.G.S. Model Capability Registry: model "${modelId}" is not registered`,
      );
    }

    this.validateStrength(
      strength,
    );

    if (
      evidenceReferences.length ===
      0 &&
      status ===
        "verified"
    ) {
      throw new Error(
        "K.I.N.G.S. Model Capability Registry: verified capability requires evidence",
      );
    }

    const existing =
      registration.capabilities.find(
        (
          item,
        ) =>
          item.capability ===
          capability,
      );

    if (existing) {
      existing.status =
        status;
      existing.strength =
        strength;
      existing.evidenceReferences =
        [
          ...evidenceReferences,
        ];
      existing.verifiedAt =
        verifiedAt;
      return;
    }

    registration.capabilities.push({
      capability,
      strength,
      status,
      evidenceReferences:
        [
          ...evidenceReferences,
        ],
      verifiedAt,
    });

    registration.capabilities.sort(
      (
        left,
        right,
      ) =>
        left.capability.localeCompare(
          right.capability,
        ),
    );
  }

  private validateRegistration(
    registration:
      ModelCapabilityRegistration,
  ): void {
    const seen =
      new Set<IntelligenceCapability>();

    for (
      const profile of
        registration.capabilities
    ) {
      if (
        seen.has(
          profile.capability,
        )
      ) {
        throw new Error(
          `K.I.N.G.S. Model Capability Registry: duplicate capability "${profile.capability}" for model "${registration.model.modelId}"`,
        );
      }

      seen.add(
        profile.capability,
      );

      this.validateStrength(
        profile.strength,
      );

      if (
        profile.status ===
          "verified" &&
        profile.evidenceReferences.length ===
          0
      ) {
        throw new Error(
          `K.I.N.G.S. Model Capability Registry: verified capability "${profile.capability}" requires evidence`,
        );
      }
    }
  }

  private validateStrength(
    strength:
      number,
  ): void {
    if (
      !Number.isFinite(
        strength,
      ) ||
      strength < 0 ||
      strength > 100
    ) {
      throw new Error(
        "K.I.N.G.S. Model Capability Registry: capability strength must be between 0 and 100",
      );
    }
  }
}
