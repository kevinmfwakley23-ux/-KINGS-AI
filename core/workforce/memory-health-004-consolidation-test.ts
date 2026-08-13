import {
  MemoryConsolidationAuthority,
} from "./memory-health-004-consolidation";

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
  const authority =
    new MemoryConsolidationAuthority();

  const observations = [
    {
      id:
        "observation-001",

      content:
        "The Rust capability requires the Rust toolchain.",

      subject:
        "rust-toolchain",

      observedAt:
        "2026-08-13T17:00:00.000Z",

      provenance: [
        "research:005k",
        "source:rust-official",
      ],
    },

    {
      id:
        "observation-002",

      content:
        "The Rust capability requires the Rust toolchain.",

      subject:
        "rust-toolchain",

      observedAt:
        "2026-08-13T17:01:00.000Z",

      provenance: [
        "research:005k",
        "source:rust-official",
      ],
    },

    {
      id:
        "observation-003",

      content:
        "The Rust capability requires the Rust toolchain.",

      subject:
        "rust-toolchain",

      observedAt:
        "2026-08-13T17:02:00.000Z",

      provenance: [
        "research:005j",
        "source:rust-official",
      ],
    },
  ];

  const consolidated =
    authority.consolidate(
      observations,
    );

  assert(
    consolidated.observationCount ===
      3,

    "Consolidation must retain the number of source observations.",
  );

  assert(
    consolidated.candidate.verified ===
      false,

    "Consolidated knowledge must begin as unverified candidate knowledge.",
  );

  assert(
    consolidated.candidate.lifecycle.lifecycleClass ===
      "semantic",

    "Consolidated factual knowledge must classify as semantic memory.",
  );

  assert(
    consolidated.candidate.lifecycle.authority ===
      "candidate",

    "Consolidated knowledge must remain candidate authority until verification.",
  );

  console.log(
    "001.MEMORY-HEALTH-004 episodic observations → knowledge candidate: SUCCESS",
  );

  assert(
    consolidated.candidate.sourceObservationIds.length ===
      3,

    "The candidate must preserve every source observation identity.",
  );

  assert(
    consolidated.candidate.provenance.includes(
      "observation:observation-001",
    ),

    "Candidate provenance must retain observation-001.",
  );

  assert(
    consolidated.candidate.provenance.includes(
      "observation:observation-002",
    ),

    "Candidate provenance must retain observation-002.",
  );

  assert(
    consolidated.candidate.provenance.includes(
      "observation:observation-003",
    ),

    "Candidate provenance must retain observation-003.",
  );

  console.log(
    "002.MEMORY-HEALTH-004 consolidation provenance preservation: SUCCESS",
  );

  let rejected =
    false;

  try {
    authority.verify(
      consolidated.candidate,
      [],
    );
  } catch {
    rejected =
      true;
  }

  assert(
    rejected,

    "Knowledge promotion must reject missing verification evidence.",
  );

  console.log(
    "003.MEMORY-HEALTH-004 verification evidence gate: SUCCESS",
  );

  const verified =
    authority.verify(
      consolidated.candidate,
      [
        "evidence:independent-source-confirmation",
        "evidence:toolchain-capability-verification",
      ],
    );

  assert(
    verified.lifecycle.lifecycleClass ===
      "authoritative",

    "Verified consolidated knowledge must become authoritative memory.",
  );

  assert(
    verified.lifecycle.authority ===
      "authoritative",

    "Verified consolidated knowledge must receive authoritative authority.",
  );

  assert(
    verified.lifecycle.durable ===
      true,

    "Verified consolidated knowledge must be durable.",
  );

  console.log(
    "004.MEMORY-HEALTH-004 verified candidate → authoritative knowledge: SUCCESS",
  );

  assert(
    verified.verificationEvidence.length ===
      2,

    "All verification evidence must be retained.",
  );

  assert(
    verified.provenance.includes(
      "candidate:" +
        consolidated.candidate.id,
    ),

    "Promotion must preserve candidate provenance.",
  );

  assert(
    verified.provenance.includes(
      "research:005k",
    ),

    "Promotion must preserve research provenance.",
  );

  console.log(
    "005.MEMORY-HEALTH-004 verification + provenance preservation: SUCCESS",
  );

  let subjectRejected =
    false;

  try {
    authority.consolidate([
      observations[0],
      {
        ...observations[1],

        subject:
          "different-subject",
      },
    ]);
  } catch {
    subjectRejected =
      true;
  }

  assert(
    subjectRejected,

    "Unrelated observations must not be silently consolidated together.",
  );

  console.log(
    "006.MEMORY-HEALTH-004 unrelated-observation consolidation protection: SUCCESS",
  );

  console.log(
    "MEMORY-HEALTH-004 EPISODIC OBSERVATIONS → VERIFIED KNOWLEDGE CONSOLIDATION: SUCCESS",
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
