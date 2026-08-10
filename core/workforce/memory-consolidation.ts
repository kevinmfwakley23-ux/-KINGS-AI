import type {
  ID,
  MemoryReference,
  MemoryType,
} from "./types";

export interface MemoryConsolidationCandidate {
  id: ID;
  memoryType: MemoryType;
  summary: string;
  sourceReferences: string[];
  sourceMemoryIds: ID[];
  missionId?: ID;
  taskId?: ID;
  sourceCount: number;
  estimatedInputCharacters: number;
  estimatedOutputCharacters: number;
  estimatedCharacterSavings: number;
  consolidationReason: string;
  authoritative: false;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryConsolidationRequest {
  memories: MemoryReference[];
  candidateId: ID;
  summary: string;
  memoryType: MemoryType;
  consolidationReason: string;
  missionId?: ID;
  taskId?: ID;
}

export interface MemoryConsolidationDecision {
  candidate: MemoryConsolidationCandidate;
  allowed: boolean;
  reasons: string[];
}

export class MemoryConsolidationAuthority {
  propose(
    request: MemoryConsolidationRequest,
  ): MemoryConsolidationDecision {
    const reasons: string[] = [];

    if (!request.candidateId.trim()) {
      reasons.push(
        "Consolidation candidate id is required.",
      );
    }

    if (!request.summary.trim()) {
      reasons.push(
        "Consolidation summary is required.",
      );
    }

    if (!request.consolidationReason.trim()) {
      reasons.push(
        "Consolidation reason is required.",
      );
    }

    if (request.memories.length === 0) {
      reasons.push(
        "At least one source memory is required.",
      );
    }

    const sourceMemoryIds =
      request.memories.map(
        (memory) => memory.id,
      );

    if (
      new Set(sourceMemoryIds).size !==
      sourceMemoryIds.length
    ) {
      reasons.push(
        "Source memory ids must be unique.",
      );
    }

    const sourceReferences = [
      ...new Set(
        request.memories.flatMap(
          (memory) =>
            memory.sourceReferences,
        ),
      ),
    ];

    if (sourceReferences.length === 0) {
      reasons.push(
        "Consolidated memory must preserve source provenance.",
      );
    }

    const estimatedInputCharacters =
      request.memories.reduce(
        (total, memory) =>
          total +
          memory.summary.length +
          memory.sourceReferences.join(" ").length,
        0,
      );

    const estimatedOutputCharacters =
      request.summary.length +
      sourceReferences.join(" ").length;

    const estimatedCharacterSavings =
      Math.max(
        0,
        estimatedInputCharacters -
          estimatedOutputCharacters,
      );

    const candidate:
      MemoryConsolidationCandidate = {
      id:
        request.candidateId,
      memoryType:
        request.memoryType,
      summary:
        request.summary.trim(),
      sourceReferences,
      sourceMemoryIds,
      missionId:
        request.missionId,
      taskId:
        request.taskId,
      sourceCount:
        request.memories.length,
      estimatedInputCharacters,
      estimatedOutputCharacters,
      estimatedCharacterSavings,
      consolidationReason:
        request.consolidationReason.trim(),
      authoritative:
        false,
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString(),
    };

    return {
      candidate,
      allowed:
        reasons.length === 0,
      reasons,
    };
  }
}
