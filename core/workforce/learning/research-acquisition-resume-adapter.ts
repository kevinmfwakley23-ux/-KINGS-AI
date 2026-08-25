import type { ID } from "../types";
import type {
  EngineeringLanguage,
  EngineeringToolchain,
  ToolchainOperation,
} from "../engineering-toolchain";
import type { ResearchBackedAcquisitionExecutionResult } from "../execution/research-backed-acquisition-execution";
import type { MissionLearningController } from "../mission-learning-controller";

export interface LearnedEngineeringCapability {
  capabilityId: ID;
  language: EngineeringLanguage;
  operation: ToolchainOperation;
  sourceId: ID;
  sourceUrl: string;
  verificationEvidence: string;
  acquisitionExecutionId: ID;
  verified: true;
  acquiredAt: string;
}

export interface ResearchAcquisitionResumeRequest {
  learningRecordId: ID;
  capabilityId: ID;
  language: EngineeringLanguage;
  operation: ToolchainOperation;
  acquisition: ResearchBackedAcquisitionExecutionResult;
}

export interface ResearchAcquisitionResumeResult {
  learnedCapability: LearnedEngineeringCapability;
  toolchainReady: boolean;
  learningRecordId: ID;
  taskReadyToResume: boolean;
}

/**
 * Converts an approved, verified research-backed acquisition result into a
 * reusable engineering-capability record and releases the mission-learning
 * blocker for explicit resume.
 *
 * This adapter deliberately does not install binaries or grant execution
 * authority. The acquisition authority owns resource/execution approval;
 * this component records verified capability provenance and mission readiness.
 */
export class ResearchAcquisitionResumeAdapter {
  constructor(
    private readonly learning: MissionLearningController,
  ) {}

  complete(
    request: ResearchAcquisitionResumeRequest,
  ): ResearchAcquisitionResumeResult {
    if (!request.acquisition.completed) {
      throw new Error(
        "K.I.N.G.S. Research Acquisition Resume: acquisition is not completed",
      );
    }

    if (!request.acquisition.candidate.verified) {
      throw new Error(
        "K.I.N.G.S. Research Acquisition Resume: acquisition candidate is not verified",
      );
    }

    const learnedCapability: LearnedEngineeringCapability = {
      capabilityId: request.capabilityId,
      language: request.language,
      operation: request.operation,
      sourceId: request.acquisition.candidate.sourceId,
      sourceUrl: request.acquisition.candidate.sourceUrl,
      verificationEvidence: request.acquisition.candidate.verificationEvidence,
      acquisitionExecutionId: request.acquisition.execution.id,
      verified: true,
      acquiredAt: new Date().toISOString(),
    };

    this.learning.markReadyToResume(request.learningRecordId);

    return {
      learnedCapability,
      toolchainReady: true,
      learningRecordId: request.learningRecordId,
      taskReadyToResume: true,
    };
  }
}

export function learnedCapabilitySupportsToolchain(
  toolchain: EngineeringToolchain,
  learned: LearnedEngineeringCapability,
): boolean {
  return (
    toolchain.language === learned.language &&
    toolchain.enabled &&
    toolchain.commands.some(
      (command) => command.operation === learned.operation,
    )
  );
}
