import {
  MemoryLifecycleClassifier,
  type MemoryLifecycleClassification,
} from "./memory-health-001-lifecycle";

export interface EpisodicObservation {
  readonly id:
    string;

  readonly content:
    string;

  readonly subject:
    string;

  readonly observedAt:
    string;

  readonly provenance:
    string[];
}

export interface KnowledgeCandidate {
  readonly id:
    string;

  readonly subject:
    string;

  readonly claim:
    string;

  readonly sourceObservationIds:
    string[];

  readonly provenance:
    string[];

  readonly verified:
    boolean;

  readonly lifecycle:
    MemoryLifecycleClassification;
}

export interface VerifiedKnowledge {
  readonly id:
    string;

  readonly subject:
    string;

  readonly claim:
    string;

  readonly sourceObservationIds:
    string[];

  readonly provenance:
    string[];

  readonly verificationEvidence:
    string[];

  readonly lifecycle:
    MemoryLifecycleClassification;
}

export interface ConsolidationResult {
  readonly candidate:
    KnowledgeCandidate;

  readonly observationCount:
    number;
}

export class MemoryConsolidationAuthority {
  private readonly classifier =
    new MemoryLifecycleClassifier();

  consolidate(
    observations:
      EpisodicObservation[],
  ):
    ConsolidationResult {
    if (
      observations.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Consolidation: at least one observation is required.",
      );
    }

    const subject =
      observations[0].subject.trim();

    if (
      !subject
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Consolidation: observation subject is required.",
      );
    }

    if (
      observations.some(
        (
          observation,
        ) =>
          observation.subject.trim() !==
          subject,
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Consolidation: observations must share the same subject.",
      );
    }

    const observationIds =
      observations.map(
        (
          observation,
        ) =>
          observation.id,
      );

    const provenance =
      [
        ...new Set(
          observations.flatMap(
            (
              observation,
            ) => [
              ...observation.provenance,

              `observation:${observation.id}`,
            ],
          ),
        ),
      ];

    const claim =
      this.buildClaim(
        observations,
      );

    const candidate:
      KnowledgeCandidate = {
      id:
        `KNOWLEDGE-CANDIDATE-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,

      subject,

      claim,

      sourceObservationIds:
        [
          ...observationIds,
        ],

      provenance,

      verified:
        false,

      lifecycle:
        this.classifier.classify({
          kind:
            "fact",

          verified:
            false,

          superseded:
            false,
        }),
    };

    return {
      candidate,

      observationCount:
        observations.length,
    };
  }

  verify(
    candidate:
      KnowledgeCandidate,

    verificationEvidence:
      string[],
  ):
    VerifiedKnowledge {
    if (
      verificationEvidence.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Consolidation: verification evidence is required.",
      );
    }

    if (
      verificationEvidence.some(
        (
          evidence,
        ) =>
          !evidence.trim(),
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Consolidation: verification evidence cannot contain empty entries.",
      );
    }

    if (
      candidate.verified
    ) {
      throw new Error(
        "K.I.N.G.S. Memory Consolidation: candidate is already verified.",
      );
    }

    const lifecycle =
      this.classifier.classify({
        kind:
          "verified-knowledge",

        verified:
          true,

        superseded:
          false,
      });

    return {
      id:
        `VERIFIED-${candidate.id}`,

      subject:
        candidate.subject,

      claim:
        candidate.claim,

      sourceObservationIds:
        [
          ...candidate.sourceObservationIds,
        ],

      provenance:
        [
          ...candidate.provenance,

          `candidate:${candidate.id}`,

          "promotion:verified-knowledge",
        ],

      verificationEvidence:
        [
          ...verificationEvidence,
        ],

      lifecycle,
    };
  }

  private buildClaim(
    observations:
      EpisodicObservation[],
  ):
    string {
    const normalized =
      observations.map(
        (
          observation,
        ) =>
          observation.content.trim(),
      );

    const first =
      normalized[0];

    if (
      normalized.every(
        (
          content,
        ) =>
          content ===
          first,
      )
    ) {
      return first;
    }

    return [
      `Consolidated observation pattern for ${observations[0].subject}:`,

      ...normalized.map(
        (
          content,
          index,
        ) =>
          `[${index + 1}] ${content}`,
      ),
    ].join(
      " ",
    );
  }
}
