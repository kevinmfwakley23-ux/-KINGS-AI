import type {
  ID,
  KnowledgeRecord,
  MemoryQuery,
  MemoryResult,
} from "./types";

import {
  ProjectBrain,
} from "./project-brain";

import type {
  MissionContinuitySnapshot,
  MissionContinuityStore,
} from "./mission-continuity";

export interface ProjectBrainStateSnapshot {
  missionId: ID;
  continuity: MissionContinuitySnapshot;
  knowledge: MemoryResult;
  authoritativeRecords: KnowledgeRecord[];
  createdAt: string;
}

export interface ProjectBrainStateQuery {
  missionId: ID;
  knowledgeQuery: MemoryQuery;
}

export class ProjectBrainStateAuthority {
  constructor(
    private readonly brain: ProjectBrain,
    private readonly continuity:
      MissionContinuityStore,
  ) {}

  snapshot(
    request: ProjectBrainStateQuery,
  ): ProjectBrainStateSnapshot {
    if (!request.missionId.trim()) {
      throw new Error(
        "K.I.N.G.S. Project Brain State: mission id is required",
      );
    }

    const continuity =
      this.continuity.snapshot(
        request.missionId,
      );

    const knowledgeQuery: MemoryQuery = {
      ...request.knowledgeQuery,
      authoritativeOnly: true,
    };

    const knowledge =
      this.brain.retrieve(
        knowledgeQuery,
      );

    const authoritativeRecords =
      knowledge.records.filter(
        (record) =>
          record.authoritative === true,
      );

    return {
      missionId:
        request.missionId,
      continuity,
      knowledge,
      authoritativeRecords,
      createdAt:
        new Date().toISOString(),
    };
  }
}
