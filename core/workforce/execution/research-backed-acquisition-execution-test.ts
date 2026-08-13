import {
  ProjectOwnerResearchPolicyAuthority,
} from "./project-owner-research-policy";

import {
  ExternalResearchAdapter,
} from "./external-research";

import {
  ResearchAcquisitionSourceGateway,
} from "./research-acquisition-source-gateway";

import {
  WebAccessAdapter,
} from "../web-access";

import {
  ResearchBackedAcquisitionExecutionAuthority,
} from "./research-backed-acquisition-execution";

function assert(
  condition:
    boolean,

  message:
    string,
):
  void {
  if (
    !condition
  ) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main():
  Promise<void> {
  const now =
    Date.now();

  const approvedAt =
    new Date(
      now - 1_000,
    ).toISOString();

  const expiresAt =
    new Date(
      now +
        5 *
        60 *
        1000,
    ).toISOString();

  const ownerPolicy =
    new ProjectOwnerResearchPolicyAuthority({
      ownerId:
        "project-owner",

      projectId:
        "mission-005k",

      approvalRequired:
        true,

      allowedHosts:
        [
          "rust-lang.org",
        ],

      maxSources:
        3,

      maxDurationMs:
        10 *
        60 *
        1000,
    });

  ownerPolicy.approve({
    approvalId:
      "approval-005k-rust",

    ownerId:
      "project-owner",

    projectId:
      "mission-005k",

    taskId:
      "task-005k-rust",

    researchId:
      "research-005k-rust",

    question:
      "Find an official Rust source for governed acquisition.",

    allowedHosts:
      [
        "rust-lang.org",
      ],

    approvedAt,

    expiresAt,

    reason:
      "Project Owner approved Mission-005K research.",
  });

  const webAccess =
    new WebAccessAdapter({
      allowedHosts:
        [
          "rust-lang.org",
        ],

      allowedMethods:
        [
          "GET",
        ],

      allowedSchemes:
        [
          "https",
        ],

      maxResponseBytes:
        64 *
        1024,

      timeoutMs:
        15_000,

      maxRedirects:
        0,

      blockPrivateNetworks:
        true,
    });

  const externalResearch =
    new ExternalResearchAdapter(
      webAccess,
      ownerPolicy,
    );

  const gateway =
    new ResearchAcquisitionSourceGateway(
      externalResearch,
    );

  const discovered =
    await gateway.discover({
      researchId:
        "research-005k-rust",

      taskId:
        "task-005k-rust",

      agentId:
        "agent-005k",

      question:
        "Find an official Rust source for governed acquisition.",

      urls: [
        "https://rust-lang.org/",
      ],

      maxSources:
        1,
    });

  assert(
    discovered.candidates.length >=
      1,

    "Real approved research must discover an acquisition source.",
  );

  console.log(
    "001.005K real approved source discovery: SUCCESS",
  );

  const rawCandidate =
    discovered.candidates[0];

  if (
    !rawCandidate
  ) {
    throw new Error(
      "Expected a discovered source candidate.",
    );
  }

  const authority =
    new ResearchBackedAcquisitionExecutionAuthority();

  const verified =
    authority.verifyCandidate(
      rawCandidate,
    );

  assert(
    verified.verified ===
      true,

    "Only an intact successful web candidate may cross the verification gate.",
  );

  assert(
    verified.sourceId ===
      rawCandidate.sourceId,

    "Verification must preserve source identity.",
  );

  console.log(
    "002.005K source verification gate: SUCCESS",
  );

  const result =
    authority.execute(
      "mission-005k",

      "rust-development",

      verified,

      {
        findingId:
          "finding-005k-rust",

        capabilityId:
          "rust-development",

        language:
          "rust",

        operation:
          "run",

        source: {
          sourceId:
            verified.sourceId,

          evidenceId:
            "evidence-005k-rust",

          title:
            "Official Rust source",

          sourceUrl:
            verified.sourceUrl,

          sourceType:
            "official-download",

          verified:
            true,

          provenance:
            rawCandidate.provenance,
        },

        strategy:
          "local-install",

        estimatedDownloadBytes:
          64 *
          1024 *
          1024,

        estimatedInstalledBytes:
          128 *
          1024 *
          1024,

        estimatedCost:
          0,

        locallyExecutable:
          true,

        remotelyExecutable:
          false,

        requiresExternalProvider:
          false,

        verified:
          true,
      },

      {
        availableStorageBytes:
          1024 *
          1024 *
          1024,

        availableMemoryBytes:
          512 *
          1024 *
          1024,

        maxLocalInstallBytes:
          256 *
          1024 *
          1024,

        localExecutionAvailable:
          true,

        remoteExecutionAvailable:
          true,
      },

      0,

      false,

      new Date(
        Date.now(),
      ).toISOString(),

      new Date(
        Date.now() +
          1_000,
      ).toISOString(),
    );

  assert(
    result.acquisitionPlan.actions.length ===
      1,

    "The verified candidate must produce one governed acquisition action.",
  );

  console.log(
    "003.005K verified candidate → acquisition action: SUCCESS",
  );

  assert(
    result.acquisitionPlan.actions[0]?.approved ===
      true,

    "The selected acquisition action must pass the acquisition approval gate.",
  );

  console.log(
    "004.005K acquisition approval gate: SUCCESS",
  );

  assert(
    result.execution.status ===
      "succeeded",

    "The governed acquisition execution must complete successfully.",
  );

  console.log(
    "005.005K governed acquisition execution: SUCCESS",
  );

  assert(
    result.completedPlan.ready ===
      true,

    "Successful acquisition execution must complete the acquisition plan.",
  );

  assert(
    result.completed ===
      true,

    "The closed-loop acquisition result must report completion.",
  );

  console.log(
    "006.005K acquisition completion state: SUCCESS",
  );

  assert(
    result.provenance.includes(
      `source:${verified.sourceId}`,
    ),

    "Final execution evidence must preserve source provenance.",
  );

  assert(
    result.provenance.includes(
      `execution:${result.execution.id}`,
    ),

    "Final execution evidence must preserve execution provenance.",
  );

  console.log(
    "007.005K research → verification → acquisition → execution provenance: SUCCESS",
  );

  console.log(
    "MISSION-005K REAL RESEARCH → VERIFIED CANDIDATE → GOVERNED ACQUISITION → EXECUTION: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
