import type { ID } from "../types";
import { EXTERNAL_RESEARCH_TOOL_ID, ExternalResearchAdapter } from "./external-research";

export interface ResearchAcquisitionDiscoveryRequest {
  researchId: ID;
  taskId: ID;
  agentId: ID;
  question: string;
  urls: string[];
  maxSources: number;
}

export interface ResearchAcquisitionCandidate {
  candidateId: ID;
  researchId: ID;
  sourceId: ID;
  finalUrl: string;
  status: number;
  content: string;
  provenance: string;
  verified: false;
}

export interface ResearchAcquisitionDiscoveryResult {
  researchId: ID;
  candidates: ResearchAcquisitionCandidate[];
}

export class ResearchAcquisitionSourceGateway {
  constructor(private readonly research: ExternalResearchAdapter) {}

  async discover(request: ResearchAcquisitionDiscoveryRequest): Promise<ResearchAcquisitionDiscoveryResult> {
    const result = await this.research.execute({
      requestId: `${request.researchId}:discovery`,
      taskId: request.taskId,
      agentId: request.agentId,
      toolId: EXTERNAL_RESEARCH_TOOL_ID,
      arguments: {
        researchId: request.researchId,
        question: request.question,
        urls: request.urls,
        maxSources: request.maxSources,
      },
    });
    return {
      researchId: request.researchId,
      candidates: result.sources.map((source, index) => ({
        candidateId: `${request.researchId}:candidate:${index + 1}`,
        researchId: request.researchId,
        sourceId: source.sourceId,
        finalUrl: source.finalUrl,
        status: source.status,
        content: source.content,
        provenance: [
          `research:${request.researchId}`,
          `source:${source.sourceId}`,
          `url:${source.finalUrl}`,
          `retrieved:${source.retrievedAt}`,
        ].join(" | "),
        verified: false as const,
      })),
    };
  }
}
