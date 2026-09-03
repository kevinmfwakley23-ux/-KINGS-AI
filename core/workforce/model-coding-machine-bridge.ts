import type {
  ModelExecutionResult,
} from "./model-interface";

import {
  GovernedLocalCodingProposal,
} from "./local-coding-change-proposal";

import {
  ModelCodingProposalParser,
  type ModelCodingProposalParserOptions,
} from "./model-coding-proposal-parser";

import type {
  CodingWorkUnitExecutionRequest,
} from "./coding-work-unit-execution";

export interface ModelCodingMachineBridgeRequest {
  modelResult:
    ModelExecutionResult;

  proposalParser:
    ModelCodingProposalParserOptions;

  execution:
    Omit<
      CodingWorkUnitExecutionRequest,
      "proposal"
    >;
}

export interface ModelCodingMachineBridgeResult {
  request:
    CodingWorkUnitExecutionRequest;

  generatedProposalId:
    string;
}

export class ModelCodingMachineBridge {
  private readonly governedProposal =
    new GovernedLocalCodingProposal();

  buildRequest(
    input:
      ModelCodingMachineBridgeRequest,
  ):
    ModelCodingMachineBridgeResult {
    const parser =
      new ModelCodingProposalParser(
        input.proposalParser,
      );

    const missionId =
      input.execution.missionId ??
      input.execution.projectId;

    const proposal =
      this.governedProposal.propose({
        response:
          input.modelResult,
        request: {
          id:
            `model-coding-request-${input.execution.taskId}`,
          taskId:
            input.execution.taskId,
          missionId,
          messages: [],
          requiredCapabilities: [
            "coding",
          ],
          inputModalities: [
            "text",
          ],
          outputModality:
            "text",
          allowToolProposals:
            false,
        },
        allowedPaths:
          input.proposalParser.allowedPaths,
      }, parser);

    return {
      request: {
        ...input.execution,
        proposal,
      },
      generatedProposalId:
        proposal.id,
    };
  }
}
