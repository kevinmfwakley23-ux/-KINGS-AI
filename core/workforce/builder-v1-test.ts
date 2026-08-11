import type {
  ID,
  KnowledgeRecord,
  KnowledgeSource,
  MemoryQuery,
  WorkforceResult,
} from "./types";

import {
  BuilderV1,
} from "./builder-v1";

import {
  ProjectBrain,
} from "./project-brain";

import {
  ProjectBrainStateAuthority,
} from "./project-brain-state";

import {
  MissionContinuityStore,
} from "./mission-continuity";

import type {
  WorkforceExecutionPort,
} from "./execution/execution-port";

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

function createKnowledgeQuery(): MemoryQuery {
  return {
    query:
      "Builder V1 integration",
    memoryTypes: [
      "semantic",
      "procedural",
    ],
    authoritativeOnly: true,
    limit: 5,
  };
}

function createSource(): KnowledgeSource {
  const now =
    new Date().toISOString();

  return {
    id:
      "SOURCE-019-A",
    type:
      "construction-document",
    name:
      "Builder V1 Test Source",
    description:
      "Controlled Builder V1 source.",
    location:
      "test/builder-v1/source-A.md",
    authoritative:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function createRecord(): KnowledgeRecord {
  const now =
    new Date().toISOString();

  return {
    id:
      "KNOWLEDGE-019-A",
    sourceId:
      "SOURCE-019-A",
    memoryType:
      "semantic",
    summary:
      "Builder V1 knowledge",
    content:
      "Builder V1 Project Brain content.",
    evidenceIds: [],
    authoritative:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function createMissionContinuity(
  missionId: ID,
  planId: ID,
  planVersion: number,
): MissionContinuityStore {
  const continuity =
    new MissionContinuityStore();

  const now =
    new Date().toISOString();

  continuity.registerMission({
    id:
      missionId,
    name:
      "Builder V1 Test Mission",
    description:
      "Tests Builder V1 integration.",
    status:
      "active",
    objectives: [
      "Verify Builder integration.",
    ],
    sourceReferences: [
      "test/019",
    ],
    createdAt:
      now,
    updatedAt:
      now,
  });

  continuity.registerPlan({
    id:
      planId,
    missionId,
    version:
      planVersion,
    objective:
      "Builder V1 test plan",
    milestones: [],
    decisionIds: [],
    acceptanceCriteria: [
      "Complete Builder V1 integration.",
    ],
    locked:
      true,
    approvedByHuman:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  });

  return continuity;
}

class TestExecutionPort
implements WorkforceExecutionPort {
  readonly executedTaskIds: ID[] = [];

  async execute(
    taskId: ID,
  ): Promise<WorkforceResult> {
    this.executedTaskIds.push(
      taskId,
    );

    return {
      id:
        `result-${taskId}`,
      taskId,
      agentId:
        "builder-v1-test-agent",
      status:
        "success",
      summary:
        `Executed ${taskId}`,
      artifactIds: [],
      verificationReferences: [],
      createdAt:
        new Date().toISOString(),
    };
  }
}

class StaticStateAuthority {
  constructor(
    private readonly state:
      ReturnType<
        ProjectBrainStateAuthority["snapshot"]
      >,
  ) {}

  snapshot() {
    return this.state;
  }
}

async function main(): Promise<void> {
  const missionId =
    "MISSION-019-TEST";

  const brain =
    new ProjectBrain();

  brain.registerSource(
    createSource(),
  );

  brain.registerRecord(
    createRecord(),
  );

  const knowledgeQuery =
    createKnowledgeQuery();

  /*
   * CHANGED STATE TEST
   *
   * Previous plan:
   * PLAN-019-A / version 1
   *
   * Current plan:
   * PLAN-019-B / version 2
   *
   * 016 must detect the plan change.
   * 017 must register the change event.
   * 018 must classify the plan change as blocking.
   * 019 must stop before workforce execution.
   */

  const previousContinuity =
    createMissionContinuity(
      missionId,
      "PLAN-019-A",
      1,
    );

  const changedContinuity =
    createMissionContinuity(
      missionId,
      "PLAN-019-B",
      2,
    );

  const previousAuthority =
    new ProjectBrainStateAuthority(
      brain,
      previousContinuity,
    );

  const changedAuthority =
    new ProjectBrainStateAuthority(
      brain,
      changedContinuity,
    );

  const previousState =
    previousAuthority.snapshot({
      missionId,
      knowledgeQuery,
    });

  const blockingExecution =
    new TestExecutionPort();

  const blockingBuilder =
    new BuilderV1(
      blockingExecution,
      changedAuthority,
    );

  let blockingRejected =
    false;

  try {
    await blockingBuilder.build({
      missionId,
      objective:
        "Test blocking Project Brain change",
      taskIds: [
        "TASK-019-BLOCKED",
      ],
      knowledgeQuery,
      previousState,
    });
  } catch (
    error: unknown
  ) {
    blockingRejected = true;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    assert(
      message.includes(
        "blocking Project Brain change impact",
      ),
      "Blocking failure must identify the Project Brain impact.",
    );
  }

  assert(
    blockingRejected,
    "Builder must reject execution after a blocking impact.",
  );

  assert(
    blockingExecution.executedTaskIds.length ===
      0,
    "Blocked Builder execution must not reach the workforce.",
  );

  /*
   * UNCHANGED STATE TEST
   *
   * The current state is deliberately the exact
   * same snapshot object as the previous state.
   *
   * Therefore 016 must produce changed=false.
   * No 017 event is created.
   * No 018 impact assessment is created.
   * 019 may execute normally.
   */

  const unchangedExecution =
    new TestExecutionPort();

  const unchangedAuthority =
    new StaticStateAuthority(
      previousState,
    );

  const unchangedBuilder =
    new BuilderV1(
      unchangedExecution,
      unchangedAuthority as unknown as ProjectBrainStateAuthority,
    );

  const unchangedResult =
    await unchangedBuilder.build({
      missionId,
      objective:
        "Test Builder execution after unchanged Project Brain state",
      taskIds: [
        "TASK-019-A",
        "TASK-019-B",
      ],
      knowledgeQuery,
      previousState,
    });

  assert(
    unchangedResult.delta !==
      undefined,
    "Builder must produce a delta when previous state is supplied.",
  );

  assert(
    unchangedResult.delta?.changed ===
      false,
    "Identical Project Brain state must produce an unchanged delta.",
  );

  assert(
    unchangedResult.changeEvent ===
      undefined,
    "Unchanged state must not create a change event.",
  );

  assert(
    unchangedResult.impact ===
      undefined,
    "Unchanged state must not create an impact assessment.",
  );

  assert(
    unchangedExecution.executedTaskIds.length ===
      2,
    "Builder must execute planned tasks when no blocking impact exists.",
  );

  assert(
    unchangedExecution.executedTaskIds[0] ===
      "TASK-019-A",
    "First successful task must execute in plan order.",
  );

  assert(
    unchangedExecution.executedTaskIds[1] ===
      "TASK-019-B",
    "Second successful task must execute in plan order.",
  );

  assert(
    unchangedResult.executions.length ===
      2,
    "Successful Builder execution results must be preserved.",
  );

  console.log(
    "016 state delta detection: SUCCESS",
  );

  console.log(
    "017 change ledger integration: SUCCESS",
  );

  console.log(
    "018 blocking impact detection: SUCCESS",
  );

  console.log(
    "019 blocking execution protection: SUCCESS",
  );

  console.log(
    "019 unchanged-state execution: SUCCESS",
  );

  console.log(
    "019 execution ordering: SUCCESS",
  );

  console.log(
    "019 result preservation: SUCCESS",
  );

  console.log(
    "INTELLIGENCE-019 Builder V1 016-017-018 integration: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "INTELLIGENCE-019 Builder V1 integration: FAILED",
    );
    console.error(error);
    process.exitCode = 1;
  },
);
