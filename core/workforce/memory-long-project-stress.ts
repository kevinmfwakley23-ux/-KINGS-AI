import type {
  MemoryReference,
} from "./types";

import {
  MemoryLifecycleAuthority,
} from "./memory-lifecycle-authority";

import {
  MemoryContextAuthority,
} from "./memory-context-authority";

import {
  MemoryConsolidationEfficiencyAuthority,
} from "./memory-consolidation-efficiency";

import {
  MemorySupersessionAuthority,
} from "./memory-supersession-authority";

import {
  MemoryHealthMetricsAuthority,
} from "./memory-health-metrics";

import {
  MemoryRetrievalQualityAuthority,
} from "./memory-retrieval-quality";

import {
  MemoryContextBudgetAuthority,
} from "./memory-context-budget";

import {
  MemoryIntegrityAuthority,
} from "./memory-integrity-authority";

import {
  ProjectMemoryLifecycleAuthority,
} from "./project-memory-lifecycle";

import type {
  Task,
} from "./types";

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

function memory(
  id:
    string,
  summary:
    string,
  overrides:
    Partial<MemoryReference> =
      {},
):
  MemoryReference {
  return {
    id,
    type:
      "semantic",
    summary,
    sourceReferences:
      [
        `evidence-${id}`,
      ],
    missionId:
      "mission-long-project-010",
    taskId:
      "task-long-project-010",
    authoritative:
      false,
    createdAt:
      "2026-01-01T00:00:00.000Z",
    updatedAt:
      "2026-08-13T01:00:00.000Z",
    ...overrides,
  };
}

const lifecycle =
  new MemoryLifecycleAuthority();

const context =
  new MemoryContextAuthority();

const consolidation =
  new MemoryConsolidationEfficiencyAuthority();

const supersession =
  new MemorySupersessionAuthority();

const health =
  new MemoryHealthMetricsAuthority();

const retrieval =
  new MemoryRetrievalQualityAuthority();

const budget =
  new MemoryContextBudgetAuthority();

const integrity =
  new MemoryIntegrityAuthority();

const projectLifecycle =
  new ProjectMemoryLifecycleAuthority();

const task:
  Task = {
  id:
    "task-long-project-010",
  missionId:
    "mission-long-project-010",
  name:
    "Continue the long-running project",
  description:
    "Use the latest verified architecture plan B, learned lessons, and current project decisions without replaying the entire project history.",
  requiredCapabilities:
    [
      "coding",
    ],
  requiredToolIds:
    [],
  status:
    "ready",
  dependencyIds:
    [],
  inputReferences:
    [
      "architecture",
      "verification",
      "lessons",
    ],
  expectedOutputs:
    [
      "next verified implementation",
    ],
  createdAt:
    "2026-08-13T00:00:00.000Z",
  updatedAt:
    "2026-08-13T01:00:00.000Z",
};

const rawMemories:
  MemoryReference[] = [];

for (
  let index = 1;
  index <= 120;
  index +=
    1
) {
  rawMemories.push(
    memory(
      `memory-history-${index}`,
      index % 4 === 0
        ? "Repeated project observation about the governed TypeScript architecture."
        : `Project observation ${index} regarding the current implementation state.`,
    ),
  );
}

rawMemories.push(
  memory(
    "memory-old-plan",
    "The project should use architecture plan A.",
    {
      updatedAt:
        "2026-07-01T00:00:00.000Z",
    },
  ),
);

rawMemories.push(
  memory(
    "memory-new-plan",
    "The project should use architecture plan B.",
    {
      authoritative:
        true,
      updatedAt:
        "2026-08-13T02:00:00.000Z",
    },
  ),
);

rawMemories.push(
  memory(
    "memory-lesson",
    "A previous implementation failed because direct provider coupling prevented safe replacement.",
    {
      type:
        "procedural",
    },
  ),
);

rawMemories.push(
  memory(
    "memory-procedure",
    "Use a governed provider adapter boundary before provider-specific execution.",
    {
      type:
        "procedural",
      authoritative:
        true,
    },
  ),
);

rawMemories.push(
  memory(
    "memory-failure",
    "A previous filesystem write failed because the path was outside the authorized workspace boundary.",
    {
      type:
        "episodic",
    },
  ),
);

console.log(
  "010.MEMORY large historical memory population: SUCCESS",
);

for (
  const item of rawMemories
) {
  const classified =
    lifecycle.classify(
      item,
    );

  assert(
    classified.memoryType ===
      item.type,
    "Lifecycle classification must preserve canonical memory type.",
  );

  const contextual =
    context.inspect(
      item,
    );

  assert(
    contextual.hasMissionContext,
    "Long-project memories must retain mission context.",
  );

  assert(
    contextual.hasProvenance,
    "Long-project memories must retain provenance.",
  );

  const integrityResult =
    integrity.verify(
      item,
      {
        knownMissionIds:
          [
            "mission-long-project-010",
          ],
        knownTaskIds:
          [
            "task-long-project-010",
          ],
        knownSourceIds:
          [
            `evidence-${item.id}`,
          ],
      },
    );

  assert(
    integrityResult.status ===
      "valid",
    `Long-project memory "${item.id}" must pass integrity verification.`,
  );
}

