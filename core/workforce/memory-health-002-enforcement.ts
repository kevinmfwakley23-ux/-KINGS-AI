import {
  MemoryLifecycleClassifier,
  type MemoryLifecycleClassification,
  type MemoryLifecycleInput,
} from "./memory-health-001-lifecycle";

export interface GovernedMemoryRecord {
  readonly id:
    string;

  readonly content:
    string;

  readonly lifecycle:
    MemoryLifecycleClassification;

  readonly createdAt:
    string;

  readonly updatedAt:
    string;
}

export interface MemoryWriteRequest {
  readonly id:
    string;

  readonly content:
    string;

  readonly lifecycle:
    MemoryLifecycleInput;

  readonly createdAt:
    string;
}

export interface MemoryPromotionRequest {
  readonly id:
    string;

  readonly verified:
    boolean;

  readonly superseded:
    boolean;

  readonly updatedAt:
    string;
}

export class GovernedMemoryStore {
  private readonly classifier =
    new MemoryLifecycleClassifier();

  private readonly records =
    new Map<
      string,
      GovernedMemoryRecord
    >();

  write(
    request:
      MemoryWriteRequest,
  ):
    GovernedMemoryRecord {
    if (
      !request.id.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Governed Memory: memory id is required.",
      );
    }

    if (
      !request.content.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Governed Memory: memory content is required.",
      );
    }

    if (
      this.records.has(
        request.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Governed Memory: memory "${request.id}" already exists.`,
      );
    }

    const lifecycle =
      this.classifier.classify(
        request.lifecycle,
      );

    const record:
      GovernedMemoryRecord = {
      id:
        request.id,

      content:
        request.content,

      lifecycle,

      createdAt:
        request.createdAt,

      updatedAt:
        request.createdAt,
    };

    this.records.set(
      request.id,
      record,
    );

    return this.clone(
      record,
    );
  }

  promote(
    request:
      MemoryPromotionRequest,
  ):
    GovernedMemoryRecord {
    const existing =
      this.records.get(
        request.id,
      );

    if (
      !existing
    ) {
      throw new Error(
        `K.I.N.G.S. Governed Memory: memory "${request.id}" does not exist.`,
      );
    }

    const sourceKind =
      existing.lifecycle.lifecycleClass ===
        "semantic"
        ? "verified-knowledge" as const
        : existing.lifecycle.lifecycleClass ===
            "procedural"
          ? "procedure" as const
          : existing.lifecycle.lifecycleClass ===
              "episodic"
            ? "event" as const
            : existing.lifecycle.lifecycleClass ===
                "working"
              ? "current-task" as const
              : existing.lifecycle.lifecycleClass ===
                  "mission"
                ? "mission-state" as const
                : existing.lifecycle.lifecycleClass ===
                    "project"
                  ? "project-state" as const
                  : existing.lifecycle.lifecycleClass ===
                      "authoritative"
                    ? "verified-knowledge" as const
                    : "historical-record" as const;

    const lifecycle =
      this.classifier.classify({
        kind:
          sourceKind,

        verified:
          request.verified,

        superseded:
          request.superseded,
      });

    if (
      lifecycle.lifecycleClass ===
        "authoritative" &&
      lifecycle.authority !==
        "authoritative"
    ) {
      throw new Error(
        "K.I.N.G.S. Governed Memory: authoritative promotion requires authoritative classification.",
      );
    }

    const updated:
      GovernedMemoryRecord = {
      ...existing,

      lifecycle,

      updatedAt:
        request.updatedAt,
    };

    this.records.set(
      request.id,
      updated,
    );

    return this.clone(
      updated,
    );
  }

  get(
    id:
      string,
  ):
    GovernedMemoryRecord |
    undefined {
    const record =
      this.records.get(
        id,
      );

    return record
      ? this.clone(
          record,
        )
      : undefined;
  }

  retrieveActive(
    limit:
      number,
  ):
    GovernedMemoryRecord[] {
    if (
      limit <=
        0
    ) {
      return [];
    }

    return [
      ...this.records.values(),
    ]
      .filter(
        (
          record,
        ) =>
          this.classifier.canEnterActiveContext(
            record.lifecycle,
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.updatedAt.localeCompare(
            left.updatedAt,
          ),
      )
      .slice(
        0,
        limit,
      )
      .map(
        (
          record,
        ) =>
          this.clone(
            record,
          ),
      );
  }

  retrieveAuthoritative():
    GovernedMemoryRecord[] {
    return [
      ...this.records.values(),
    ]
      .filter(
        (
          record,
        ) =>
          this.classifier.canBeAuthoritative(
            record.lifecycle,
          ),
      )
      .map(
        (
          record,
        ) =>
          this.clone(
            record,
          ),
      );
  }

  size():
    number {
    return this.records.size;
  }

  private clone(
    record:
      GovernedMemoryRecord,
  ):
    GovernedMemoryRecord {
    return {
      ...record,

      lifecycle: {
        ...record.lifecycle,
      },
    };
  }
}
