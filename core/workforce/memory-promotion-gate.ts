import type {
  ID,
  MemoryReference,
} from "./types";

export interface MemoryPromotionDecision {
  memoryId: ID;
  allowed: boolean;
  reasons: string[];
}

export interface MemoryPromotionRequest {
  memory: MemoryReference;

  /**
   * Deterministic verification evidence must exist
   * before durable promotion is allowed.
   */
  verificationReferences: string[];

  /**
   * Human acceptance may authorize promotion when
   * deterministic verification is not applicable.
   */
  humanAccepted: boolean;
}

export class MemoryPromotionGate {
  evaluate(
    request: MemoryPromotionRequest,
  ): MemoryPromotionDecision {
    const reasons: string[] = [];

    if (!request.memory.id) {
      reasons.push(
        "Memory id is required.",
      );
    }

    if (
      !request.memory.summary.trim()
    ) {
      reasons.push(
        "Memory summary is required.",
      );
    }

    if (
      request.memory.sourceReferences.length === 0
    ) {
      reasons.push(
        "Memory provenance is required.",
      );
    }

    const verified =
      request.verificationReferences
        .filter(
          (reference) =>
            reference.trim().length > 0,
        );

    if (
      verified.length === 0 &&
      !request.humanAccepted
    ) {
      reasons.push(
        "Durable memory requires verification evidence or explicit human acceptance.",
      );
    }

    return {
      memoryId:
        request.memory.id,
      allowed:
        reasons.length === 0,
      reasons,
    };
  }
}
