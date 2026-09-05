import type {
  Evidence,
  ID,
  KnowledgeRecord,
  KnowledgeSource,
  MemoryQuery,
  MemoryResult,
} from "./types";

import {
  KnowledgeRegistry,
} from "./knowledge-registry";

import {
  KnowledgeRetrieval,
} from "./knowledge-retrieval";

export class ProjectBrain {
  private readonly registry: KnowledgeRegistry;
  private readonly retrieval: KnowledgeRetrieval;

  constructor(
    registry?: KnowledgeRegistry,
  ) {
    this.registry =
      registry ??
      new KnowledgeRegistry();

    this.retrieval =
      new KnowledgeRetrieval(
        this.registry,
      );
  }

  registerSource(
    source: KnowledgeSource,
  ): void {
    this.registry.registerSource(
      source,
    );
  }

  updateSource(
    source: KnowledgeSource,
  ): void {
    this.registry.updateSource(
      source,
    );
  }

  registerEvidence(
    evidence: Evidence,
  ): void {
    this.registry.registerEvidence(
      evidence,
    );
  }

  registerRecord(
    record: KnowledgeRecord,
  ): void {
    this.registry.registerRecord(
      record,
    );
  }

  getSource(
    sourceId: ID,
  ): KnowledgeSource | undefined {
    return this.registry.getSource(
      sourceId,
    );
  }

  getEvidence(
    evidenceId: ID,
  ): Evidence | undefined {
    return this.registry.getEvidence(
      evidenceId,
    );
  }

  getRecord(
    recordId: ID,
  ): KnowledgeRecord | undefined {
    return this.registry.getRecord(
      recordId,
    );
  }

  retrieve(
    query: MemoryQuery,
  ): MemoryResult {
    return this.retrieval.retrieve(
      query,
    );
  }

  listSources(): KnowledgeSource[] {
    return this.registry.listSources();
  }

  listEvidence(): Evidence[] {
    return this.registry.listEvidence();
  }

  listRecords(): KnowledgeRecord[] {
    return this.registry.listRecords();
  }

  clear(): void {
    this.registry.clear();
  }
}