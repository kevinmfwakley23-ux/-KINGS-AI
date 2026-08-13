import type {
  ID,
} from "../types";

import type {
  EngineeringLanguage,
  ToolchainOperation,
} from "../engineering-toolchain";

import {
  CapabilityAcquisitionAuthority,
} from "../capability-acquisition";

import {
  CapabilityAcquisitionExecutionAuthority,
} from "../capability-acquisition-execution";

import {
  ResearchBackedCapabilityAcquisitionAuthority,
  type ResearchAcquisitionFinding,
} from "../research-backed-capability-acquisition";

import type {
  ResourceSnapshot,
} from "../resource-aware-capability-acquisition";

export interface VerifiedAcquisitionCandidate {
  candidateId:
    ID;

  researchId:
    ID;

  sourceId:
    ID;

  sourceUrl:
    string;

  content:
    string;

  verified:
    true;

  verificationEvidence:
    string;
}

export interface ResearchBackedAcquisitionExecutionResult {
  candidate:
    VerifiedAcquisitionCandidate;

  acquisitionPlan:
    ReturnType<
      CapabilityAcquisitionAuthority["createPlan"]
    >;

  execution:
    ReturnType<
      CapabilityAcquisitionExecutionAuthority["start"]
    >;

  completedPlan:
    ReturnType<
      CapabilityAcquisitionExecutionAuthority["completeAction"]
    >;

  completed:
    boolean;

  provenance:
    string;
}

const ENGINEERING_LANGUAGES:
  readonly EngineeringLanguage[] = [
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "css",
  "html",
  "sql",
  "shell",
];

const TOOLCHAIN_OPERATIONS:
  readonly ToolchainOperation[] = [
  "create",
  "format",
  "lint",
  "typecheck",
  "compile",
  "build",
  "run",
  "test",
  "package",
];

function isEngineeringLanguage(
  value:
    string,
):
  value is EngineeringLanguage {
  return ENGINEERING_LANGUAGES.includes(
    value as EngineeringLanguage,
  );
}

function isToolchainOperation(
  value:
    string,
):
  value is ToolchainOperation {
  return TOOLCHAIN_OPERATIONS.includes(
    value as ToolchainOperation,
  );
}

function requireEngineeringLanguage(
  value:
    string,
):
  EngineeringLanguage {
  if (
    !isEngineeringLanguage(
      value,
    )
  ) {
    throw new Error(
      `K.I.N.G.S. Research-Backed Acquisition Execution: unsupported engineering language "${value}"`,
    );
  }

  return value;
}

function requireToolchainOperation(
  value:
    string,
):
  ToolchainOperation {
  if (
    !isToolchainOperation(
      value,
    )
  ) {
    throw new Error(
      `K.I.N.G.S. Research-Backed Acquisition Execution: unsupported toolchain operation "${value}"`,
    );
  }

  return value;
}

export class ResearchBackedAcquisitionExecutionAuthority {
  private readonly researchAcquisition =
    new ResearchBackedCapabilityAcquisitionAuthority();

  private readonly acquisition =
    new CapabilityAcquisitionAuthority();

  private readonly execution =
    new CapabilityAcquisitionExecutionAuthority();

  verifyCandidate(
    candidate: {
      candidateId:
        ID;

      researchId:
        ID;

      sourceId:
        ID;

      finalUrl:
        string;

      status:
        number;

      content:
        string;

      provenance:
        string;

      verified:
        false;
    },
  ):
    VerifiedAcquisitionCandidate {
    if (
      candidate.verified
    ) {
      throw new Error(
        "K.I.N.G.S. Research-Backed Acquisition Execution: candidate is already verified",
      );
    }

    if (
      candidate.status <
        200 ||
      candidate.status >=
        400
    ) {
      throw new Error(
        "K.I.N.G.S. Research-Backed Acquisition Execution: candidate does not contain a successful web response",
      );
    }

    if (
      !candidate.content.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Research-Backed Acquisition Execution: candidate has no source content",
      );
    }

    if (
      !candidate.finalUrl.startsWith(
        "https://",
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Research-Backed Acquisition Execution: candidate must use HTTPS",
      );
    }