console.log(
  "010.MEMORY lifecycle/context/integrity verification across project history: SUCCESS",
);

const consolidationCandidates =
  rawMemories.slice(
    0,
    12,
  );

const consolidationDecision =
  consolidation.decide(
    consolidationCandidates,
  );

assert(
  consolidationDecision.decision ===
    "consolidate",
  "Repeated long-project memories must become eligible for consolidation.",
);

assert(
  consolidationDecision.sourceMemoryIds.length ===
    consolidationCandidates.length,
  "Consolidation must retain source lineage across the long project.",
);

console.log(
  "010.MEMORY long-history consolidation eligibility: SUCCESS",
);

const duplicateReduction =
  consolidation.deduplicate(
    [
      memory(
        "memory-duplicate-1",
        "The project uses governed TypeScript architecture.",
      ),
      memory(
        "memory-duplicate-2",
        "  The project   uses governed TypeScript architecture. ",
      ),
      memory(
        "memory-unique",
        "The project has a verified recovery procedure.",
      ),
    ],
  );

assert(
  duplicateReduction.length ===
    2,
  "Repeated history must be reducible without losing distinct knowledge.",
);

console.log(
  "010.MEMORY long-history redundancy reduction: SUCCESS",
);

supersession.register(
  rawMemories.find(
    (
      item,
    ) =>
      item.id ===
      "memory-old-plan",
  )!,
);

supersession.register(
  rawMemories.find(
    (
      item,
    ) =>
      item.id ===
      "memory-new-plan",
  )!,
);

supersession.supersede(
  rawMemories.find(
    (
      item,
    ) =>
      item.id ===
      "memory-old-plan",
  )!,
  rawMemories.find(
    (
      item,
    ) =>
      item.id ===
      "memory-new-plan",
  )!,
  "Project creator explicitly replaced the old architecture plan with the new approved plan.",
  "2026-08-13T02:00:00.000Z",
);

const oldTruth =
  supersession.currentTruth(
    "memory-old-plan",
  );

const newTruth =
  supersession.currentTruth(
    "memory-new-plan",
  );

assert(
  !oldTruth.isCurrent &&
  newTruth.isCurrent,
  "The current plan must replace the obsolete plan.",
);

console.log(
  "010.MEMORY creator-directed plan supersession: SUCCESS",
);

const healthMetrics =
  health.assess(
    rawMemories.find(
      (
        item,
      ) =>
        item.id ===
        "memory-procedure",
    )!,
    {
      now:
        "2026-08-13T03:00:00.000Z",
      referenceMissionId:
        "mission-long-project-010",
      referenceTaskId:
        "task-long-project-010",
      retrievalCount:
        12,
      usefulRetrievalCount:
        11,
      estimatedTokenCost:
        40,
    },
  );

assert(
  healthMetrics.health ===
    "healthy",
  "Frequently useful authoritative procedural memory must remain healthy.",
);

assert(
  healthMetrics.importance >
    0.70,
  "Highly reusable project learning must remain important.",
);

console.log(
  "010.MEMORY long-project memory health assessment: SUCCESS",
);

const retrievalResult =
  retrieval.evaluate(
    task,
    [
      ...rawMemories.slice(
        0,
        20,
      ),
      rawMemories.find(
        (
          item,
        ) =>
          item.id ===
          "memory-procedure",
      )!,
      rawMemories.find(
        (
          item,
        ) =>
          item.id ===
          "memory-old-plan",
      )!,
      rawMemories.find(
        (
          item,
        ) =>
          item.id ===
          "memory-new-plan",
      )!,
    ],
    {
      now:
        "2026-08-13T03:00:00.000Z",
      limit:
        8,
      minimumQuality:
        0.40,
      supersededMemoryIds:
        [
          "memory-old-plan",
        ],
    },
  );

assert(
  retrievalResult.selectedMemoryIds.length <=
    8,
  "Retrieval must remain bounded even when project history is large.",
);

assert(
  !retrievalResult.selectedMemoryIds.includes(
    "memory-old-plan",
  ),
  "Superseded project plans must not enter normal retrieval.",
);

assert(
  retrievalResult.selectedMemoryIds.includes(
    "memory-new-plan",
  ),
  "Current project plan must remain retrievable.",
);

console.log(
  "010.MEMORY long-project retrieval quality and supersession filtering: SUCCESS",
);

const budgetResult =
  budget.calculate({
    memories:
      retrievalResult.candidates
        .filter(
          (
            candidate,
          ) =>
            retrievalResult.selectedMemoryIds.includes(
              candidate.memoryId,
            ),
        )
        .map(
          (
            candidate,
          ) =>
            rawMemories.find(
              (
                item,
              ) =>
                item.id ===
                candidate.memoryId,
            )!,
        ),
    budgetTokens:
      250,
  });

