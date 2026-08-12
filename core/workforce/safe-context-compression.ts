import type {
  WorkforceResult,
} from "./types";

import type {
  ToolOutputClassificationDecision,
} from "./tool-output-classification";

export interface SafeCompressionLimits {
  minimumCharacters: number;
  minimumSavingsCharacters: number;
  minimumSavingsRatio: number;
  maximumLinesPerSection: number;
}

export interface SafeCompressionInput {
  result: WorkforceResult;
  classification: ToolOutputClassificationDecision;
  rawOutput?: string;
}

export interface SafeCompressionResult {
  resultId: string;
  originalOutput: string;
  optimizedOutput: string;
  usedOptimization: boolean;
  fallbackToOriginal: boolean;
  originalCharacters: number;
  optimizedCharacters: number;
  charactersSaved: number;
  savingsRatio: number;
  preservedVerificationReferences: string[];
  preservedArtifactIds: string[];
  preservedFailureState: boolean;
  reason: string;
}

export class SafeContextCompressionAuthority {
  constructor(
    private readonly limits: SafeCompressionLimits = {
      minimumCharacters: 1000,
      minimumSavingsCharacters: 100,
      minimumSavingsRatio: 0.05,
      maximumLinesPerSection: 20,
    },
  ) {
    if (
      limits.minimumCharacters < 1
    ) {
      throw new Error(
        "K.I.N.G.S. Safe Compression: minimumCharacters must be at least 1",
      );
    }

    if (
      limits.minimumSavingsCharacters < 1
    ) {
      throw new Error(
        "K.I.N.G.S. Safe Compression: minimumSavingsCharacters must be at least 1",
      );
    }

    if (
      limits.minimumSavingsRatio <= 0 ||
      limits.minimumSavingsRatio >= 1
    ) {
      throw new Error(
        "K.I.N.G.S. Safe Compression: minimumSavingsRatio must be greater than 0 and less than 1",
      );
    }

    if (
      limits.maximumLinesPerSection < 1
    ) {
      throw new Error(
        "K.I.N.G.S. Safe Compression: maximumLinesPerSection must be at least 1",
      );
    }
  }

  compress(
    input: SafeCompressionInput,
  ): SafeCompressionResult {
    const original =
      input.rawOutput ?? "";

    const originalCharacters =
      original.length;

    const preservedVerificationReferences =
      [
        ...input.result.verificationReferences,
      ];

    const preservedArtifactIds =
      [
        ...input.result.artifactIds,
      ];

    const preservedFailureState =
      input.result.status ===
      "failure";

    const fallback = (
      reason: string,
    ): SafeCompressionResult => ({
      resultId:
        input.result.id,
      originalOutput:
        original,
      optimizedOutput:
        original,
      usedOptimization:
        false,
      fallbackToOriginal:
        true,
      originalCharacters,
      optimizedCharacters:
        originalCharacters,
      charactersSaved:
        0,
      savingsRatio:
        0,
      preservedVerificationReferences,
      preservedArtifactIds,
      preservedFailureState,
      reason,
    });

    if (
      !input.classification.compressible
    ) {
      return fallback(
        "Output classification does not permit compression.",
      );
    }

    if (
      input.classification.stateChanging
    ) {
      return fallback(
        "State-changing output is preserved in full.",
      );
    }

    if (
      input.classification.classification ===
      "critical"
    ) {
      return fallback(
        "Critical output is preserved in full.",
      );
    }

    if (
      originalCharacters <
      this.limits.minimumCharacters
    ) {
      return fallback(
        "Output is below the safe compression threshold.",
      );
    }

    if (
      original.trim().length === 0
    ) {
      return fallback(
        "Output is empty.",
      );
    }

    let optimized: string;

    try {
      optimized =
        this.compressDeterministically(
          original,
        );
    } catch (
      error: unknown
    ) {
      return fallback(
        `Compression transformation failed: ${String(error)}`,
      );
    }

    if (
      optimized.trim().length === 0
    ) {
      return fallback(
        "Compression produced empty output.",
      );
    }

    if (
      !this.validatePreservation(
        input,
        original,
        optimized,
      )
    ) {
      return fallback(
        "Compression failed preservation validation.",
      );
    }

    const optimizedCharacters =
      optimized.length;

    if (
      optimizedCharacters >=
      originalCharacters
    ) {
      return fallback(
        "Optimized output is not smaller than the original.",
      );
    }

    const charactersSaved =
      originalCharacters -
      optimizedCharacters;

    const savingsRatio =
      charactersSaved /
      originalCharacters;

    if (
      charactersSaved <
      this.limits.minimumSavingsCharacters
    ) {
      return fallback(
        "Compression savings are below the minimum useful threshold.",
      );
    }

    if (
      savingsRatio <
      this.limits.minimumSavingsRatio
    ) {
      return fallback(
        "Compression savings ratio is below the minimum useful threshold.",
      );
    }

    return {
      resultId:
        input.result.id,
      originalOutput:
        original,
      optimizedOutput:
        optimized,
      usedOptimization:
        true,
      fallbackToOriginal:
        false,
      originalCharacters,
      optimizedCharacters,
      charactersSaved,
      savingsRatio,
      preservedVerificationReferences,
      preservedArtifactIds,
      preservedFailureState,
      reason:
        "Deterministic compression passed preservation and savings validation.",
    };
  }

