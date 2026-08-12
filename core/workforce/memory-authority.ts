import type {
  ID,
  MemoryReference,
} from "./types";

import {
  MemoryStore,
} from "./memory-store";

import {
  MemoryPromotionGate,
  type MemoryPromotionDecision,
  type MemoryPromotionRequest,
} from "./memory-promotion-gate";

export interface MemoryAuthorityPromotionRequest {
  memoryId: ID;
  verificationReferences: string[];
  humanAccepted: boolean;
}

export interface MemoryAuthorityPromotionResult {
  decision: MemoryPromotionDecision;
  memory?: MemoryReference;
}

export class MemoryAuthority {
  constructor(
    private readonly store:
      MemoryStore,
    private readonly promotionGate:
      MemoryPromotionGate,
  ) {}

  register(
    memory: MemoryReference,
  ): MemoryReference {
    if (memory.authoritative) {
      const decision =
        this.promotionGate.evaluate({
          memory,
          verificationReferences: [],
          humanAccepted: false,
        });

      if (!decision.allowed) {
        throw new Error(
          `K.I.N.G.S. Memory Authority: authoritative memory "${memory.id}" failed promotion gate: ${decision.reasons.join(
            " | ",
          )}`,
        );
      }
    }

    this.store.register(
      memory,
    );

    return this.store.get(
      memory.id,
    )!;
  }

  get(
    memoryId: ID,
  ): MemoryReference | undefined {
    return this.store.get(
      memoryId,
    );
  }

  query(
    options = {},
  ) {
    return this.store.query(
      options,
    );
  }

  evaluateMemoryPromotion(
    memory: MemoryReference,
    request: Omit<
      MemoryAuthorityPromotionRequest,
      "memoryId"
    >,
  ): MemoryPromotionDecision {
    const promotionRequest:
      MemoryPromotionRequest = {
      memory: {
        ...memory,
        sourceReferences: [
          ...memory.sourceReferences,
        ],
      },
      verificationReferences: [
        ...request.verificationReferences,
      ],
      humanAccepted:
        request.humanAccepted,
    };

    return this.promotionGate.evaluate(
      promotionRequest,
    );
  }

  evaluatePromotion(
    request:
      MemoryAuthorityPromotionRequest,
  ): MemoryPromotionDecision {
    const memory =
      this.store.get(
        request.memoryId,
      );

    if (!memory) {
      throw new Error(
        `K.I.N.G.S. Memory Authority: memory "${request.memoryId}" not found`,
      );
    }

    const promotionRequest:
      MemoryPromotionRequest = {
      memory,
      verificationReferences:
        request.verificationReferences,
      humanAccepted:
        request.humanAccepted,
    };

    return this.promotionGate.evaluate(
      promotionRequest,
    );
  }

  promote(
    request:
      MemoryAuthorityPromotionRequest,
  ): MemoryAuthorityPromotionResult {
    const decision =
      this.evaluatePromotion(
        request,
      );

    if (!decision.allowed) {
      return {
        decision,
      };
    }

    const memory =
      this.store.promote(
        request.memoryId,
      );

    return {
      decision,
      memory,
    };
  }

  clear(): void {
    this.store.clear();
  }
}
