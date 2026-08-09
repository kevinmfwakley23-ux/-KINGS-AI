import type {
  ID,
  KnowledgeRecord,
  KnowledgeSource,
} from "./types";

export class KnowledgeRegistry {
  private readonly sources = new Map<ID, KnowledgeSource>();
  private readonly records = new Map<ID, KnowledgeRecord>();

  registerSource(source: KnowledgeSource): void {
    this.assertUnique(this.sources, source.id, "knowledge source");
    this.sources.set(source.id, source);
  }

  registerRecord(record: KnowledgeRecord): void {
    if (!this.sources.has(record.sourceId)) {
      throw new Error(
        `K.I.N.G.S. Knowledge Registry: source "${record.sourceId}" ` +
        `must be registered before knowledge record "${record.id}"`,
      );
    }

    this.assertUnique(
      this.records,
      record.id,
      "knowledge record",
    );

    this.records.set(record.id, record);
  }

  getSource(id: ID): KnowledgeSource | undefined {
    return this.sources.get(id);
  }

  getRecord(id: ID): KnowledgeRecord | undefined {
    return this.records.get(id);
  }

  listSources(): KnowledgeSource[] {
    return [...this.sources.values()];
  }

  listRecords(): KnowledgeRecord[] {
    return [...this.records.values()];
  }

  clear(): void {
    this.sources.clear();
    this.records.clear();
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
