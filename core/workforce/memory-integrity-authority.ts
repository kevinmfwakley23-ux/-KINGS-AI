import type {
  MemoryReference,
} from "./types";

export type MemoryIntegrityStatus =
  | "valid"
  | "invalid";

export interface MemoryIntegrityResult {
  memoryId:
    string;

  status:
    MemoryIntegrityStatus;

  identityValid:
    boolean;

  timestampsValid:
    boolean;

  provenanceValid:
    boolean;

  contextValid:
    boolean;

  authorityValid:
    boolean;

  reasons:
    string[];
}

export interface MemoryIntegrityOptions {
  knownMissionIds?:
    string[];

  knownTaskIds?:
    string[];

  knownSourceIds?:
    string[];

  supersededMemoryIds?:
    string[];
}

export class MemoryIntegrityAuthority {
  verify(
    memory:
      MemoryReference,
    options:
      MemoryIntegrityOptions =
        {},
  ):
    MemoryIntegrityResult {
    const reasons:
      string[] = [];

    const identityValid =
      this.verifyIdentity(
        memory,
        reasons,
      );

    const timestampsValid =
      this.verifyTimestamps(
        memory,
        reasons,
      );

    const provenanceValid =
      this.verifyProvenance(
        memory,
        options,
        reasons,
      );

    const contextValid =
      this.verifyContext(
        memory,
        options,
        reasons,
      );

    const authorityValid =
      this.verifyAuthority(
        memory,
        options,
        reasons,
      );

    const status =
      identityValid &&
      timestampsValid &&
      provenanceValid &&
      contextValid &&
      authorityValid
        ? "valid"
        : "invalid";

    return {
      memoryId:
        memory.id,

      status,

      identityValid,

      timestampsValid,

      provenanceValid,

      contextValid,

      authorityValid,

      reasons,
    };
  }

  private verifyIdentity(
    memory:
      MemoryReference,
    reasons:
      string[],
  ):
    boolean {
    if (
      !memory.id
    ) {
      reasons.push(
        "missing memory id",
      );

      return false;
    }

    if (
      !memory.summary.trim()
    ) {
      reasons.push(
        "missing memory summary",
      );

      return false;
    }

    return true;
  }

  private verifyTimestamps(
    memory:
      MemoryReference,
    reasons:
      string[],
  ):
    boolean {
    if (
      !memory.createdAt ||
      !memory.updatedAt
    ) {
      reasons.push(
        "missing memory timestamps",
      );

      return false;
    }

    const created =
      Date.parse(
        memory.createdAt,
      );

    const updated =
      Date.parse(
        memory.updatedAt,
      );

    if (
      !Number.isFinite(
        created,
      ) ||
      !Number.isFinite(
        updated,
      )
    ) {
      reasons.push(
        "invalid memory timestamps",
      );

      return false;
    }

    if (
      updated <
      created
    ) {
      reasons.push(
        "updatedAt precedes createdAt",
      );

      return false;
    }

    return true;
  }

  private verifyProvenance(
    memory:
      MemoryReference,
    options:
      MemoryIntegrityOptions,
    reasons:
      string[],
  ):
    boolean {
    if (
      memory.sourceReferences.length ===
      0
    ) {
      reasons.push(
        "missing provenance references",
      );

      return false;
    }

    if (
      options.knownSourceIds &&
      options.knownSourceIds.length >
        0
    ) {
      const known =
        new Set(
          options.knownSourceIds,
        );

      const unknown =
        memory.sourceReferences.filter(
          (
            reference,
          ) =>
            !known.has(
              reference,
            ),
        );

      if (
        unknown.length >
        0
      ) {
        reasons.push(
          `unknown provenance reference(s): ${unknown.join(", ")}`,
        );

        return false;
      }
    }

    return true;
  }

  private verifyContext(
    memory:
      MemoryReference,
    options:
      MemoryIntegrityOptions,
    reasons:
      string[],
  ):
    boolean {
    if (
      memory.missionId &&
      options.knownMissionIds &&
      options.knownMissionIds.length >
        0 &&
      !options.knownMissionIds.includes(
        memory.missionId,
      )
    ) {
      reasons.push(
        `unknown mission "${memory.missionId}"`,
      );

      return false;
    }

    if (
      memory.taskId &&
      options.knownTaskIds &&
      options.knownTaskIds.length >
        0 &&
      !options.knownTaskIds.includes(
        memory.taskId,
      )
    ) {
      reasons.push(
        `unknown task "${memory.taskId}"`,
      );

      return false;
    }

    return true;
  }

  private verifyAuthority(
    memory:
      MemoryReference,
    options:
      MemoryIntegrityOptions,
    reasons:
      string[],
  ):
    boolean {
    if (
      memory.authoritative &&
      (
        options.supersededMemoryIds ??
        []
      ).includes(
        memory.id,
      )
    ) {
      reasons.push(
        "authoritative memory is marked superseded",
      );

      return false;
    }

    return true;
  }
}