assert(
  budgetResult.estimatedUsedTokens <=
    250,
  "Long-project active context must stay within its token budget.",
);

assert(
  budgetResult.utilization <=
    1,
  "Long-project context utilization must not exceed 100 percent.",
);

console.log(
  "010.MEMORY long-project bounded context compilation: SUCCESS",
);

const completionRequest = {
  projectId:
    "project-long-project-010",
  projectName:
    "Long Horizon Memory Stress Project",
  objective:
    "Prove that K.I.N.G.S. can retain history, learn from mistakes, supersede obsolete plans, and release active project memory safely.",
  completedAt:
    "2026-08-13T04:00:00.000Z",
  memories:
    rawMemories,
  importantMemoryIds:
    [
      "memory-new-plan",
      "memory-lesson",
      "memory-procedure",
      "memory-failure",
    ],
  lessonMemoryIds:
    [
      "memory-lesson",
      "memory-failure",
    ],
  reusableProcedureIds:
    [
      "memory-procedure",
    ],
  failedApproachMemoryIds:
    [
      "memory-failure",
    ],
};

const completion =
  projectLifecycle.prepareCompletion(
    completionRequest,
  );

assert(
  completion.state ===
    "snapshot-ready",
  "Long project must become snapshot-ready before memory release.",
);

const snapshot =
  projectLifecycle.createSnapshot(
    completionRequest,
  );

assert(
  snapshot.memoryCount ===
    rawMemories.length,
  "Project snapshot must account for the complete active project memory population.",
);

assert(
  snapshot.lessonMemoryIds.includes(
    "memory-lesson",
  ),
  "Project snapshot must preserve learned lessons.",
);

assert(
  snapshot.failedApproachMemoryIds.includes(
    "memory-failure",
  ),
  "Project snapshot must preserve failed approaches.",
);

assert(
  snapshot.reusableProcedureIds.includes(
    "memory-procedure",
  ),
  "Project snapshot must preserve reusable procedures.",
);

const verifiedSnapshot =
  projectLifecycle.verifySnapshot(
    completionRequest.projectId,
  );

assert(
  verifiedSnapshot.snapshotId ===
    snapshot.snapshotId,
  "Verified snapshot must remain addressable.",
);

console.log(
  "010.MEMORY long-project learning snapshot verification: SUCCESS",
);

const released =
  projectLifecycle.releaseActiveMemory(
    completionRequest.projectId,
    "2026-08-13T04:01:00.000Z",
  );

assert(
  released.activeMemoryIds.length ===
    0,
  "Completed project active memory must be released.",
);

console.log(
  "010.MEMORY long-project active memory release: SUCCESS",
);

const retainedSnapshot =
  projectLifecycle.verifySnapshot(
    completionRequest.projectId,
  );

assert(
  retainedSnapshot.lessonMemoryIds.includes(
    "memory-lesson",
  ),
  "Lessons must survive active memory release.",
);

assert(
  retainedSnapshot.failedApproachMemoryIds.includes(
    "memory-failure",
  ),
  "Failure lessons must survive active memory release.",
);

console.log(
  "010.MEMORY post-release learning retention: SUCCESS",
);

const nextProjectTask:
  Task = {
  ...task,
  id:
    "task-next-project",
  missionId:
    "mission-next-project",
  name:
    "Start a new project using prior lessons",
  description:
    "Use reusable lessons from a completed project without importing its entire history.",
};

const reusableLesson =
  memory(
    "lifelong-lesson-provider-boundary",
    "Use a governed provider adapter boundary before provider-specific execution.",
    {
      missionId:
        undefined,
      taskId:
        undefined,
      authoritative:
        true,
      type:
        "procedural",
    },
  );

const nextProjectRetrieval =
  retrieval.evaluate(
    nextProjectTask,
    [
      reusableLesson,
    ],
    {
      now:
        "2026-08-13T05:00:00.000Z",
      limit:
        5,
      minimumQuality:
        0.30,
    },
  );

assert(
  nextProjectRetrieval.selectedMemoryIds.includes(
    reusableLesson.id,
  ),
  "Reusable lifelong learning must remain available to later projects.",
);

console.log(
  "010.MEMORY cross-project reusable lesson retrieval: SUCCESS",
);

const finalContext =
  budget.calculate({
    memories:
      [
        reusableLesson,
      ],
    budgetTokens:
      100,
  });

assert(
  finalContext.estimatedUsedTokens <=
    100,
  "Later projects must receive only bounded reusable learning context.",
);

console.log(
  "010.MEMORY cross-project bounded learning context: SUCCESS",
);

console.log(
  "MEMORY-HEALTH-010 LONG-PROJECT MEMORY STRESS TEST: SUCCESS",
);
