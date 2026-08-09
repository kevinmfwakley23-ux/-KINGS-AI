import type {
  KnowledgeSource,
} from "./types";

import type {
  SourceInspectionRequest,
  SourceInspectionResult,
} from "./source-inspection";

import type {
  SourceInspectionAdapter,
} from "./source-inspection-adapter";

export class TestSourceInspectionAdapter
  implements SourceInspectionAdapter
{
  constructor(
    private readonly content: Map<string, string>,
    private readonly maxContentBytes = 64 * 1024,
  ) {}

  async inspect(
    source: KnowledgeSource,
    request: SourceInspectionRequest,
  ): Promise<SourceInspectionResult> {
    if (!request.relativePath) {
      throw new Error(
        "K.I.N.G.S. Test Source Adapter: relative path is required",
      );
    }

    const key =
      `${source.id}:${request.relativePath}`;

    const value = this.content.get(key);

    if (value === undefined) {
      throw new Error(
        `K.I.N.G.S. Test Source Adapter: source content "${request.relativePath}" not found`,
      );
    }

    const sizeBytes =
      new TextEncoder().encode(value).byteLength;

    if (
      sizeBytes >
      this.maxContentBytes
    ) {
      throw new Error(
        `K.I.N.G.S. Test Source Adapter: "${request.relativePath}" exceeds content limit`,
      );
    }

    return {
      sourceId: source.id,
      operation: request.operation,
      path: `${source.location}/${request.relativePath}`,
      content:
        request.operation === "content"
          ? value
          : undefined,
      sizeBytes,
      createdAt: new Date().toISOString(),
    };
  }
}