    return {
      candidateId:
        candidate.candidateId,

      researchId:
        candidate.researchId,

      sourceId:
        candidate.sourceId,

      sourceUrl:
        candidate.finalUrl,

      content:
        candidate.content,

      verified:
        true,

      verificationEvidence:
        [
          `candidate:${candidate.candidateId}`,
          `research:${candidate.researchId}`,
          `source:${candidate.sourceId}`,
          `status:${candidate.status}`,
          `url:${candidate.finalUrl}`,
          "verification:web-response-integrity",
        ].join(
          " | ",
        ),
    };
  }

  execute(
    projectId:
      ID,

    capabilityId:
      ID,

    candidate:
      VerifiedAcquisitionCandidate,

    finding:
      ResearchAcquisitionFinding,

    resources:
      ResourceSnapshot,

    budgetLimit:
      number,

    projectOwnerApprovedRemote:
      boolean,

    startedAt:
      string,

    completedAt:
      string,
  ):
    ResearchBackedAcquisitionExecutionResult {
    const language =
      requireEngineeringLanguage(
        finding.language,
      );

    const operation =
      requireToolchainOperation(
        finding.operation,
      );

    const researchPlan =
      this.researchAcquisition.createPlan({
        projectId,

        capabilityId,

        findings: [
          {
            ...finding,

            language,

            operation,

            verified:
              true,

            source: {
              ...finding.source,

              verified:
                true,
            },
          },
        ],

        resources,

        budgetLimit,

        projectOwnerApprovedRemote,
      });

    if (
      !researchPlan.ready
    ) {
      throw new Error(
        "K.I.N.G.S. Research-Backed Acquisition Execution: research-backed acquisition plan is not ready",
      );
    }

    const selected =
      researchPlan.resourcePlan.selectedOption;

    const strategy =
      selected.strategy ===
        "remote-provider"
        ? "external-provider" as const
        : selected.strategy ===
            "local-install"
          ? "local-install" as const
          : "existing-runtime" as const;

    const capabilityGapPlan = {
      id:
        `capability-gap-plan-${projectId}`,

      projectId,

      gaps: [
        {
          id:
            capabilityId,

          projectId,

          kind:
            "language" as const,

          language,

          operation,

          resolved:
            true,

          verified:
            true,
        },
      ],

      ready:
        true,
    };

    const acquisitionPlan =
      this.acquisition.createPlan({
        plan:
          capabilityGapPlan,

        budgetLimit,
      });

    const selectedActionId =
      acquisitionPlan.actions[0]?.id;

    if (
      !selectedActionId
    ) {
      throw new Error(
        "K.I.N.G.S. Research-Backed Acquisition Execution: acquisition plan produced no action",
      );
    }

    const alignedPlan = {
      ...acquisitionPlan,

      actions:
        acquisitionPlan.actions.map(
          (
            action,
          ) =>
            action.id ===
              selectedActionId
              ? {
                  ...action,

                  strategy,

                  estimatedCost:
                    selected.estimatedCost,

                  requiresExternalProvider:
                    selected.requiresExternalProvider,
                }
              : action,
        ),
    };

    const approvedPlan =
      this.acquisition.approve(
        alignedPlan,
        selectedActionId,
      );

    const execution =
      this.execution.start(
        approvedPlan,
        selectedActionId,
        startedAt,
      );

    const succeeded =
      this.execution.succeed(
        execution,
        [
          candidate.verificationEvidence,
          researchPlan.provenance,
          `selected-option:${selected.id}`,
          `location:${selected.location}`,
          `storage-impact:${researchPlan.resourcePlan.storageImpactBytes}`,
        ].join(
          " | ",
        ),
        completedAt,
      );

    const completedPlan =
      this.execution.completeAction(
        approvedPlan,
        succeeded,
      );

    return {
      candidate,

      acquisitionPlan:
        approvedPlan,

      execution:
        succeeded,

      completedPlan,

      completed:
        completedPlan.ready,

      provenance:
        [
          candidate.verificationEvidence,
          researchPlan.provenance,
          `execution:${succeeded.id}`,
          `completed:${completedPlan.ready}`,
        ].join(
          " | ",
        ),
    };
  }
}
