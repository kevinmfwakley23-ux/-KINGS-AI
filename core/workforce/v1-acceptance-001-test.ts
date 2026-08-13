import {
  V1AcceptanceAuthority,
} from "./v1-acceptance-001";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function main(): void {
  const authority =
    new V1AcceptanceAuthority();

  const accepted =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-001",

      completion: {
        taskId:
          "task-v1-acceptance-001",
        passed: true,
        reasons: [],
        evidenceIds: [
          "evidence-typecheck",
          "evidence-test",
        ],
      },

      engineeringCompletion: {
        id:
          "completion-task-v1-acceptance-001",

        projectId:
          "project-kings",

        taskId:
          "task-v1-acceptance-001",

        completed:
          true,

        reason:
          "All required engineering criteria have verified evidence.",

        verificationId:
          "verification-gate-project-kings",

        unmetCriteria: [],
      },

      artifactCompletion: {
        artifactId:
          "artifact-v1-acceptance-001",

        passed:
          true,

        evidenceIds: [
          "evidence-artifact",
        ],

        reasons: [],
      },

      reviewAcceptance: {
        accepted:
          true,

        reasons: [],
      },
    });

  assert(
    accepted.accepted,
    "All passing acceptance components must produce an accepted result.",
  );

  assert(
    accepted.reasons.length === 0,
    "Accepted work must contain no rejection reasons.",
  );

  assert(
    accepted.evidenceIds.includes(
      "evidence-typecheck",
    ),
    "Completion evidence must be preserved.",
  );

  assert(
    accepted.evidenceIds.includes(
      "evidence-artifact",
    ),
    "Artifact evidence must be preserved.",
  );

  assert(
    accepted.verificationIds.includes(
      "verification-gate-project-kings",
    ),
    "Engineering verification identity must be preserved.",
  );

  assert(
    accepted.componentDecisions
      .completion,
    "Completion component decision must be recorded.",
  );

  assert(
    accepted.componentDecisions
      .engineeringCompletion === true,
    "Engineering completion decision must be recorded.",
  );

  assert(
    accepted.componentDecisions
      .artifactCompletion === true,
    "Artifact completion decision must be recorded.",
  );

  assert(
    accepted.componentDecisions
      .reviewAcceptance === true,
    "Review acceptance decision must be recorded.",
  );

  console.log(
    "001.V1-ACCEPTANCE-001 accepted composition: SUCCESS",
  );

  const completionRejected =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-rejected",

      completion: {
        taskId:
          "task-v1-acceptance-rejected",

        passed:
          false,

        reasons: [
          "Required evidence type \"test\" is missing.",
        ],

        evidenceIds: [
          "evidence-typecheck",
        ],
      },
    });

  assert(
    !completionRejected.accepted,
    "Failed completion must prevent V1 acceptance.",
  );

  assert(
    completionRejected.reasons.some(
      (reason) =>
        reason.includes(
          "Completion gate:",
        ),
    ),
    "Completion rejection provenance must be preserved.",
  );

  console.log(
    "002.V1-ACCEPTANCE-001 completion rejection propagation: SUCCESS",
  );

  const engineeringRejected =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-engineering-rejected",

      completion: {
        taskId:
          "task-v1-acceptance-engineering-rejected",

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-test",
        ],
      },

      engineeringCompletion: {
        id:
          "completion-rejected",

        projectId:
          "project-kings",

        taskId:
          "task-v1-acceptance-engineering-rejected",

        completed:
          false,

        reason:
          "Engineering work cannot be completed until every required criterion is verified.",

        verificationId:
          "verification-gate-rejected",

        unmetCriteria: [
          "typecheck passes",
        ],
      },
    });

  assert(
    !engineeringRejected.accepted,
    "Failed engineering completion must prevent V1 acceptance.",
  );

  assert(
    engineeringRejected.reasons.some(
      (reason) =>
        reason.includes(
          "Engineering completion:",
        ),
    ),
    "Engineering completion rejection must be explainable.",
  );

  assert(
    engineeringRejected.reasons.some(
      (reason) =>
        reason.includes(
          "typecheck passes",
        ),
    ),
    "Engineering unmet criteria must be preserved.",
  );

  assert(
    engineeringRejected.verificationIds.includes(
      "verification-gate-rejected",
    ),
    "Rejected engineering verification identity must be preserved.",
  );

  console.log(
    "003.V1-ACCEPTANCE-001 engineering rejection propagation: SUCCESS",
  );

  const reviewRejected =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-review-rejected",

      completion: {
        taskId:
          "task-v1-acceptance-review-rejected",

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-test",
        ],
      },

      reviewAcceptance: {
        accepted:
          false,

        reasons: [
          "Owner approval is not in the approved state.",
        ],
      },
    });

  assert(
    !reviewRejected.accepted,
    "Failed review acceptance must prevent V1 acceptance.",
  );

  assert(
    reviewRejected.reasons.some(
      (reason) =>
        reason.includes(
          "Review acceptance:",
        ),
    ),
    "Review rejection must be explainable.",
  );

  console.log(
    "004.V1-ACCEPTANCE-001 review rejection propagation: SUCCESS",
  );

  const noOptionalAuthorities =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-minimal",

      completion: {
        taskId:
          "task-v1-acceptance-minimal",

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "evidence-minimal",
        ],
      },
    });

  assert(
    noOptionalAuthorities.accepted,
    "A valid completion gate must remain acceptable when optional component authorities are absent.",
  );

  assert(
    noOptionalAuthorities.componentDecisions
      .engineeringCompletion ===
      undefined,
    "Absent engineering authority must remain explicitly absent.",
  );

  assert(
    noOptionalAuthorities.componentDecisions
      .artifactCompletion ===
      undefined,
    "Absent artifact authority must remain explicitly absent.",
  );

  assert(
    noOptionalAuthorities.componentDecisions
      .reviewAcceptance ===
      undefined,
    "Absent review authority must remain explicitly absent.",
  );

  console.log(
    "005.V1-ACCEPTANCE-001 optional authority composition: SUCCESS",
  );

  const duplicateEvidence =
    authority.evaluate({
      taskId:
        "task-v1-acceptance-dedup",

      completion: {
        taskId:
          "task-v1-acceptance-dedup",

        passed:
          true,

        reasons: [],

        evidenceIds: [
          "shared-evidence",
        ],
      },

      artifactCompletion: {
        artifactId:
          "artifact-dedup",

        passed:
          true,

        evidenceIds: [
          "shared-evidence",
          "artifact-evidence",
        ],

        reasons: [],
      },
    });

  assert(
    duplicateEvidence.evidenceIds
      .filter(
        (id) =>
          id ===
          "shared-evidence",
      ).length === 1,
    "Acceptance evidence IDs must be deduplicated.",
  );

  assert(
    duplicateEvidence.evidenceIds.includes(
      "artifact-evidence",
    ),
    "Additional artifact evidence must be retained.",
  );

  console.log(
    "006.V1-ACCEPTANCE-001 evidence aggregation integrity: SUCCESS",
  );

  console.log(
    "V1-ACCEPTANCE-001 COMPOSITE ACCEPTANCE AUTHORITY: SUCCESS",
  );
}

main();
