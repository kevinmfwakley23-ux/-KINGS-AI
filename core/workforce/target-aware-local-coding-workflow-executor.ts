import type {
  ID,
} from "./types";

import type {
  ModelDrivenWorkUnit,
} from "./model-driven-workflow-executor";

import {
  LocalCodingVerificationLoop,
  type LocalCodingVerificationResult,
} from "./local-coding-verification-loop";

export interface TargetAwareLocalCodingExecutionRequest {
  id:
    ID;

  missionId:
    ID;

  workspacePath:
    string;

  workUnit:
    ModelDrivenWorkUnit;

  instruction:
    string;

  maxFileBytes:
    number;

  maxOutputTokens:
    number;

  maxRepairAttempts:
    number;
}

export interface TargetAwareLocalCodingExecutionResult {
  success:
    boolean;

  workUnitId:
    ID;

  targetPath:
    string;

  verification:
    LocalCodingVerificationResult;

  evidence:
    readonly string[];
}

export class TargetAwareLocalCodingWorkflowExecutor {
  constructor(
    private readonly verification:
      LocalCodingVerificationLoop =
        new LocalCodingVerificationLoop(),
  ) {}

  async execute(
    request:
      TargetAwareLocalCodingExecutionRequest,
  ): Promise<TargetAwareLocalCodingExecutionResult> {
    if (
      !request.workUnit.approved
    ) {
      throw new Error(
        `K.I.N.G.S. Target-Aware Coding: work unit "${request.workUnit.id}" is not approved.`,
      );
    }

    if (
      !request.workUnit.targetPath.trim()
    ) {
      throw new Error(
        `K.I.N.G.S. Target-Aware Coding: work unit "${request.workUnit.id}" has no target path.`,
      );
    }

    if (
      !request.workUnit.allowedPaths.includes(
        request.workUnit.targetPath,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Target-Aware Coding: target "${request.workUnit.targetPath}" is not authorized by work unit "${request.workUnit.id}".`,
      );
    }

    const enrichedInstruction = [
      request.instruction,
      "",
      "K.I.N.G.S. AUTHORIZED WORK UNIT",
      `WORK UNIT: ${request.workUnit.id}`,
      `TARGET: ${request.workUnit.targetPath}`,
      "",
      "Acceptance criteria:",
      ...request.workUnit.acceptanceCriteria.map(
        (criterion) =>
          `- ${criterion}`,
      ),
      "",
      "Required evidence:",
      ...request.workUnit.requiredEvidenceTypes.map(
        (evidence) =>
          `- ${evidence}`,
      ),
      "",
      "Use only authorized paths.",
      "Complete only the requested target artifact.",
    ].join("\n");

    const verification =
      await this.verification.execute({
        taskId:
          request.workUnit.id,

        missionId:
          request.missionId,

        instruction:
          enrichedInstruction,

        workspacePath:
          request.workspacePath,

        targetPath:
          request.workUnit.targetPath,

        allowedReadPaths:
          request.workUnit.allowedPaths,

        allowedWritePaths:
          request.workUnit.allowedPaths,

        maxFileBytes:
          request.maxFileBytes,

        maxOutputTokens:
          request.maxOutputTokens,

        maxRepairAttempts:
          request.maxRepairAttempts,
      });

    const evidence = [
      `target-aware-coding:work-unit:${request.workUnit.id}`,
      `target-aware-coding:target:${request.workUnit.targetPath}`,
      verification.success
        ? "target-aware-coding:verified"
        : "target-aware-coding:verification-failed",
      ...verification.writtenPaths.map(
        (path) =>
          `target-aware-coding:written:${path}`,
      ),
    ];

    return {
      success:
        verification.success,

      workUnitId:
        request.workUnit.id,

      targetPath:
        request.workUnit.targetPath,

      verification,

      evidence,
    };
  }
}
