import {
  ProjectBrainChangeImpactAuthority,
} from "./project-brain-change-impact";

import type {
  ProjectBrainChangeEvent,
} from "./project-brain-change-ledger";

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

function createEvent(
  category:
    | "mission"
    | "plan"
    | "state"
    | "decision"
    | "checkpoint"
    | "knowledge",
): ProjectBrainChangeEvent {
  return {
    id:
      `PROJECT-BRAIN-CHANGE:MISSION-018-TEST:${category}`,

    missionId:
      "MISSION-018-TEST",

    previousCreatedAt:
      "2026-08-10T01:00:00.000Z",

    currentCreatedAt:
      "2026-08-10T02:00:00.000Z",

    changes: [
      {
        type:
          "changed",

        category,

        id:
          `CHANGE-018-${category}`,

        summary:
          `Test ${category} change.`,
      },
    ],

    previousStateCreatedAt:
      "2026-08-10T01:00:00.000Z",

    currentStateCreatedAt:
      "2026-08-10T02:00:00.000Z",

    createdAt:
      "2026-08-10T02:00:01.000Z",
  };
}

function main(): void {
  const authority =
    new ProjectBrainChangeImpactAuthority();

  const informational =
    authority.assess(
      createEvent(
        "knowledge",
      ),
    );

  assert(
    informational.impact ===
      "attention-required",
    "Knowledge changes should require contextual attention.",
  );

  assert(
    informational.changeIds.length ===
      1,
    "Change identity must be preserved.",
  );

  console.log(
    "Knowledge change impact classification: SUCCESS",
  );

  const decision =
    authority.assess(
      createEvent(
        "decision",
      ),
    );

  assert(
    decision.impact ===
      "attention-required",
    "Decision changes should require attention.",
  );

  console.log(
    "Decision change impact classification: SUCCESS",
  );

  const state =
    authority.assess(
      createEvent(
        "state",
      ),
    );

  assert(
    state.impact ===
      "attention-required",
    "Mission state changes should require attention.",
  );

  console.log(
    "Mission state impact classification: SUCCESS",
  );

  const checkpoint =
    authority.assess(
      createEvent(
        "checkpoint",
      ),
    );

  assert(
    checkpoint.impact ===
      "attention-required",
    "Checkpoint changes should require attention.",
  );

  console.log(
    "Checkpoint impact classification: SUCCESS",
  );

  const plan =
    authority.assess(
      createEvent(
        "plan",
      ),
    );

  assert(
    plan.impact ===
      "blocking",
    "Plan changes should be classified as blocking.",
  );

  console.log(
    "Mission plan blocking classification: SUCCESS",
  );

  const mission =
    authority.assess(
      createEvent(
        "mission",
      ),
    );

  assert(
    mission.impact ===
      "blocking",
    "Mission changes should be classified as blocking.",
  );

  console.log(
    "Mission change blocking classification: SUCCESS",
  );

  let emptyRejected =
    false;

  try {
    authority.assess({
      ...createEvent(
        "state",
      ),
      changes: [],
    });
  } catch {
    emptyRejected =
      true;
  }

  assert(
    emptyRejected,
    "Empty change events must be rejected.",
  );

  console.log(
    "Empty change rejection: SUCCESS",
  );

  const mixed =
    authority.assess({
      ...createEvent(
        "state",
      ),
      id:
        "PROJECT-BRAIN-CHANGE:MISSION-018-TEST:MIXED",

      changes: [
        {
          type:
            "changed",
          category:
            "knowledge",
          id:
            "KNOWLEDGE-018",
          summary:
            "Knowledge changed.",
        },
        {
          type:
            "changed",
          category:
            "plan",
          id:
            "PLAN-018",
          summary:
            "Plan changed.",
        },
      ],
    });

  assert(
    mixed.impact ===
      "blocking",
    "A blocking change must dominate mixed-impact events.",
  );

  console.log(
    "Mixed-impact precedence: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-018 Project Brain change impact authority: SUCCESS",
  );
}

main();