  private compressDeterministically(
    value: string,
  ): string {
    const normalized =
      value
        .replace(
          /\r\n/g,
          "\n",
        )
        .replace(
          /\r/g,
          "\n",
        );

    const lines =
      normalized.split(
        "\n",
      );

    const output: string[] = [];

    let previousLine:
      string | undefined;

    let blankLinePending =
      false;

    for (
      const originalLine of
        lines
    ) {
      const line =
        originalLine
          .replace(
            /[ \t]+$/g,
            "",
          )
          .replace(
            /^[ \t]+/g,
            (indentation) =>
              indentation.length > 2
                ? "  "
                : indentation,
          );

      if (
        line.trim().length === 0
      ) {
        if (
          output.length > 0
        ) {
          blankLinePending =
            true;
        }

        continue;
      }

      if (
        previousLine !==
          undefined &&
        this.normalizeLine(
          previousLine,
        ) ===
          this.normalizeLine(
            line,
          )
      ) {
        continue;
      }

      if (
        blankLinePending &&
        output.length > 0
      ) {
        output.push("");
      }

      blankLinePending =
        false;

      output.push(
        line,
      );

      previousLine =
        line;
    }

    const bounded =
      this.boundRepeatedDiagnosticSections(
        output,
      );

    return bounded.join(
      "\n",
    );
  }

  private boundRepeatedDiagnosticSections(
    lines: string[],
  ): string[] {
    if (
      lines.length <=
      this.limits.maximumLinesPerSection
    ) {
      return lines;
    }

    const output: string[] = [];

    let previousNormalized:
      string | undefined;

    let repeatedCount =
      0;

    for (
      const line of
        lines
    ) {
      const normalized =
        this.normalizeLine(
          line,
        );

      if (
        normalized.length > 0 &&
        normalized ===
          previousNormalized
      ) {
        repeatedCount += 1;

        if (
          repeatedCount >=
          this.limits.maximumLinesPerSection
        ) {
          continue;
        }
      } else {
        repeatedCount =
          0;
      }

      output.push(
        line,
      );

      previousNormalized =
        normalized;
    }

    return output;
  }

  private validatePreservation(
    input: SafeCompressionInput,
    original: string,
    optimized: string,
  ): boolean {
    if (
      input.result.status ===
      "failure"
    ) {
      if (
        !optimized.toLowerCase().includes(
          "fail",
        )
      ) {
        return false;
      }
    }

    for (
      const reference of
        input.result.verificationReferences
    ) {
      if (
        !this.containsSemanticIdentifier(
          optimized,
          reference,
        )
      ) {
        return false;
      }
    }

    for (
      const artifactId of
        input.result.artifactIds
    ) {
      if (
        !this.containsSemanticIdentifier(
          optimized,
          artifactId,
        )
      ) {
        return false;
      }
    }

    if (
      input.classification.evidenceBearing
    ) {
      const evidenceSignals = [
        "evidence",
        "verification",
        "verified",
        "validation",
        "validated",
        "proof",
        "audit",
        "assertion",
      ];

      const originalEvidence =
        evidenceSignals.some(
          (signal) =>
            original
              .toLowerCase()
              .includes(
                signal,
              ),
        );

      const optimizedEvidence =
        evidenceSignals.some(
          (signal) =>
            optimized
              .toLowerCase()
              .includes(
                signal,
              ),
        );

      if (
        originalEvidence &&
        !optimizedEvidence
      ) {
        return false;
      }
    }

    return true;
  }

  private containsSemanticIdentifier(
    content: string,
    identifier: string,
  ): boolean {
    if (
      identifier.trim().length === 0
    ) {
      return true;
    }

    return content.includes(
      identifier,
    );
  }

  private normalizeLine(
    value: string,
  ): string {
    return value
      .trim()
      .replace(
        /\s+/g,
        " ",
      )
      .toLowerCase();
  }
}
