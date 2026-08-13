import {
  MemoryIntegrityAuthority,
} from "./memory-health-006-integrity";

import {
  MemoryLifecycleClassifier,
} from "./memory-health-001-lifecycle";

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

async function main(): Promise<void> {
  const authority =
    new MemoryIntegrityAuthority();

  const classifier =
    new MemoryLifecycleClassifier();

  const envelope =
    authority.createEnvelope({
      id:
        "memory-integrity-001",

      content:
        "Verified Rust toolchain knowledge.",

      lifecycle:
        classifier.classify({
          kind:
            "verified-knowledge",

          verified:
            true,

          superseded:
            false,
        }),

      provenance: [
        "research:005k",
        "verification:rust-official",
      ],

      createdAt:
        "2026-08-13T19:00:00.000Z",

      updatedAt:
        "2026-08-13T19:00:00.000Z",
    });

  const validReport =
    authority.inspect(
      envelope,
    );

  assert(
    validReport.valid,
    "A correctly constructed durable memory envelope must pass integrity inspection.",
  );

  console.log(
    "001.MEMORY-HEALTH-006 valid durable memory integrity: SUCCESS",
  );

  const corrupted: typeof envelope = {
    ...envelope,

    content:
      "CORRUPTED CONTENT",
  };

  const corruptedReport =
    authority.inspect(
      corrupted,
    );

  assert(
    !corruptedReport.valid,
    "Modified durable memory must fail integrity inspection.",
  );

  assert(
    corruptedReport.reasons.some(
      (reason) =>
        reason.includes(
          "checksum",
        ),
    ),
    "Corruption must produce explicit checksum evidence.",
  );

  console.log(
    "002.MEMORY-HEALTH-006 corruption detection: SUCCESS",
  );

  const quarantined =
    authority.quarantine(
      corrupted,
      "2026-08-13T19:01:00.000Z",
    );

  assert(
    quarantined.report.valid ===
      false,
    "Invalid memory must be quarantined as invalid state.",
  );

  assert(
    quarantined.memory.id ===
      envelope.id,
    "Quarantine must preserve the original memory identity.",
  );

  console.log(
    "003.MEMORY-HEALTH-006 invalid memory quarantine: SUCCESS",
  );

  let rejected =
    false;

  try {
    authority.recover(
      quarantined,
      "Recovered Rust toolchain knowledge.",
      [],
      "2026-08-13T19:02:00.000Z",
    );
  } catch {
    rejected =
      true;
  }

  assert(
    rejected,
    "Recovery without verification evidence must be rejected.",
  );

  console.log(
    "004.MEMORY-HEALTH-006 recovery verification gate: SUCCESS",
  );

  const recovered =
    authority.recover(
      quarantined,
      "Recovered Rust toolchain knowledge.",
      [
        "recovery:independent-source-confirmation",
        "recovery:runtime-verification",
      ],
      "2026-08-13T19:03:00.000Z",
    );

  assert(
    recovered.recovered,
    "Verified recovery must report successful recovery.",
  );

  assert(
    recovered.verificationRequired ===
      false,
    "Successfully verified recovery must clear the verification-required state.",
  );

  assert(
    recovered.memory.lifecycle.lifecycleClass ===
      "authoritative",
    "Recovered verified knowledge must re-enter as authoritative memory.",
  );

  console.log(
    "005.MEMORY-HEALTH-006 verified memory recovery: SUCCESS",
  );

  assert(
    recovered.memory.provenance.includes(
      "quarantine:" +
        envelope.id,
    ),
    "Recovered memory must preserve quarantine provenance.",
  );

  assert(
    recovered.memory.provenance.includes(
      "recovery:verified",
    ),
    "Recovered memory must preserve recovery provenance.",
  );

  assert(
    recovered.memory.provenance.includes(
      "recovery:runtime-verification",
    ),
    "Recovered memory must preserve verification evidence.",
  );

  console.log(
    "006.MEMORY-HEALTH-006 recovery provenance preservation: SUCCESS",
  );

  const recoveredReport =
    authority.inspect(
      recovered.memory,
    );

  assert(
    recoveredReport.valid,
    "Recovered memory must pass integrity inspection after reconstruction.",
  );

  console.log(
    "007.MEMORY-HEALTH-006 reconstructed memory integrity: SUCCESS",
  );

  const missingContent: typeof envelope = {
    ...envelope,

    content:
      "",

    checksum:
      "invalid",
  };

  const missingContentReport =
    authority.inspect(
      missingContent,
    );

  assert(
    !missingContentReport.valid,
    "Incomplete durable memory must fail integrity inspection.",
  );

  assert(
    missingContentReport.reasons.some(
      (reason) =>
        reason.includes(
          "content",
        ),
    ),
    "Incomplete memory must preserve an explicit missing-content diagnosis.",
  );

  console.log(
    "008.MEMORY-HEALTH-006 incomplete memory detection: SUCCESS",
  );

  console.log(
    "MEMORY-HEALTH-006 DURABLE MEMORY INTEGRITY → QUARANTINE → VERIFIED RECOVERY: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(error);
    throw error;
  },
);
