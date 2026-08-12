import type {
  WorkforceResult,
} from "./types";

export type ToolOutputClassification =
  | "critical"
  | "relevant"
  | "redundant"
  | "noisy"
  | "evidence"
  | "state-changing"
  | "compressible";

export interface ToolOutputClassificationInput {
  result: WorkforceResult;
  rawOutput?: string;
}

export interface ToolOutputClassificationDecision {
  resultId: string;
  classification: ToolOutputClassification;
  reasons: string[];
  preserveOriginal: boolean;
  compressible: boolean;
  evidenceBearing: boolean;
  stateChanging: boolean;
}

export class ToolOutputClassificationAuthority {
  classify(
    input: ToolOutputClassificationInput,
  ): ToolOutputClassificationDecision {
    const result =
      input.result;

    const reasons: string[] = [];

    const summary =
      result.summary.trim();

    const reasoning =
      result.reasoning?.trim() ?? "";

    const rawOutput =
      input.rawOutput?.trim() ?? "";

    const combined =
      [
        summary,
        reasoning,
        rawOutput,
      ]
        .filter(
          (value) =>
            value.length > 0,
        )
        .join("\n")
        .toLowerCase();

    const verificationCount =
      result.verificationReferences.length;

    const artifactCount =
      result.artifactIds.length;

    const stateChanging =
      this.detectStateChange(
        combined,
      );

    const evidenceBearing =
      verificationCount > 0 ||
      this.detectEvidence(
        combined,
      );

    if (
      result.status ===
      "failure"
    ) {
      reasons.push(
        "Execution failure must remain visible for recovery and escalation.",
      );

      return {
        resultId:
          result.id,
        classification:
          "critical",
        reasons,
        preserveOriginal:
          true,
        compressible:
          false,
        evidenceBearing,
        stateChanging,
      };
    }

    if (
      stateChanging
    ) {
      reasons.push(
        "Output indicates a state-changing operation.",
      );

      return {
        resultId:
          result.id,
        classification:
          "state-changing",
        reasons,
        preserveOriginal:
          true,
        compressible:
          false,
        evidenceBearing,
        stateChanging:
          true,
      };
    }

    if (
      evidenceBearing
    ) {
      reasons.push(
        "Output contains verification or evidence references.",
      );

      return {
        resultId:
          result.id,
        classification:
          "evidence",
        reasons,
        preserveOriginal:
          true,
        compressible:
          true,
        evidenceBearing:
          true,
        stateChanging,
      };
    }

    if (
      artifactCount > 0
    ) {
      reasons.push(
        "Output produced one or more artifacts.",
      );

      return {
        resultId:
          result.id,
        classification:
          "relevant",
        reasons,
        preserveOriginal:
          true,
        compressible:
          true,
        evidenceBearing,
        stateChanging,
      };
    }

    if (
      this.isEmpty(
        summary,
        reasoning,
        rawOutput,
      )
    ) {
      reasons.push(
        "Output contains no meaningful execution content.",
      );

      return {
        resultId:
          result.id,
        classification:
          "noisy",
        reasons,
        preserveOriginal:
          false,
        compressible:
          true,
        evidenceBearing:
          false,
        stateChanging,
      };
    }

    if (
      this.isRedundant(
        summary,
        reasoning,
      )
    ) {
      reasons.push(
        "Summary and reasoning contain substantially repeated content.",
      );

      return {
        resultId:
          result.id,
        classification:
          "redundant",
        reasons,
        preserveOriginal:
          false,
        compressible:
          true,
        evidenceBearing,
        stateChanging,
      };
    }

    if (
      this.isCompressible(
        summary,
        reasoning,
        rawOutput,
      )
    ) {
      reasons.push(
        "Output contains sufficient substantive content to benefit from bounded compression.",
      );

      return {
        resultId:
          result.id,
        classification:
          "compressible",
        reasons,
        preserveOriginal:
          true,
        compressible:
          true,
        evidenceBearing,
        stateChanging,
      };
    }

    reasons.push(
      "Output contains task-relevant execution information.",
    );

    return {
      resultId:
        result.id,
      classification:
        "relevant",
      reasons,
      preserveOriginal:
        true,
      compressible:
        false,
      evidenceBearing,
      stateChanging,
    };
  }

  classifyMany(
    inputs:
      readonly ToolOutputClassificationInput[],
  ): ToolOutputClassificationDecision[] {
    return [
      ...inputs,
    ]
      .map(
        (input) =>
          this.classify(
            input,
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.resultId.localeCompare(
            right.resultId,
          ),
      );
  }

  private detectEvidence(
    text: string,
  ): boolean {
    const evidenceSignals = [
      "verification",
      "verified",
      "evidence",
      "validation",
      "validated",
      "test result",
      "test passed",
      "proof",
      "audit",
      "assertion",
    ];

    return evidenceSignals.some(
      (signal) =>
        text.includes(
          signal,
        ),
    );
  }

  private detectStateChange(
    text: string,
  ): boolean {
    const stateSignals = [
      "created",
      "updated",
      "deleted",
      "removed",
      "modified",
      "changed",
      "committed",
      "deployed",
      "installed",
      "migrated",
      "renamed",
      "wrote",
      "written",
      "persisted",
      "state changed",
    ];

    return stateSignals.some(
      (signal) =>
        text.includes(
          signal,
        ),
    );
  }

  private isEmpty(
    summary: string,
    reasoning: string,
    rawOutput: string,
  ): boolean {
    return (
      summary.length === 0 &&
      reasoning.length === 0 &&
      rawOutput.length === 0
    );
  }

  private isRedundant(
    summary: string,
    reasoning: string,
  ): boolean {
    if (
      summary.length === 0 ||
      reasoning.length === 0
    ) {
      return false;
    }

    const normalize =
      (value: string) =>
        value
          .toLowerCase()
          .replace(
            /[^a-z0-9\s]/g,
            " ",
          )
          .split(/\s+/)
          .filter(
            Boolean,
          );

    const summaryWords =
      new Set(
        normalize(
          summary,
        ),
      );

    const reasoningWords =
      normalize(
        reasoning,
      );

    if (
      reasoningWords.length === 0
    ) {
      return false;
    }

    const overlap =
      reasoningWords.filter(
        (word) =>
          summaryWords.has(
            word,
          ),
      ).length /
      reasoningWords.length;

    return overlap >= 0.85;
  }

  private isCompressible(
    summary: string,
    reasoning: string,
    rawOutput: string,
  ): boolean {
    const totalLength =
      summary.length +
      reasoning.length +
      rawOutput.length;

    return (
      totalLength >= 1000 ||
      rawOutput.split("\n").length >= 25
    );
  }
}
