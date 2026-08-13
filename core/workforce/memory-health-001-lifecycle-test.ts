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

async function main():
  Promise<void> {
  const classifier =
    new MemoryLifecycleClassifier();

  const working =
    classifier.classify({
      kind:
        "current-task",

      verified:
        false,

      superseded:
        false,
    });

  assert(
    working.lifecycleClass ===
      "working",

    "Current task memory must classify as working memory.",
  );

  assert(
    working.retention ===
      "active",

    "Working memory must use active retention.",
  );

  assert(
    classifier.canEnterActiveContext(
      working,
    ),

    "Working memory must be eligible for active context.",
  );

  console.log(
    "001.MEMORY-HEALTH-001 working-memory classification: SUCCESS",
  );

  const episodic =
    classifier.classify({
      kind:
        "event",

      verified:
        false,

      superseded:
        false,
    });

  assert(
    episodic.lifecycleClass ===
      "episodic",

    "Events must classify as episodic memory.",
  );

  assert(
    episodic.durable ===
      true,

    "Episodic events must be durable.",
  );

  console.log(
    "002.MEMORY-HEALTH-001 episodic-memory classification: SUCCESS",
  );

  const candidate =
    classifier.classify({
      kind:
        "fact",

      verified:
        false,

      superseded:
        false,
    });

  assert(
    candidate.lifecycleClass ===
      "semantic",

    "Facts must classify as semantic memory.",
  );

  assert(
    candidate.authority ===
      "candidate",

    "Unverified facts must remain candidate knowledge.",
  );

  assert(
    candidate.requiresVerification ===
      true,

    "Unverified facts must require verification.",
  );

  console.log(
    "003.MEMORY-HEALTH-001 candidate semantic knowledge protection: SUCCESS",
  );

  const procedure =
    classifier.classify({
      kind:
        "procedure",

      verified:
        true,

      superseded:
        false,
    });

  assert(
    procedure.lifecycleClass ===
      "procedural",

    "Procedures must classify as procedural memory.",
  );

  assert(
    procedure.authority ===
      "verified",

    "Verified procedures must receive verified authority.",
  );

  console.log(
    "004.MEMORY-HEALTH-001 verified procedural memory classification: SUCCESS",
  );

  const mission =
    classifier.classify({
      kind:
        "mission-state",

      verified:
        false,

      superseded:
        false,

      missionId:
        "mission-001",
    });

  assert(
    mission.lifecycleClass ===
      "mission",

    "Mission state must classify as mission memory.",
  );

  assert(
    mission.durable ===
      true,

    "Mission state must be durable.",
  );

  assert(
    mission.authority ===
      "verified",

    "Mission operational state must be trusted as verified state.",
  );

  console.log(
    "005.MEMORY-HEALTH-001 mission-state classification: SUCCESS",
  );

  const project =
    classifier.classify({
      kind:
        "project-state",

      verified:
        false,

      superseded:
        false,

      projectId:
        "project-kings",
    });

  assert(
    project.lifecycleClass ===
      "project",

    "Project state must classify as project memory.",
  );

  assert(
    project.durable ===
      true,

    "Project state must be durable.",
  );

  console.log(
    "006.MEMORY-HEALTH-001 project-state classification: SUCCESS",
  );

  const authoritative =
    classifier.classify({
      kind:
        "verified-knowledge",

      verified:
        true,

      superseded:
        false,
    });

  assert(
    authoritative.lifecycleClass ===
      "authoritative",

    "Verified knowledge must classify as authoritative memory.",
  );

  assert(
    authoritative.authority ===
      "authoritative",

    "Verified knowledge must receive authoritative authority.",
  );

  assert(
    classifier.canBeAuthoritative(
      authoritative,
    ),

    "Only properly classified verified knowledge may enter authoritative memory.",
  );

  console.log(
    "007.MEMORY-HEALTH-001 authoritative knowledge classification: SUCCESS",
  );

  let rejected =
    false;

  try {
    classifier.classify({
      kind:
        "verified-knowledge",

      verified:
        false,

      superseded:
        false,
    });
  } catch {
    rejected =
      true;
  }

  assert(
    rejected,

    "Unverified knowledge must not masquerade as authoritative knowledge.",
  );

  console.log(
    "008.MEMORY-HEALTH-001 authoritative-memory verification gate: SUCCESS",
  );

  const archival =
    classifier.classify({
      kind:
        "historical-record",

      verified:
        true,

      superseded:
        false,
    });

  assert(
    archival.lifecycleClass ===
      "archival",

    "Historical records must classify as archival memory.",
  );

  assert(
    archival.active ===
      false,

    "Archival history must not enter active context by default.",
  );

  assert(
    archival.durable ===
      true,

    "Archival history must remain durable.",
  );

  assert(
    !classifier.canEnterActiveContext(
      archival,
    ),

    "Archival memory must be excluded from active context.",
  );

  console.log(
    "009.MEMORY-HEALTH-001 archival-memory isolation: SUCCESS",
  );

  const superseded =
    classifier.classify({
      kind:
        "fact",

      verified:
        true,

      superseded:
        true,
    });

  assert(
    superseded.lifecycleClass ===
      "superseded",

    "Superseded memory must receive the superseded lifecycle class.",
  );

  assert(
    superseded.durable ===
      true,

    "Superseded memory must remain durable history.",
  );

  assert(
    superseded.active ===
      false,

    "Superseded memory must not remain active.",
  );

  assert(
    !classifier.canEnterActiveContext(
      superseded,
    ),

    "Superseded memory must be excluded from active context.",
  );

  console.log(
    "010.MEMORY-HEALTH-001 supersession protection: SUCCESS",
  );

  console.log(
    "MEMORY-HEALTH-001 MEMORY LIFECYCLE + CLASSIFICATION: SUCCESS",
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
