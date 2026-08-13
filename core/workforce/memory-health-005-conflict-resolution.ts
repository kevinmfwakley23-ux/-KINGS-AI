import {
  MemoryLifecycleClassifier,
  type MemoryLifecycleClassification,
} from "./memory-health-001-lifecycle";

export interface KnowledgeRecord {
  readonly id: string;
  readonly subject: string;
  readonly claim: string;
  readonly provenance: string[];
  readonly verificationEvidence: string[];
  readonly lifecycle: MemoryLifecycleClassification;
}

export interface ConflictCandidate {
  readonly existing: KnowledgeRecord;
  readonly incoming: KnowledgeRecord;
  readonly detected: boolean;
  readonly reason: string;
}

export interface ConflictResolution {
  readonly conflict: ConflictCandidate;
  readonly retained: KnowledgeRecord;
  readonly superseded: KnowledgeRecord;
  readonly resolutionEvidence: string[];
  readonly resolvedAt: string;
}

export class MemoryConflictResolutionAuthority {
  private readonly classifier =
    new MemoryLifecycleClassifier();

  detectConflict(
    existing: KnowledgeRecord,
    incoming: KnowledgeRecord,
  ): ConflictCandidate {
    if (existing.subject !== incoming.subject) {
      return {
        existing,
        incoming,
        detected: false,
        reason:
          "Knowledge records address different subjects.",
      };
    }

    const normalizedExisting =
      this.normalizeClaim(existing.claim);

    const normalizedIncoming =
      this.normalizeClaim(incoming.claim);

    if (normalizedExisting === normalizedIncoming) {
      return {
        existing,
        incoming,
        detected: false,
        reason:
          "Knowledge records express the same normalized claim.",
      };
    }

    return {
      existing,
      incoming,
      detected: true,
      reason:
        `Conflicting claims detected for subject "${existing.subject}".`,
    };
  }

  resolve(
    conflict: ConflictCandidate,
    resolutionEvidence: string[],
    resolvedAt: string,
  ): ConflictResolution {
    if (!conflict.detected) {
      throw new Error(
        "K.I.N.G.S. Memory Conflict Resolution: cannot resolve a non-conflict.",
      );
    }

    if (resolutionEvidence.length === 0) {
      throw new Error(
        "K.I.N.G.S. Memory Conflict Resolution: resolution evidence is required.",
      );
    }

    if (
      resolutionEvidence.some(
        (evidence) => !evidence.trim(),
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Conflict Resolution: resolution evidence cannot contain empty entries.",
      );
    }

    const existingAuthority =
      this.authorityRank(conflict.existing);

    const incomingAuthority =
      this.authorityRank(conflict.incoming);

    if (incomingAuthority < existingAuthority) {
      throw new Error(
        "K.I.N.G.S. Memory Conflict Resolution: lower-authority incoming knowledge cannot overturn higher-authority existing knowledge.",
      );
    }

    if (
      incomingAuthority === existingAuthority &&
      conflict.incoming.lifecycle.authority !==
        "authoritative"
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Conflict Resolution: equal non-authoritative claims require an explicit authoritative verification outcome.",
      );
    }

    const incomingWins =
      incomingAuthority >= existingAuthority;

    const retainedSource = incomingWins
      ? conflict.incoming
      : conflict.existing;

    const supersededSource = incomingWins
      ? conflict.existing
      : conflict.incoming;

    const supersessionLink =
      `superseded-by:${supersededSource.id}`;

    const retained: KnowledgeRecord = {
      ...retainedSource,

      lifecycle:
        this.classifier.classify({
          kind: "verified-knowledge",
          verified: true,
          superseded: false,
        }),

      provenance: [
        ...new Set([
          ...retainedSource.provenance,
          supersessionLink,
          `conflict-resolution:${supersededSource.id}`,
          "conflict-resolution:verified",
        ]),
      ],

      verificationEvidence: [
        ...new Set([
          ...retainedSource.verificationEvidence,
          ...resolutionEvidence,
        ]),
      ],
    };

    const superseded: KnowledgeRecord = {
      ...supersededSource,

      lifecycle:
        this.classifier.classify({
          kind: "superseded-knowledge",
          verified:
            supersededSource.lifecycle.authority !==
            "candidate",
          superseded: true,
        }),

      provenance: [
        ...new Set([
          ...supersededSource.provenance,
          `superseded-by:${retained.id}`,
          "conflict-resolution:verified",
        ]),
      ],
    };

    return {
      conflict,
      retained,
      superseded,
      resolutionEvidence: [
        ...resolutionEvidence,
      ],
      resolvedAt,
    };
  }

  private authorityRank(
    record: KnowledgeRecord,
  ): number {
    if (
      record.lifecycle.authority ===
      "authoritative"
    ) {
      return 3;
    }

    if (
      record.lifecycle.authority ===
      "verified"
    ) {
      return 2;
    }

    return 1;
  }

  private normalizeClaim(
    claim: string,
  ): string {
    return claim
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.!?]+$/, "");
  }
}
