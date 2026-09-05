import type { KnowledgeSource, MemoryReference } from "./types";

export interface MemorySourceAttestation {
  readonly sourceId: string;
  readonly capturedVersion?: string;
  readonly capturedContentHash?: string;
  readonly capturedUpdatedAt: string;
  readonly capturedAt: string;
}

export type MemorySourceFreshnessStatus = "current" | "stale" | "missing" | "unverified";

export interface MemorySourceFreshnessFinding {
  readonly sourceId: string;
  readonly status: Exclude<MemorySourceFreshnessStatus, "unverified">;
  readonly reason: string;
  readonly expectedVersion?: string;
  readonly currentVersion?: string;
  readonly expectedContentHash?: string;
  readonly currentContentHash?: string;
}

export interface MemorySourceFreshnessReport {
  readonly memoryId: string;
  readonly status: MemorySourceFreshnessStatus;
  readonly findings: readonly MemorySourceFreshnessFinding[];
  readonly untrackedReferenceIds: readonly string[];
}

export type AttestedMemoryReference = MemoryReference & {
  readonly sourceAttestations?: readonly MemorySourceAttestation[];
};

export interface KnowledgeSourceLookup {
  getSource(sourceId: string): KnowledgeSource | undefined;
}

/**
 * Captures source fingerprints when memory is recorded and revalidates them
 * against the current KnowledgeRegistry before authoritative memory is reused.
 * References that are not KnowledgeSource ids remain valid provenance, but are
 * reported as untracked rather than being falsely described as revalidated.
 */
export class MemorySourceFreshnessAuthority {
  constructor(private readonly sources: KnowledgeSourceLookup) {}

  attest(memory: MemoryReference, capturedAt = memory.updatedAt): AttestedMemoryReference {
    const sourceAttestations = memory.sourceReferences
      .map((sourceId) => this.sources.getSource(sourceId))
      .filter((source): source is KnowledgeSource => Boolean(source))
      .map((source) => Object.freeze({
        sourceId: source.id,
        ...(source.version ? { capturedVersion: source.version } : {}),
        ...(source.contentHash ? { capturedContentHash: source.contentHash } : {}),
        capturedUpdatedAt: source.updatedAt,
        capturedAt,
      }));

    return {
      ...memory,
      sourceReferences: [...memory.sourceReferences],
      ...(sourceAttestations.length > 0
        ? { sourceAttestations: Object.freeze(sourceAttestations) }
        : {}),
    };
  }

  evaluate(memory: MemoryReference): MemorySourceFreshnessReport {
    const attested = memory as AttestedMemoryReference;
    const attestations = attested.sourceAttestations ?? [];
    const trackedIds = new Set(attestations.map((item) => item.sourceId));
    const untrackedReferenceIds = memory.sourceReferences.filter((reference) => !trackedIds.has(reference));

    if (attestations.length === 0) {
      return Object.freeze({
        memoryId: memory.id,
        status: "unverified",
        findings: Object.freeze([]),
        untrackedReferenceIds: Object.freeze([...untrackedReferenceIds]),
      });
    }

    const findings = attestations.map((attestation): MemorySourceFreshnessFinding => {
      const current = this.sources.getSource(attestation.sourceId);
      if (!current) {
        return Object.freeze({
          sourceId: attestation.sourceId,
          status: "missing",
          reason: "The attested knowledge source is no longer registered.",
          ...(attestation.capturedVersion ? { expectedVersion: attestation.capturedVersion } : {}),
          ...(attestation.capturedContentHash ? { expectedContentHash: attestation.capturedContentHash } : {}),
        });
      }

      const versionChanged = attestation.capturedVersion !== undefined
        && current.version !== attestation.capturedVersion;
      const hashChanged = attestation.capturedContentHash !== undefined
        && current.contentHash !== attestation.capturedContentHash;
      const metadataChanged = attestation.capturedVersion === undefined
        && attestation.capturedContentHash === undefined
        && current.updatedAt !== attestation.capturedUpdatedAt;

      if (versionChanged || hashChanged || metadataChanged) {
        return Object.freeze({
          sourceId: attestation.sourceId,
          status: "stale",
          reason: versionChanged
            ? "Knowledge source version changed after this memory was recorded."
            : hashChanged
              ? "Knowledge source content hash changed after this memory was recorded."
              : "Knowledge source update timestamp changed after this memory was recorded.",
          ...(attestation.capturedVersion ? { expectedVersion: attestation.capturedVersion } : {}),
          ...(current.version ? { currentVersion: current.version } : {}),
          ...(attestation.capturedContentHash ? { expectedContentHash: attestation.capturedContentHash } : {}),
          ...(current.contentHash ? { currentContentHash: current.contentHash } : {}),
        });
      }

      return Object.freeze({
        sourceId: attestation.sourceId,
        status: "current",
        reason: "Knowledge source still matches the captured memory fingerprint.",
        ...(attestation.capturedVersion ? { expectedVersion: attestation.capturedVersion } : {}),
        ...(current.version ? { currentVersion: current.version } : {}),
        ...(attestation.capturedContentHash ? { expectedContentHash: attestation.capturedContentHash } : {}),
        ...(current.contentHash ? { currentContentHash: current.contentHash } : {}),
      });
    });

    const status: MemorySourceFreshnessStatus = findings.some((item) => item.status === "missing")
      ? "missing"
      : findings.some((item) => item.status === "stale")
        ? "stale"
        : "current";

    return Object.freeze({
      memoryId: memory.id,
      status,
      findings: Object.freeze(findings),
      untrackedReferenceIds: Object.freeze([...untrackedReferenceIds]),
    });
  }

  isReusable(memory: MemoryReference): boolean {
    if (!memory.authoritative) return true;
    const status = this.evaluate(memory).status;
    return status === "current" || status === "unverified";
  }
}
