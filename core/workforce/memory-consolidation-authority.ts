import type {
  ID,
  MemoryReference,
} from "./types";

import {
  MemoryAuthority,
  type MemoryAuthorityPromotionResult,
} from "./memory-authority";

import {
  MemoryConsolidationCandidate,
} from "./memory-consolidation";

import {
  MemoryConsolidationStore,
} from "./memory-consolidation-store";

export interface ConsolidationPromotionRequest {
  candidateId: ID;
  verificationReferences: string[];
  humanAccepted: boolean;
}

export interface ConsolidationPromotionResult {
  allowed: boolean;
  reasons: string[];
  memory?: MemoryReference;
  authority?: MemoryAuthorityPromotionResult;
}

export class MemoryConsolidationAuthorityBridge {
  constructor(
    private readonly consolidationStore:
      MemoryConsolidationStore,
    private readonly memoryAuthority:
      MemoryAuthority,
  ) {}

  promote(
    request:
      ConsolidationPromotionRequest,
  ): ConsolidationPromotionResult {
    const candidate =
      this.consolidationStore.get(
        request.candidateId,
      );

    if (!candidate) {
      return {
        allowed: false,
        reasons: [
          `Consolidation candidate "${request.candidateId}" not found`,
        ],
      };
    }

    const lineageReasons =
      this.validateLineage(
        candidate,
      );

    if (
      lineageReasons.length > 0
    ) {
      return {
        allowed: false,
        reasons:
          lineageReasons,
      };
    }

    const memory:
      MemoryReference = {
      id:
        candidate.id,
      type:
        candidate.memoryType,
      summary:
        candidate.summary,
      sourceReferences: [
        ...candidate.sourceReferences,
      ],
      missionId:
        candidate.missionId,
      taskId:
        candidate.taskId,
      authoritative:
        false,
      createdAt:
        candidate.createdAt,
      updatedAt:
        candidate.updatedAt,
    };

    const existing =
      this.memoryAuthority.get(
        memory.id,
      );

    if (existing) {
      return {
        allowed: false,
        reasons: [
          `Memory "${memory.id}" already exists in the authority store`,
        ],
      };
    }

    const decision =
      this.memoryAuthority.evaluateMemoryPromotion(
        memory,
        {
          verificationReferences: [
            ...request.verificationReferences,
          ],
          humanAccepted:
            request.humanAccepted,
        },
      );

    if (!decision.allowed) {
      return {
        allowed: false,
        reasons:
          decision.reasons,
      };
    }

    this.memoryAuthority.register(
      memory,
    );

    const authority =
      this.memoryAuthority.promote({
        memoryId:
          memory.id,
        verificationReferences:
          [
            ...request.verificationReferences,
          ],
        humanAccepted:
          request.humanAccepted,
      });

    if (
      !authority.decision.allowed
    ) {
      return {
        allowed: false,
        reasons:
          authority.decision.reasons,
        authority,
      };
    }

    return {
      allowed: true,
      reasons: [],
      memory:
        authority.memory,
      authority,
    };
  }

  private validateLineage(
    candidate:
      MemoryConsolidationCandidate,
  ): string[] {
    const reasons: string[] = [];

    if (
      candidate.sourceMemoryIds.length ===
      0
    ) {
      reasons.push(
        `Consolidation candidate "${candidate.id}" has no source memory lineage`,
      );
    }

    if (
      candidate.sourceReferences.length ===
      0
    ) {
      reasons.push(
        `Consolidation candidate "${candidate.id}" has no source provenance`,
      );
    }

    if (
      candidate.sourceCount !==
      candidate.sourceMemoryIds.length
    ) {
      reasons.push(
        `Consolidation candidate "${candidate.id}" has inconsistent source count`,
      );
    }

    if (
      candidate.authoritative
    ) {
      reasons.push(
        `Consolidation candidate "${candidate.id}" cannot enter promotion as authoritative`,
      );
    }

    return reasons;
  }
}
