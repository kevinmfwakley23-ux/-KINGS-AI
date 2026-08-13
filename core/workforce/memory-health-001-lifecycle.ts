export type MemoryLifecycleClass =
  | "working"
  | "episodic"
  | "semantic"
  | "procedural"
  | "mission"
  | "project"
  | "authoritative"
  | "archival"
  | "superseded";

export type MemoryRetentionPolicy =
  | "active"
  | "durable"
  | "archive"
  | "history-only";

export type MemoryAuthorityLevel =
  | "candidate"
  | "verified"
  | "authoritative";

export interface MemoryLifecycleInput {
  readonly kind:
    | "current-task"
    | "observation"
    | "event"
    | "fact"
    | "procedure"
    | "mission-state"
    | "project-state"
    | "verified-knowledge"
    | "historical-record"
    | "superseded-knowledge";

  readonly verified:
    boolean;

  readonly superseded:
    boolean;

  readonly missionId?:
    string;

  readonly projectId?:
    string;
}

export interface MemoryLifecycleClassification {
  readonly lifecycleClass:
    MemoryLifecycleClass;

  readonly retention:
    MemoryRetentionPolicy;

  readonly authority:
    MemoryAuthorityLevel;

  readonly active:
    boolean;

  readonly durable:
    boolean;

  readonly requiresVerification:
    boolean;

  readonly reason:
    string;
}

export class MemoryLifecycleClassifier {
  classify(
    input:
      MemoryLifecycleInput,
  ):
    MemoryLifecycleClassification {
    if (
      input.superseded
    ) {
      return {
        lifecycleClass:
          "superseded",

        retention:
          "history-only",

        authority:
          input.verified
            ? "verified"
            : "candidate",

        active:
          false,

        durable:
          true,

        requiresVerification:
          false,

        reason:
          "Superseded memory remains durable history but is excluded from active operational memory.",
      };
    }

    switch (
      input.kind
    ) {
      case "current-task":
        return {
          lifecycleClass:
            "working",

          retention:
            "active",

          authority:
            "candidate",

          active:
            true,

          durable:
            false,

          requiresVerification:
            false,

          reason:
            "Current task state belongs to active working memory.",
        };

      case "observation":
      case "event":
        return {
          lifecycleClass:
            "episodic",

          retention:
            "durable",

          authority:
            "candidate",

          active:
            true,

          durable:
            true,

          requiresVerification:
            false,

          reason:
            "Observed events are durable episodic history and may support later consolidation.",
        };

      case "fact":
        return {
          lifecycleClass:
            "semantic",

          retention:
            "durable",

          authority:
            input.verified
              ? "verified"
              : "candidate",

          active:
            true,

          durable:
            true,

          requiresVerification:
            !input.verified,

          reason:
            input.verified
              ? "Verified factual knowledge may participate in authoritative retrieval."
              : "Unverified factual knowledge remains candidate memory until verified.",
        };

      case "procedure":
        return {
          lifecycleClass:
            "procedural",

          retention:
            "durable",

          authority:
            input.verified
              ? "verified"
              : "candidate",

          active:
            true,

          durable:
            true,

          requiresVerification:
            !input.verified,

          reason:
            input.verified
              ? "Verified procedural knowledge may be reused by future work."
              : "Procedural knowledge requires verification before authoritative reuse.",
        };

      case "mission-state":
        return {
          lifecycleClass:
            "mission",

          retention:
            "durable",

          authority:
            "verified",

          active:
            true,

          durable:
            true,

          requiresVerification:
            false,

          reason:
            "Mission state is durable operational state required for continuity and resume.",
        };

      case "project-state":
        return {
          lifecycleClass:
            "project",

          retention:
            "durable",

          authority:
            "verified",

          active:
            true,

          durable:
            true,

          requiresVerification:
            false,

          reason:
            "Project state is durable operational state required for long-running work.",
        };

      case "verified-knowledge":
        if (
          !input.verified
        ) {
          throw new Error(
            "K.I.N.G.S. Memory Lifecycle: verified-knowledge cannot be classified without verification.",
          );
        }

        return {
          lifecycleClass:
            "authoritative",

          retention:
            "durable",

          authority:
            "authoritative",

          active:
            true,

          durable:
            true,

          requiresVerification:
            false,

          reason:
            "Verified knowledge is authoritative operational memory.",
        };

      case "historical-record":
        return {
          lifecycleClass:
            "archival",

          retention:
            "archive",

          authority:
            input.verified
              ? "verified"
              : "candidate",

          active:
            false,

          durable:
            true,

          requiresVerification:
            false,

          reason:
            "Historical records remain durable but are not active task context by default.",
        };

      case "superseded-knowledge":
        return {
          lifecycleClass:
            "superseded",

          retention:
            "history-only",

          authority:
            input.verified
              ? "verified"
              : "candidate",

          active:
            false,

          durable:
            true,

          requiresVerification:
            false,

          reason:
            "Superseded knowledge remains traceable history and cannot be treated as current guidance.",
        };

      default:
        return this.exhaustiveCheck(
          input.kind,
        );
    }
  }

  canEnterActiveContext(
    classification:
      MemoryLifecycleClassification,
  ):
    boolean {
    return (
      classification.active &&
      classification.lifecycleClass !==
        "archival" &&
      classification.lifecycleClass !==
        "superseded"
    );
  }

  canBeAuthoritative(
    classification:
      MemoryLifecycleClassification,
  ):
    boolean {
    return (
      classification.authority ===
        "authoritative" &&
      classification.lifecycleClass ===
        "authoritative"
    );
  }

  private exhaustiveCheck(
    value:
      never,
  ):
    never {
    throw new Error(
      `K.I.N.G.S. Memory Lifecycle: unsupported memory kind "${String(value)}".`,
    );
  }
}
