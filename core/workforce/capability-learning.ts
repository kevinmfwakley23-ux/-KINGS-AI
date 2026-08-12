import type {
  ID,
  KnowledgeRecord,
  KnowledgeSource,
  Evidence,
} from "./types";

import {
  KnowledgeRegistry,
} from "./knowledge-registry";

import {
  CapabilityRegistry,
  type CapabilityManifest,
} from "./capability-registry";

import {
  ExternalResearchAdapter,
  type ExternalResearchResult,
  type ResearchSourceRecord,
} from "./execution/external-research";

export interface CapabilityLearningRequest {
  learningId:
    ID;
  taskId:
    ID;
  capabilityId:
    ID;
  question:
    string;
  urls:
    string[];
  maxSources:
    number;
}

export interface LearnedCapabilityProposal {
  capability:
    CapabilityManifest;
  summary:
    string;
  knowledge:
    string;
  evidenceSourceIds:
    ID[];
  verificationCriteria:
    string[];
}

export interface CapabilityLearningVerifier {
  verify(
    proposal:
      LearnedCapabilityProposal,
    research:
      ExternalResearchResult,
  ):
    boolean;
}

export interface CapabilityLearningResult {
  learningId:
    ID;
  taskId:
    ID;
  capabilityId:
    ID;
  status:
    "promoted"
    | "rejected";
  research:
    ExternalResearchResult;
  knowledgeRecordId?:
    ID;
  capabilityIdPromoted?:
    ID;
  reason:
    string;
}

export class CapabilityLearningAuthority {
  constructor(
    private readonly research:
      ExternalResearchAdapter,
    private readonly knowledge:
      KnowledgeRegistry,
    private readonly capabilities:
      CapabilityRegistry,
    private readonly verifier:
      CapabilityLearningVerifier,
  ) {}

  async learn(
    request:
      CapabilityLearningRequest,
    proposal:
      LearnedCapabilityProposal,
  ):
    Promise<CapabilityLearningResult> {
    this.validateRequest(
      request,
      proposal,
    );

    const research =
      await this.research.execute({
        requestId:
          request.learningId,
        taskId:
          request.taskId,
        agentId:
          "capability-learning",
        toolId:
          this.research.toolId,
        arguments: {
          researchId:
            request.learningId,
          question:
            request.question,
          urls:
            request.urls,
          maxSources:
            request.maxSources,
        },
      });

    const sourceById =
      new Map<
        ID,
        ResearchSourceRecord
      >(
        research.sources.map(
          (source) => [
            source.sourceId,
            source,
          ],
        ),
      );

    for (
      const sourceId of
      proposal.evidenceSourceIds
    ) {
      if (
        !sourceById.has(
          sourceId,
        )
      ) {
        return {
          learningId:
            request.learningId,
          taskId:
            request.taskId,
          capabilityId:
            request.capabilityId,
          status:
            "rejected",
          research,
          reason:
            `Learning proposal references source "${sourceId}" that was not retrieved.`,
        };
      }
    }

    if (
      !this.verifier.verify(
        proposal,
        research,
      )
    ) {
      return {
        learningId:
          request.learningId,
        taskId:
          request.taskId,
        capabilityId:
          request.capabilityId,
        status:
          "rejected",
        research,
        reason:
          "Learning evidence did not satisfy the verification gate.",
      };
    }

    const now =
      new Date().toISOString();

    const evidenceIds:
      ID[] = [];

    for (
      const sourceId of
      proposal.evidenceSourceIds
    ) {
      const source =
        sourceById.get(
          sourceId,
        );

      if (!source) {
        throw new Error(
          `K.I.N.G.S. Capability Learning: source "${sourceId}" disappeared during promotion.`,
        );
      }

      const knowledgeSource:
        KnowledgeSource = {
        id:
          `learning-source-${source.sourceId}`,
        type:
          "other",
        name:
          source.finalUrl,
        description:
          `Externally researched source for capability learning "${request.capabilityId}".`,
        location:
          source.finalUrl,
        authoritative:
          false,
        contentHash:
          this.hash(
            source.content,
          ),
        createdAt:
          now,
        updatedAt:
          now,
      };

      this.knowledge.registerSource(
        knowledgeSource,
      );

      const evidence:
        Evidence = {
        id:
          `learning-evidence-${source.sourceId}`,
        sourceId:
          knowledgeSource.id,
        description:
          `Retrieved external source supporting capability "${request.capabilityId}".`,
        location:
          source.finalUrl,
        excerpt:
          source.content.slice(
            0,
            2000,
          ),
        createdAt:
          now,
      };

      this.knowledge.registerEvidence(
        evidence,
      );

      evidenceIds.push(
        evidence.id,
      );
    }

    const knowledgeRecord:
      KnowledgeRecord = {
      id:
        `learned-knowledge-${request.learningId}`,
      sourceId:
        `learning-source-${proposal.evidenceSourceIds[0]}`,
      memoryType:
        "procedural",
      summary:
        proposal.summary,
      content:
        proposal.knowledge,
      evidenceIds,
      authoritative:
        true,
      createdAt:
        now,
      updatedAt:
        now,
    };

    this.knowledge.registerRecord(
      knowledgeRecord,
    );

    this.capabilities.register(
      {
        ...proposal.capability,
        id:
          request.capabilityId,
        createdAt:
          now,
        updatedAt:
          now,
        enabled:
          true,
      },
    );

    return {
      learningId:
        request.learningId,
      taskId:
        request.taskId,
      capabilityId:
        request.capabilityId,
      status:
        "promoted",
      research,
      knowledgeRecordId:
        knowledgeRecord.id,
      capabilityIdPromoted:
        proposal.capability.id,
      reason:
        "External knowledge was retrieved, independently verified, preserved as authoritative knowledge, and registered as a reusable capability.",
    };
  }

  private validateRequest(
    request:
      CapabilityLearningRequest,
    proposal:
      LearnedCapabilityProposal,
  ): void {
    if (
      !request.learningId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Learning: learning id is required.",
      );
    }

    if (
      !request.taskId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Learning: task id is required.",
      );
    }

    if (
      !request.capabilityId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Learning: capability id is required.",
      );
    }

    if (
      request.urls.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Learning: at least one external source is required.",
      );
    }

    if (
      proposal.capability.id !==
      request.capabilityId
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Learning: proposal capability does not match requested capability.",
      );
    }

    if (
      proposal.evidenceSourceIds.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Learning: verified learning requires evidence sources.",
      );
    }

    if (
      proposal.verificationCriteria.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Capability Learning: verification criteria are required.",
      );
    }
  }

  private hash(
    value:
      string,
  ):
    string {
    let hash =
      2166136261;

    for (
      let index = 0;
      index < value.length;
      index += 1
    ) {
      hash ^=
        value.charCodeAt(
          index,
        );

      hash =
        Math.imul(
          hash,
          16777619,
        );
    }

    return (
      hash >>> 0
    ).toString(16);
  }
}
