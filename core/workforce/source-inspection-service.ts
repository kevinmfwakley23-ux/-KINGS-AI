import type {
  KnowledgeSource,
} from "./types";

import {
  validateInspectionRequest,
  type SourceInspectionPolicy,
  type SourceInspectionRequest,
  type SourceInspectionResult,
} from "./source-inspection";

import type {
  SourceInspectionAdapter,
} from "./source-inspection-adapter";

export class SourceInspectionService {
  constructor(
    private readonly policy: SourceInspectionPolicy,
    private readonly adapter: SourceInspectionAdapter,
  ) {}

  async inspect(
    source: KnowledgeSource,
    request: SourceInspectionRequest,
  ): Promise<SourceInspectionResult> {
    validateInspectionRequest(
      source,
      request,
      this.policy,
    );

    return this.adapter.inspect(
      source,
      request,
    );
  }
}
