import type {
  ID,
} from "./types";

import type {
  CompletionEvidence,
} from "./completion-gate";

export interface EvidenceQuery {
  type?: string;
  status?: "passed" | "failed";
  taskId?: ID;
  verificationReference?: string;
}

export class EvidenceStore {
  private readonly evidence =
    new Map<ID, CompletionEvidence>();

  register(
    item: CompletionEvidence,
  ): void {
    if (!item.id) {
      throw new Error(
        "K.I.N.G.S. Evidence Store: evidence id is required",
      );
    }

    if (!item.type.trim()) {
      throw new Error(
        `K.I.N.G.S. Evidence Store: evidence "${item.id}" requires a type`,
      );
    }

    if (!item.criterion.trim()) {
      throw new Error(
        `K.I.N.G.S. Evidence Store: evidence "${item.id}" requires a criterion`,
      );
    }

    if (!item.summary.trim()) {
      throw new Error(
        `K.I.N.G.S. Evidence Store: evidence "${item.id}" requires a summary`,
      );
    }

    if (
      !item.verificationReference.trim()
    ) {
      throw new Error(
        `K.I.N.G.S. Evidence Store: evidence "${item.id}" requires a verification reference`,
      );
    }

    if (
      this.evidence.has(item.id)
    ) {
      throw new Error(
        `K.I.N.G.S. Evidence Store: duplicate evidence id "${item.id}"`,
      );
    }

    this.evidence.set(
      item.id,
      {
        ...item,
      },
    );
  }

  get(
    evidenceId: ID,
  ): CompletionEvidence | undefined {
    const item =
      this.evidence.get(
        evidenceId,
      );

    return item
      ? { ...item }
      : undefined;
  }

  list(): CompletionEvidence[] {
    return [
      ...this.evidence.values(),
    ].map(
      (item) => ({ ...item }),
    );
  }

  query(
    query: EvidenceQuery = {},
  ): CompletionEvidence[] {
    return this.list().filter(
      (item) => {
        if (
          query.type &&
          item.type !== query.type
        ) {
          return false;
        }

        if (
          query.status &&
          item.status !== query.status
        ) {
          return false;
        }

        if (
          query.verificationReference &&
          item.verificationReference !==
            query.verificationReference
        ) {
          return false;
        }

        return true;
      },
    );
  }

  has(
    evidenceId: ID,
  ): boolean {
    return this.evidence.has(
      evidenceId,
    );
  }

  clear(): void {
    this.evidence.clear();
  }
}
