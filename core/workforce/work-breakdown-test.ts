import {
  WorkBreakdownAuthority,
} from "./work-breakdown";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (
    !condition
  ) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function workflow() {
  return {
    missionId:
      "mission-tree-063",
    planId:
      "plan-tree-063",
    planVersion:
      1,
    milestoneId:
      "milestone-tree-063",
    milestoneObjective:
      "Execute a dependency-ordered build.",
    orderedTaskIds: [
      "task-a",
      "task-b",
      "task-c",
      "task-d",
    ],
    proposals: [
      {
        id:
          "proposal-a",
        task: {
          id:
            "task-a",
        } as any,
        workUnit: {
          id:
            "work-unit-a",
          dependencyIds: [],
        } as any,
      },
      {
        id:
          "proposal-b",
        task: {
          id:
            "task-b",
        } as any,
        workUnit: {
          id:
            "work-unit-b",
          dependencyIds: [
            "task-a",
          ],
        } as any,
      },
      {
        id:
          "proposal-c",
        task: {
          id:
            "task-c",
        } as any,
        workUnit: {
          id:
            "work-unit-c",
          dependencyIds: [
            "task-a",
          ],
        } as any,
      },
      {
        id:
          "proposal-d",
        task: {
          id:
            "task-d",
        } as any,
        workUnit: {
          id:
            "work-unit-d",
          dependencyIds: [
            "task-b",
            "task-c",
          ],
        } as any,
      },
    ],
    acceptanceCriteria: [
      "Build completes correctly.",
    ],
    createdAt:
      new Date().toISOString(),
  } as any;
}

async function main(): Promise<void> {
  const authority =
    new WorkBreakdownAuthority();

  const result =
    authority.build(
      workflow(),
    );

  assert(
    result.layers.length ===
      3,
    "Work breakdown must produce three deterministic dependency layers.",
  );

  assert(
    result.layers[0]
      .taskIds.join(
        ",",
      ) ===
      "task-a",
    "Layer zero must contain the root task.",
  );

  assert(
    result.layers[1]
      .taskIds.join(
        ",",
      ) ===
      "task-b,task-c",
    "Layer one must contain parallel tasks with the same dependency depth.",
  );

  assert(
    result.layers[2]
      .taskIds.join(
        ",",
      ) ===
      "task-d",
    "Layer two must contain the task dependent on both layer-one tasks.",
  );

  assert(
    result.readyTaskIds.join(
      ",",
    ) ===
      "task-a",
    "Only dependency-free work should initially be ready.",
  );

  assert(
    result.blockedTaskIds.join(
      ",",
    ) ===
      "task-b,task-c,task-d",
    "Dependent work must initially be blocked.",
  );

  assert(
    result.items
      .find(
        (item) =>
          item.taskId ===
          "task-d",
      )
      ?.dependencyIds.length ===
      2,
    "Work breakdown must preserve all task dependencies.",
  );

  assert(
    result.items
      .every(
        (item) =>
          item.proposalId &&
          item.workUnitId,
      ),
    "Every work-breakdown item must retain proposal and Work Unit identity.",
  );

  let duplicateRejected =
    false;

  try {
    const broken =
      workflow();

    broken.proposals.push(
      broken.proposals[0],
    );

    authority.build(
      broken,
    );
  } catch {
    duplicateRejected =
      true;
  }

  assert(
    duplicateRejected,
    "Duplicate task proposals must be rejected.",
  );

  let missingRejected =
    false;

  try {
    const broken =
      workflow();

    broken.orderedTaskIds.push(
      "task-missing",
    );

    authority.build(
      broken,
    );
  } catch {
    missingRejected =
      true;
  }

  assert(
    missingRejected,
    "Workflow tasks without proposals must be rejected.",
  );

  console.log(
    "06.3 deterministic dependency layering: SUCCESS",
  );

  console.log(
    "06.3 ready/blocked work classification: SUCCESS",
  );

  console.log(
    "06.3 proposal and Work Unit linkage: SUCCESS",
  );

  console.log(
    "06.3 malformed plan rejection: SUCCESS",
  );

  console.log(
    "TREE-06.3 WORK BREAKDOWN: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
