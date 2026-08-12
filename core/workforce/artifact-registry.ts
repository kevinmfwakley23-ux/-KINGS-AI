import type {
  Artifact,
  ID,
} from "./types";

export interface ArtifactPromotionDecision {
  artifactId: ID;
  promoted: boolean;
  reasons: string[];
}

export class ArtifactRegistry {
  private readonly artifacts =
    new Map<ID, Artifact>();

  register(
    artifact: Artifact,
  ): void {
    if (!artifact.id.trim()) {
      throw new Error(
        "K.I.N.G.S. Artifact Registry: artifact id is required",
      );
    }

    if (!artifact.name.trim()) {
      throw new Error(
        `K.I.N.G.S. Artifact Registry: artifact "${artifact.id}" requires a name`,
      );
    }

    if (!artifact.description.trim()) {
      throw new Error(
        `K.I.N.G.S. Artifact Registry: artifact "${artifact.id}" requires a description`,
      );
    }

    if (this.artifacts.has(artifact.id)) {
      throw new Error(
        `K.I.N.G.S. Artifact Registry: duplicate artifact id "${artifact.id}"`,
      );
    }

    this.artifacts.set(
      artifact.id,
      { ...artifact },
    );
  }

  get(
    artifactId: ID,
  ): Artifact | undefined {
    const artifact =
      this.artifacts.get(
        artifactId,
      );

    return artifact
      ? { ...artifact }
      : undefined;
  }

  list(): Artifact[] {
    return [
      ...this.artifacts.values(),
    ].map(
      (artifact) => ({
        ...artifact,
      }),
    );
  }

  has(
    artifactId: ID,
  ): boolean {
    return this.artifacts.has(
      artifactId,
    );
  }

  promote(
    artifactId: ID,
    verificationReferences: string[],
  ): ArtifactPromotionDecision {
    const artifact =
      this.artifacts.get(
        artifactId,
      );

    if (!artifact) {
      return {
        artifactId,
        promoted: false,
        reasons: [
          `Artifact "${artifactId}" was not found.`,
        ],
      };
    }

    if (
      verificationReferences.length ===
      0
    ) {
      return {
        artifactId,
        promoted: false,
        reasons: [
          "Artifact promotion requires verification references.",
        ],
      };
    }

    if (
      verificationReferences.some(
        (reference) =>
          !reference.trim(),
      )
    ) {
      return {
        artifactId,
        promoted: false,
        reasons: [
          "Artifact promotion requires non-empty verification references.",
        ],
      };
    }

    return {
      artifactId,
      promoted: true,
      reasons: [],
    };
  }

  clear(): void {
    this.artifacts.clear();
  }
}
