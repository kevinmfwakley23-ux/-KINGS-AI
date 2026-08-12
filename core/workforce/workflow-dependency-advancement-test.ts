import {
  WorkflowDependencyAdvancementAuthority,
} from "./workflow-dependency-advancement";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function expectFailure(
  action:
    () => void,
  message:
    string,
): void {
  try {
    action();
  } catch {
    return;
  }

  throw new Error(
    `EXPECTED FAILURE: ${message}`,
  );
}

async function main(): Promise<void> {
  const now =
    new Date().toISOString();

  const authority =
    new WorkflowDependencyAdvancementAuthority();

  authority.register({
    workflowId:
      "workflow-tree-085",
    ownerId:
      "owner-tree-085",
    currentTaskId:
      "task-tree-085-a",
    updatedAt:
      now,
    tasks: [
      {
        id:
          "task-tree-085-a",
        dependencyIds: [],
        state:
          "ready",
      },
      {
        id:
          "task-tree-085-b",
        dependencyIds: [
          "task-tree-085-a",
        ],
        state:
          "pending",
      },
      {
        id:
          "task-tree-085-c",
        dependencyIds: [
          "task-tree-085-b",
        ],
        state:
          "pending",
      },
      {
        id:
          "task-tree-085-d",
        dependencyIds: [
          "task-tree-085-a",
        ],
        state:
          "pending",
      },
      {
        id:
          "task-tree-085-e",
        dependencyIds: [
          "task-tree-085-c",
        ],
        state:
          "blocked",
      },
    ],
  });

  const advanced =
    authority.advance(
      "workflow-tree-085",
      "owner-tree-085",
      "task-tree-085-a",
      now,
    );

  assert(
    advanced.completedTaskIds.includes(
      "task-tree-085-a",
    ),
    "Completed task must remain completed after advancement.",
  );

  assert(
    advanced.newlyReadyTaskIds.includes(
      "task-tree-085-b",
    ),
    "A task whose dependencies are complete must become ready.",
  );

  assert(
    advanced.newlyReadyTaskIds.includes(
      "task-tree-085-d",
    ),
    "Independent task branches must advance independently.",
  );

  assert(
    advanced.pendingTaskIds.includes(
      "task-tree-085-c",
    ),
    "Tasks with incomplete dependencies must remain pending.",
  );

  console.log(
    "08.5 completed-work preservation: SUCCESS",
  );

  console.log(
    "08.5 dependency-based task advancement: SUCCESS",
  );

  console.log(
    "08.5 parallel branch advancement: SUCCESS",
  );

  const next =
    authority.advance(
      "workflow-tree-085",
      "owner-tree-085",
      "task-tree-085-b",
      now,
    );

  assert(
    next.newlyReadyTaskIds.includes(
      "task-tree-085-c",
    ),
    "Completing the next dependency must advance the downstream task.",
  );

  console.log(
    "08.5 post-resume dependency advancement: SUCCESS",
  );

  expectFailure(
    () =>
      authority.advance(
        "workflow-tree-085",
        "different-owner",
        "task-tree-085-c",
        now,
      ),
    "A different owner must not advance workflow state.",
  );

  console.log(
    "08.5 owner advancement enforcement: SUCCESS",
  );

  expectFailure(
    () =>
      authority.advance(
        "workflow-tree-085",
        "owner-tree-085",
        "task-tree-085-b",
        now,
      ),
    "An already completed task must not be completed twice.",
  );

  console.log(
    "08.5 duplicate completion rejection: SUCCESS",
  );

  const workflow =
    authority.get(
      "workflow-tree-085",
    );

  assert(
    workflow !==
      undefined,
    "Workflow state must remain durably retrievable.",
  );

  assert(
    workflow?.currentTaskId ===
      "task-tree-085-c" ||
    workflow?.currentTaskId ===
      "task-tree-085-d",
    "Workflow current task must advance to an eligible task.",
  );

  console.log(
    "08.5 durable workflow state retrieval: SUCCESS",
  );

  console.log(
    "TREE-08.5 WORKFLOW DEPENDENCY ADVANCEMENT: SUCCESS",
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
