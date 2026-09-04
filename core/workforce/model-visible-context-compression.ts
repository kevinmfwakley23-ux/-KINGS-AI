import type { WorkforceResult } from "./types";
import {
  SafeContextCompressionAuthority,
  type SafeCompressionResult,
} from "./safe-context-compression";
import type { ToolOutputClassificationDecision } from "./tool-output-classification";

export type ModelVisibleContextKind =
  | "repository"
  | "tool-output"
  | "diagnostic";

export interface ModelVisibleContextCompressionRequest {
  id: string;
  taskId: string;
  agentId: string;
  kind: ModelVisibleContextKind;
  content: string;
  failed?: boolean;
  evidenceBearing?: boolean;
  stateChanging?: boolean;
  verificationReferences?: string[];
  artifactIds?: string[];
  /**
   * Semantic anchors that must survive deterministic compression. Repository
   * symbol names, source-path markers, diagnostic codes, or other caller-owned
   * identifiers belong here. Missing anchors force an original-context fallback.
   */
  requiredAnchors?: string[];
}

export interface ModelVisibleContextCompressionResult
  extends SafeCompressionResult {
  kind: ModelVisibleContextKind;
  requiredAnchors: string[];
  preservedRequiredAnchors: boolean;
}

export class ModelVisibleContextCompressionAuthority {
  constructor(
    private readonly compressor: SafeContextCompressionAuthority =
      new SafeContextCompressionAuthority(),
  ) {}

  compress(
    request: ModelVisibleContextCompressionRequest,
  ): ModelVisibleContextCompressionResult {
    const verificationReferences = request.verificationReferences ?? [];
    const artifactIds = request.artifactIds ?? [];
    const result: WorkforceResult = {
      id: request.id,
      taskId: request.taskId,
      agentId: request.agentId,
      status: request.failed ? "failure" : "success",
      summary: `Bounded ${request.kind} model-visible context.`,
      artifactIds,
      reasoning: undefined,
      verificationReferences,
      createdAt: new Date().toISOString(),
    };

    const classification: ToolOutputClassificationDecision = {
      resultId: request.id,
      classification:
        request.stateChanging ? "critical" : "compressible",
      reasons: [
        `K.I.N.G.S. deterministic ${request.kind} context compression adapter.`,
      ],
      preserveOriginal: true,
      compressible: !request.stateChanging,
      evidenceBearing: request.evidenceBearing ?? false,
      stateChanging: request.stateChanging ?? false,
    };

    const compressed = this.compressor.compress({
      result,
      classification,
      rawOutput: request.content,
    });
    const anchors = [...new Set(
      (request.requiredAnchors ?? [])
        .map((anchor) => anchor.trim())
        .filter(Boolean),
    )];
    const preservedRequiredAnchors = anchors.every((anchor) =>
      compressed.optimizedOutput.includes(anchor),
    );

    if (!preservedRequiredAnchors && compressed.usedOptimization) {
      return {
        ...compressed,
        kind: request.kind,
        optimizedOutput: request.content,
        usedOptimization: false,
        fallbackToOriginal: true,
        optimizedCharacters: request.content.length,
        charactersSaved: 0,
        savingsRatio: 0,
        reason:
          "Compression was rejected because a caller-required semantic anchor was not preserved.",
        requiredAnchors: anchors,
        preservedRequiredAnchors: false,
      };
    }

    return {
      ...compressed,
      kind: request.kind,
      requiredAnchors: anchors,
      preservedRequiredAnchors,
    };
  }
}
