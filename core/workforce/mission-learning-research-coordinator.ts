import type { ID } from "./types";
import type { MissionLearningController, MissionLearningRecord } from "./mission-learning-controller";
import type { ProjectOwnerResearchPolicyAuthority } from "./execution/project-owner-research-policy";

export interface ResearchAcquisitionSourceGatewayCandidate {
  sourceId: ID;
  sourceUrl: string;
  success: boolean;
  integrityVerified: boolean;
}

export interface ResearchAcquisitionSourceGateway {
  discover(request: {
    researchId: ID;
    taskId: ID;
    agentId: ID;
    question: string;
    urls: string[];
    maxSources: number;
  }): Promise<{
    candidates: ResearchAcquisitionSourceGatewayCandidate[];
  }>;
}

export interface MissionLearningResearchCoordinatorRequest {
  recordId: ID;
  approvalId: ID;
  ownerId: ID;
  projectId: ID;
  taskId: ID;
  researchId: ID;
  agentId: ID;
  question: string;
  urls: string[];
  maxSources: number;
}

export interface MissionLearningResearchCoordinatorResult {
  record: MissionLearningRecord;
  sourceIds: string[];
  verifiedCandidateIds: string[];
  readyToResume: boolean;
}

/**
 * Connects a persisted mission-learning blocker to a governed
 * external-research gateway. It never grants research access itself.
 */
export class MissionLearningResearchCoordinator {
  constructor(
    private readonly learning: MissionLearningController,
    private readonly policy: ProjectOwnerResearchPolicyAuthority,
    private readonly gateway: ResearchAcquisitionSourceGateway,
  ) {}

  async execute(
    request: MissionLearningResearchCoordinatorRequest,
  ): Promise<MissionLearningResearchCoordinatorResult> {
    const record = this.learning.get(request.recordId);
    if (!record) {
      throw new Error(`K.I.N.G.S. Mission Learning Research: record "${request.recordId}" was not found`);
    }

    if (record.taskId !== request.taskId || record.missionId !== request.projectId) {
      throw new Error("K.I.N.G.S. Mission Learning Research: research request does not match the blocked mission task");
    }

    this.policy.authorize({
      researchId: request.researchId,
      taskId: request.taskId,
      question: request.question,
      urls: request.urls,
      maxSources: request.maxSources,
    });

    this.learning.markResearchRequested(request.recordId);

    const discovered = await this.gateway.discover({
      researchId: request.researchId,
      taskId: request.taskId,
      agentId: request.agentId,
      question: request.question,
      urls: request.urls,
      maxSources: request.maxSources,
    });

    const verifiedCandidates = discovered.candidates.filter(
      (candidate) => candidate.success && candidate.integrityVerified,
    );

    if (verifiedCandidates.length === 0) {
      return {
        record: this.learning.get(request.recordId) ?? record,
        sourceIds: [],
        verifiedCandidateIds: [],
        readyToResume: false,
      };
    }

    this.learning.markReadyToResume(request.recordId);

    const ready = this.learning.get(request.recordId);
    if (!ready) {
      throw new Error(`K.I.N.G.S. Mission Learning Research: learning record "${request.recordId}" disappeared after verification`);
    }

    return {
      record: ready,
      sourceIds: verifiedCandidates.map((candidate) => candidate.sourceId),
      verifiedCandidateIds: verifiedCandidates.map((candidate) => candidate.sourceId),
      readyToResume: true,
    };
  }
}
