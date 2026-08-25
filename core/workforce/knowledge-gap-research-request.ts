import type { ID } from "./types";

export interface KnowledgeGapResearchRequest {
  id: ID;
  missionId: ID;
  taskId: ID;
  agentId: ID;
  capabilityId: ID;
  question: string;
  rationale: string;
  requestedHosts?: string[];
  requestedSourceTypes?: string[];
  maxSources: number;
  maxDurationMs: number;
  ownerApprovalRequired: true;
  status: "requested" | "approved" | "denied" | "expired";
  createdAt: string;
  updatedAt: string;
}

export class KnowledgeGapResearchRequestFactory {
  create(input: Omit<KnowledgeGapResearchRequest, "ownerApprovalRequired" | "status" | "createdAt" | "updatedAt">): KnowledgeGapResearchRequest {
    if (!input.missionId.trim()) {
      throw new Error("K.I.N.G.S. Knowledge Gap Research: mission id is required");
    }
    if (!input.taskId.trim()) {
      throw new Error("K.I.N.G.S. Knowledge Gap Research: task id is required");
    }
    if (!input.agentId.trim()) {
      throw new Error("K.I.N.G.S. Knowledge Gap Research: agent id is required");
    }
    if (!input.capabilityId.trim()) {
      throw new Error("K.I.N.G.S. Knowledge Gap Research: capability id is required");
    }
    if (!input.question.trim()) {
      throw new Error("K.I.N.G.S. Knowledge Gap Research: research question is required");
    }
    if (input.maxSources < 1) {
      throw new Error("K.I.N.G.S. Knowledge Gap Research: maxSources must be positive");
    }
    if (input.maxDurationMs <= 0) {
      throw new Error("K.I.N.G.S. Knowledge Gap Research: maxDurationMs must be positive");
    }

    const now = new Date().toISOString();
    return {
      ...input,
      ownerApprovalRequired: true,
      status: "requested",
      createdAt: now,
      updatedAt: now,
    };
  }
}
