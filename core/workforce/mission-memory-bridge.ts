import type {
  ID,
  MemoryReference,
  MemoryType,
} from "./types";

import {
  MemoryStore,
} from "./memory-store";

import {
  MemoryPromotionGate,
} from "./memory-promotion-gate";

import type {
  MissionDecision,
  MissionCheckpoint,
  MissionState,
  MissionPlan,
} from "./mission-continuity";

export interface MissionMemorySource {
  sourceReferences: string[];
}

export interface MissionMemoryRegistration {
  memoryId: ID;
  missionId: ID;
  type: MemoryType;
  summary: string;
  sourceReferences: string[];
  authoritative: boolean;
}

export class MissionMemoryBridge {
  constructor(
    private readonly memoryStore:
      MemoryStore,
    private readonly promotionGate:
      MemoryPromotionGate,
  ) {}

  rememberDecision(
    decision: MissionDecision,
    type: MemoryType,
  ): MissionMemoryRegistration {
    const memory =
      this.createMemory({
        id:
          `MISSION-MEMORY-DECISION-${decision.id}`,
        type,
        summary:
          decision.statement,
        sourceReferences:
          decision.sourceReferences,
        missionId:
          decision.missionId,
        authoritative:
          false,
        createdAt:
          decision.createdAt,
        updatedAt:
          decision.updatedAt,
      });

    const authoritative =
      decision.authoritative &&
      decision.locked;

    const promoted =
      this.promoteIfAuthorized(
        memory,
        authoritative,
      );

    this.register(
      promoted,
    );

    return this.toRegistration(
      promoted,
    );
  }

  rememberPlan(
    plan: MissionPlan,
    source: MissionMemorySource,
    type: MemoryType,
  ): MissionMemoryRegistration {
    const memory =
      this.createMemory({
        id:
          `MISSION-MEMORY-PLAN-${plan.id}-V${plan.version}`,
        type,
        summary:
          plan.objective,
        sourceReferences:
          source.sourceReferences,
        missionId:
          plan.missionId,
        authoritative:
          false,
        createdAt:
          plan.createdAt,
        updatedAt:
          plan.updatedAt,
      });

    const authoritative =
      plan.locked &&
      plan.approvedByHuman;

    const promoted =
      this.promoteIfAuthorized(
        memory,
        authoritative,
      );

    this.register(
      promoted,
    );

    return this.toRegistration(
      promoted,
    );
  }

  rememberState(
    state: MissionState,
    source: MissionMemorySource,
    type: MemoryType,
  ): MissionMemoryRegistration {
    const memory =
      this.createMemory({
        id:
          `MISSION-MEMORY-STATE-${state.missionId}-${state.updatedAt}`,
        type,
        summary:
          this.buildStateSummary(
            state,
          ),
        sourceReferences:
          source.sourceReferences,
        missionId:
          state.missionId,
        authoritative:
          false,
        createdAt:
          state.updatedAt,
        updatedAt:
          state.updatedAt,
      });

    this.register(
      memory,
    );

    return this.toRegistration(
      memory,
    );
  }

  rememberCheckpoint(
    checkpoint: MissionCheckpoint,
    type: MemoryType,
  ): MissionMemoryRegistration {
    const memory =
      this.createMemory({
        id:
          `MISSION-MEMORY-CHECKPOINT-${checkpoint.id}`,
        type,
        summary:
          checkpoint.summary,
        sourceReferences:
          checkpoint.state.evidenceIds,
        missionId:
          checkpoint.missionId,
        authoritative:
          false,
        createdAt:
          checkpoint.createdAt,
        updatedAt:
          checkpoint.createdAt,
      });

    this.register(
      memory,
    );

    return this.toRegistration(
      memory,
    );
  }

  getMissionMemories(
    missionId: ID,
    type?: MemoryType,
  ): MemoryReference[] {
    return this.memoryStore.query({
      missionId,
      type,
    });
  }

  getAuthoritativeMissionMemories(
    missionId: ID,
  ): MemoryReference[] {
    return this.memoryStore.query({
      missionId,
      authoritativeOnly: true,
    });
  }

  private promoteIfAuthorized(
    memory: MemoryReference,
    authoritative: boolean,
  ): MemoryReference {
    if (!authoritative) {
      return memory;
    }

    const decision =
      this.promotionGate.evaluate({
        memory,
        verificationReferences:
          memory.sourceReferences,
        humanAccepted:
          true,
      });

    if (!decision.allowed) {
      throw new Error(
        `K.I.N.G.S. Mission Memory Bridge: authoritative memory "${memory.id}" failed promotion gate: ${decision.reasons.join("; ")}`,
      );
    }

    return {
      ...memory,
      authoritative:
        true,
      updatedAt:
        new Date().toISOString(),
    };
  }

  private register(
    memory: MemoryReference,
  ): void {
    this.memoryStore.register(
      memory,
    );
  }

  private createMemory(
    memory: MemoryReference,
  ): MemoryReference {
    if (
      memory.sourceReferences.length === 0
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Memory Bridge: memory "${memory.id}" requires provenance`,
      );
    }

    return {
      ...memory,
      sourceReferences: [
        ...memory.sourceReferences,
      ],
    };
  }

  private buildStateSummary(
    state: MissionState,
  ): string {
    return [
      `Mission ${state.missionId} state`,
      `active tasks: ${state.activeTaskIds.length}`,
      `completed tasks: ${state.completedTaskIds.length}`,
      `blocked tasks: ${state.blockedTaskIds.length}`,
      `failed tasks: ${state.failedTaskIds.length}`,
      `open questions: ${state.openQuestionIds.length}`,
      `risks: ${state.riskIds.length}`,
      `artifacts: ${state.artifactIds.length}`,
      `evidence: ${state.evidenceIds.length}`,
    ].join("; ");
  }

  private toRegistration(
    memory: MemoryReference,
  ): MissionMemoryRegistration {
    if (!memory.missionId) {
      throw new Error(
        `K.I.N.G.S. Mission Memory Bridge: memory "${memory.id}" is missing mission id`,
      );
    }

    return {
      memoryId:
        memory.id,
      missionId:
        memory.missionId,
      type:
        memory.type,
      summary:
        memory.summary,
      sourceReferences: [
        ...memory.sourceReferences,
      ],
      authoritative:
        memory.authoritative,
    };
  }
}
