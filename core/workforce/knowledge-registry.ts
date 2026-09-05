import type {
  Evidence,
  ID,
  KnowledgeRecord,
  KnowledgeSource,
} from "./types";

export class KnowledgeRegistry {
  private readonly sources = new Map<ID, KnowledgeSource>();
  private readonly records = new Map<ID, KnowledgeRecord>();
  private readonly evidence = new Map<ID, Evidence>();

  registerSource(source: KnowledgeSource): void {
    this.assertUnique(this.sources, source.id, "knowledge source");
    this.sources.set(source.id, { ...source });
  }

  updateSource(source: KnowledgeSource): void {
    if (!this.sources.has(source.id)) {
      throw new Error(
        `K.I.N.G.S. Knowledge Registry: knowledge source "${source.id}" must be registered before it can be updated`,
      );
    }

    this.sources.set(source.id, { ...source });
  }

  registerEvidence(item: Evidence): void {
    if (!this.sources.has(item.sourceId)) {
      throw new Error(
        `K.I.N.G.S. Knowledge Registry: source "${item.sourceId}" ` +
        `must be registered before evidence "${item.id}"`,
      );
    }

    this.assertUnique(this.evidence, item.id, "evidence");
    this.evidence.set(item.id, { ...item });
  }

  registerRecord(record: KnowledgeRecord): void {
    if (!this.sources.has(record.sourceId)) {
      throw new Error(
        `K.I.N.G.S. Knowledge Registry: source "${record.sourceId}" ` +
        `must be registered before knowledge record "${record.id}"`,
      );
    }

    for (const evidenceId of record.evidenceIds) {
      const evidence = this.evidence.get(evidenceId);

      if (!evidence) {
        throw new Error(
          `K.I.N.G.S. Knowledge Registry: evidence "${evidenceId}" ` +
          `must be registered before knowledge record "${record.id}"`,
        );
      }

      if (evidence.sourceId !== record.sourceId) {
        throw new Error(
          `K.I.N.G.S. Knowledge Registry: evidence "${evidenceId}" ` +
          `does not belong to source "${record.sourceId}"`,
        );
      }
    }

    this.assertUnique(
      this.records,
      record.id,
      "knowledge record",
    );

    this.records.set(record.id, {
      ...record,
      evidenceIds: [...record.evidenceIds],
    });
  }

  getSource(id: ID): KnowledgeSource | undefined {
    const source = this.sources.get(id);
    return source ? { ...source } : undefined;
  }

  getEvidence(id: ID): Evidence | undefined {
    const item = this.evidence.get(id);
    return item ? { ...item } : undefined;
  }

  getRecord(id: ID): KnowledgeRecord | undefined {
    const record = this.records.get(id);
    return record ? { ...record, evidenceIds: [...record.evidenceIds] } : undefined;
  }

  listSources(): KnowledgeSource[] {
    return [...this.sources.values()].map((source) => ({ ...source }));
  }

  listEvidence(): Evidence[] {
    return [...this.evidence.values()].map((item) => ({ ...item }));
  }

  listRecords(): KnowledgeRecord[] {
    return [...this.records.values()].map((record) => ({
      ...record,
      evidenceIds: [...record.evidenceIds],
    }));
  }

  clear(): void {
    this.sources.clear();
    this.records.clear();
    this.evidence.clear();
  }

  private assertUnique<T>(
    collection: Map<ID, T>,
    id: ID,
    type: string,
  ): void {
    if (collection.has(id)) {
      throw new Error(
        `K.I.N.G.S. Knowledge Registry: duplicate ${type} id "${id}"`,
      );
    }
  }
}
