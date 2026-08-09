import type {
  KnowledgeSource,
} from "./types";

import type {
  SourceInspectionRequest,
  SourceInspectionResult,
} from "./source-inspection";

export interface SourceInspectionAdapter {
  inspect(
    source: KnowledgeSource,
    request: SourceInspectionRequest,
  ): Promise<SourceInspectionResult>;
}
