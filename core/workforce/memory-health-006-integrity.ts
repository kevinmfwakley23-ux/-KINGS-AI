import {
  MemoryLifecycleClassifier,
  type MemoryLifecycleClassification,
} from "./memory-health-001-lifecycle";

export interface DurableMemoryEnvelope {
  readonly id: string;
  readonly content: string;
  readonly lifecycle: MemoryLifecycleClassification;
  readonly provenance: string[];
  readonly checksum: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MemoryIntegrityReport {
  readonly memoryId: string;
  readonly valid: boolean;
  readonly reasons: string[];
  readonly checksumExpected: string;
  readonly checksumActual: string;
}

export interface QuarantinedMemory {
  readonly memory: DurableMemoryEnvelope;
  readonly report: MemoryIntegrityReport;
  readonly quarantinedAt: string;
}

export interface RecoveryResult {
  readonly memory: DurableMemoryEnvelope;
  readonly recovered: boolean;
  readonly verificationRequired: boolean;
  readonly evidence: string[];
}

export class MemoryIntegrityAuthority {
  private readonly classifier =
    new MemoryLifecycleClassifier();

  inspect(
    memory: DurableMemoryEnvelope,
  ): MemoryIntegrityReport {
    const reasons: string[] = [];

    if (!memory.id.trim()) {
      reasons.push(
        "Memory id is missing.",
      );
    }

    if (!memory.content.trim()) {
      reasons.push(
        "Memory content is missing.",
      );
    }

    if (
      memory.provenance.length ===
      0
    ) {
      reasons.push(
        "Memory provenance is missing.",
      );
    }

    if (!memory.createdAt.trim()) {
      reasons.push(
        "Memory creation timestamp is missing.",
      );
    }

    if (!memory.updatedAt.trim()) {
      reasons.push(
        "Memory update timestamp is missing.",
      );
    }

    const checksumActual =
      this.computeChecksum(memory);

    if (
      checksumActual !==
      memory.checksum
    ) {
      reasons.push(
        "Memory checksum does not match its durable contents.",
      );
    }

    return {
      memoryId:
        memory.id,

      valid:
        reasons.length === 0,

      reasons,

      checksumExpected:
        memory.checksum,

      checksumActual,
    };
  }

  quarantine(
    memory: DurableMemoryEnvelope,
    inspectedAt: string,
  ): QuarantinedMemory {
    const report =
      this.inspect(memory);

    if (report.valid) {
      throw new Error(
        "K.I.N.G.S. Memory Integrity: valid memory cannot be quarantined.",
      );
    }

    return {
      memory,

      report,

      quarantinedAt:
        inspectedAt,
    };
  }

  recover(
    quarantined: QuarantinedMemory,
    recoveredContent: string,
    verificationEvidence: string[],
    recoveredAt: string,
  ): RecoveryResult {
    if (
      verificationEvidence.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Recovery: verification evidence is required.",
      );
    }

    if (
      verificationEvidence.some(
        (evidence) =>
          !evidence.trim(),
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Recovery: verification evidence cannot contain empty entries.",
      );
    }

    if (
      !recoveredContent.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Recovery: recovered content is required.",
      );
    }

    const original =
      quarantined.memory;

    const recoveredLifecycle =
      this.classifier.classify({
        kind:
          "verified-knowledge",

        verified:
          true,

        superseded:
          false,
      });

    const recoveredProvenance = [
      ...new Set([
        ...original.provenance,

        `quarantine:${original.id}`,

        "recovery:verified",

        ...verificationEvidence,
      ]),
    ];

    /*
     * Construct the complete final state first.
     * The checksum MUST cover the exact state that
     * will be persisted, including the new timestamp.
     */
    const recoveredWithoutChecksum: Omit<
      DurableMemoryEnvelope,
      "checksum"
    > = {
      ...original,

      content:
        recoveredContent,

      lifecycle:
        recoveredLifecycle,

      provenance:
        recoveredProvenance,

      updatedAt:
        recoveredAt,
    };

    const recovered:
      DurableMemoryEnvelope = {
      ...recoveredWithoutChecksum,

      checksum:
        this.computeChecksum(
          recoveredWithoutChecksum,
        ),
    };

    return {
      memory:
        recovered,

      recovered:
        true,

      verificationRequired:
        false,

      evidence:
        [
          ...verificationEvidence,
        ],
    };
  }

  createEnvelope(
    input: Omit<
      DurableMemoryEnvelope,
      "checksum"
    >,
  ): DurableMemoryEnvelope {
    return {
      ...input,

      checksum:
        this.computeChecksum(
          input,
        ),
    };
  }

  private computeChecksum(
    memory:
      Omit<
        DurableMemoryEnvelope,
        "checksum"
      > |
      DurableMemoryEnvelope,
  ):
    string {
    const canonical =
      JSON.stringify({
        id:
          memory.id,

        content:
          memory.content,

        lifecycle:
          memory.lifecycle,

        provenance:
          memory.provenance,

        createdAt:
          memory.createdAt,

        updatedAt:
          memory.updatedAt,
      });

    let hash =
      2166136261;

    for (
      let index = 0;
      index <
        canonical.length;
      index += 1
    ) {
      hash ^=
        canonical.charCodeAt(
          index,
        );

      hash =
        Math.imul(
          hash,
          16777619,
        );
    }

    return (
      hash >>> 0
    ).toString(16);
  }
}
