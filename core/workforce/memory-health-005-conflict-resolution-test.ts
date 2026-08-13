import {
  MemoryConflictResolutionAuthority,
  type KnowledgeRecord,
} from "./memory-health-005-conflict-resolution";

import {
  MemoryLifecycleClassifier,
} from "./memory-health-001-lifecycle";

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

function candidateKnowledge(
  id:
    string,

  claim:
    string,
):
  KnowledgeRecord {
  const classifier =
    new MemoryLifecycleClassifier();

  return {
    id,

    subject:
      "rust-toolchain",

    claim,

    provenance: [
      `source:${id}`,
    ],

    verificationEvidence: [],

    lifecycle:
      classifier.classify({
        kind:
          "fact",

        verified:
          false,

        superseded:
          false,
      }),
  };
}

function verifiedKnowledge(
  id:
    string,

  claim:
    string,
):
  KnowledgeRecord {
  const classifier =
    new MemoryLifecycleClassifier();

  return {
    id,

    subject:
      "rust-toolchain",

    claim,

    provenance: [
      `source:${id}`,
    ],

    verificationEvidence: [
      `verification:${id}`,
    ],

    lifecycle:
      classifier.classify({
        kind:
          "verified-knowledge",

        verified:
          true,

        superseded:
          false,
      }),
  };
}

async function main():
  Promise<void> {
  const authority =
    new MemoryConflictResolutionAuthority();

  const existing =
    candidateKnowledge(
      "knowledge-old",
      "Rust requires cargo for this capability.",
    );

  const incoming =
    candidateKnowledge(
      "knowledge-new",
      "Rust does not require cargo for this capability.",
    );

  const conflict =
    authority.detectConflict(
      existing,
      incoming,
    );

  assert(
    conflict.detected,
    "Conflicting claims about the same subject must be detected.",
  );

  console.log(
    "001.MEMORY-HEALTH-005 contradiction detection: SUCCESS",
  );

  const unrelated =
    authority.detectConflict(
      existing,
      {
        ...incoming,

        subject:
          "python-runtime",
      },
    );

  assert(
    !unrelated.detected,
    "Different subjects must not be falsely classified as conflicts.",
  );

  console.log(
    "002.MEMORY-HEALTH-005 unrelated-knowledge protection: SUCCESS",
  );

  let rejected =
    false;

  try {
    authority.resolve(
      conflict,
      [],
      "2026-08-13T18:00:00.000Z",
    );
  } catch {
    rejected =
      true;
  }

  assert(
    rejected,
    "Conflict resolution must require explicit resolution evidence.",
  );

  console.log(
    "003.MEMORY-HEALTH-005 resolution evidence gate: SUCCESS",
  );

  const verifiedExisting =
    verifiedKnowledge(
      "knowledge-verified-old",
      "Rust requires cargo for this capability.",
    );

  const unverifiedIncoming =
    candidateKnowledge(
      "knowledge-unverified-new",
      "Rust does not require cargo for this capability.",
    );

  const verifiedConflict =
    authority.detectConflict(
      verifiedExisting,
      unverifiedIncoming,
    );

  let protectedExisting =
    false;

  try {
    authority.resolve(
      verifiedConflict,
      [
        "evidence:insufficient-to-overturn-verified-knowledge",
      ],
      "2026-08-13T18:01:00.000Z",
    );
  } catch {
    protectedExisting =
      true;
  }

  assert(
    protectedExisting,
    "Unverified incoming knowledge must not automatically overturn verified knowledge.",
  );

  console.log(
    "004.MEMORY-HEALTH-005 verified-knowledge protection: SUCCESS",
  );

  const verifiedIncoming =
    verifiedKnowledge(
      "knowledge-verified-new",
      "Rust does not require cargo for this capability.",
    );

  const authoritativeConflict =
    authority.detectConflict(
      verifiedExisting,
      verifiedIncoming,
    );

  const resolution =
    authority.resolve(
      authoritativeConflict,
      [
        "evidence:official-toolchain-documentation",
        "evidence:independent-runtime-verification",
      ],
      "2026-08-13T18:02:00.000Z",
    );

  assert(
    resolution.retained.id ===
      "knowledge-verified-new",
    "The higher-authority incoming knowledge must become the retained record.",
  );

  assert(
    resolution.retained.lifecycle.authority ===
      "authoritative",
    "Resolved retained knowledge must become authoritative.",
  );

  assert(
    resolution.retained.lifecycle.lifecycleClass ===
      "authoritative",
    "Resolved retained knowledge must use the authoritative lifecycle class.",
  );

  console.log(
    "005.MEMORY-HEALTH-005 verified conflict resolution: SUCCESS",
  );

  assert(
    resolution.superseded.id ===
      "knowledge-verified-old",
    "The replaced knowledge must be explicitly identified as superseded.",
  );

  assert(
    resolution.superseded.lifecycle.lifecycleClass ===
      "superseded",
    "Replaced knowledge must enter the superseded lifecycle.",
  );

  assert(
    resolution.superseded.lifecycle.active ===
      false,
    "Superseded knowledge must leave active memory.",
  );

  assert(
    resolution.superseded.lifecycle.durable ===
      true,
    "Superseded knowledge must remain durable history.",
  );

  console.log(
    "006.MEMORY-HEALTH-005 supersession enforcement: SUCCESS",
  );

  assert(
    resolution.retained.provenance.includes(
      "superseded-by:" +
        resolution.superseded.id,
    ),
    "Retained knowledge must preserve conflict-resolution provenance.",
  );

  assert(
    resolution.superseded.provenance.includes(
      "superseded-by:" +
        resolution.retained.id,
    ),
    "Superseded knowledge must preserve the identity of its replacement.",
  );

  assert(
    resolution.resolutionEvidence.length ===
      2,
    "All conflict-resolution evidence must be preserved.",
  );

  console.log(
    "007.MEMORY-HEALTH-005 conflict provenance preservation: SUCCESS",
  );

  console.log(
    "MEMORY-HEALTH-005 CONTRADICTION → VERIFICATION → SUPERSESSION RESOLUTION: SUCCESS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    throw error;
  },
);
