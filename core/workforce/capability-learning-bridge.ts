import type { ID } from "./types";
import type { EngineeringLanguage, ToolchainOperation } from "./engineering-toolchain";
import type { CodingCapabilityGateResult } from "./coding-capability-gate";
import { KnowledgeGapResearchRequestFactory, type KnowledgeGapResearchRequest, type KnowledgeGapResearchRequestInput } from "./knowledge-gap-research-request";

export interface CapabilityLearningBlockerInput {
  missionId: ID;
  taskId: ID;
  agentId: ID;
  capabilityId: ID;
  language: EngineeringLanguage;
  operations: ToolchainOperation[];
  gate: CodingCapabilityGateResult;
}

export interface CapabilityLearningBlocker {
  missionId: ID;
  taskId: ID;
  capabilityId: ID;
  language: EngineeringLanguage;
  operations: ToolchainOperation[];
  reason: string;
  missingExecutables: string[];
  missingOperations: ToolchainOperation[];
  researchRequest: KnowledgeGapResearchRequest;
  resumable: true;
}

/**
 * Converts a deterministic capability-gate failure into a governed learning request.
 * This bridge does not grant web access or mutate runtime capabilities.
 */
export class CapabilityLearningBridge {
  constructor(
    private readonly researchRequests: KnowledgeGapResearchRequestFactory = new KnowledgeGapResearchRequestFactory(),
  ) {}

  createBlocker(input: CapabilityLearningBlockerInput): CapabilityLearningBlocker {
    if (input.gate.ready) {
      throw new Error("K.I.N.G.S. Capability Learning Bridge: cannot create a learning blocker from a ready capability gate");
    }

    const requestInput: KnowledgeGapResearchRequestInput = {
      id: `research-${input.taskId}-${Date.now()}`,
      missionId: input.missionId,
      taskId: input.taskId,
      agentId: input.agentId,
      capabilityId: input.capabilityId,
      question: `Find verified knowledge, tools, and runtime requirements needed to execute ${input.language} operations: ${input.operations.join(", ")}.`,
      rationale: input.gate.reason,
      requestedHosts: undefined,
      requestedSourceTypes: ["official-documentation", "official-tooling"],
      maxSources: 5,
      maxDurationMs: 10 * 60 * 1000,
    };

    const researchRequest = this.researchRequests.create(requestInput);

    return {
      missionId: input.missionId,
      taskId: input.taskId,
      capabilityId: input.capabilityId,
      language: input.language,
      operations: [...input.operations],
      reason: input.gate.reason,
      missingExecutables: [...input.gate.missingExecutables],
      missingOperations: [...input.gate.missingOperations],
      researchRequest,
      resumable: true,
    };
  }
}
