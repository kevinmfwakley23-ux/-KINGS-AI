import type {
  ID,
} from "./types";

import type {
  HumanReviewDecision,
} from "./review-authority";

export class ReviewRecordStore {
  private readonly records =
    new Map<ID, HumanReviewDecision>();

  save(
    decision:
      HumanReviewDecision,
  ): void {
    if (!decision.id.trim()) {
      throw new Error(
        "K.I.N.G.S. Review Record Store: review id is required",
      );
    }

    if (this.records.has(decision.id)) {
      throw new Error(
        `K.I.N.G.S. Review Record Store: review "${decision.id}" already exists`,
      );
    }

    this.records.set(
      decision.id,
      { ...decision },
    );
  }

  update(
    decision:
      HumanReviewDecision,
  ): void {
    if (!this.records.has(decision.id)) {
      throw new Error(
        `K.I.N.G.S. Review Record Store: review "${decision.id}" was not found`,
      );
    }

    this.records.set(
      decision.id,
      { ...decision },
    );
  }

  get(
    id:
      ID,
  ):
    HumanReviewDecision |
    undefined {
    const record =
      this.records.get(id);

    return record
      ? { ...record }
      : undefined;
  }

  list():
    HumanReviewDecision[] {
    return [
      ...this.records.values(),
    ].map(
      (record) => ({ ...record }),
    );
  }
}
