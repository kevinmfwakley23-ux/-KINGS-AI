import {
  DurableEngineeringWorkflowStore,
} from "./durable-engineering-workflow";

import type {
  DurableEngineeringWorkflow,
} from "./durable-engineering-workflow";

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

function main(): void {
  const store =
    new DurableEngineeringWorkflowStore();

  const workflow:
    DurableEngineeringWorkflow =
    {
      id:
        "workflow-tree-0820",
      projectId:
        "project-tree-0820",
      tasks: [
        {
          id:
            "task-build",
          projectId:
            "project-tree-0820",
          dependencyIds: [],
          status:
            "completed",
        },
        {
          id:
            "task-test",
          projectId:
            "project-tree-0820",
          dependencyIds: [
            "task-build",
          ],
          status:
            "ready",
        },
      ],
      activeTaskId:
        "task-test",
      version:
        1,
      updatedAt:
        new Date().toISOString(),
    };

  const saved =
    store.save(
      workflow,
    );

  assert(
    saved.id ===
      "workflow-tree-0820",
    "Durable workflow identity must be preserved.",
  );

  assert(
    saved.version ===
      1,
    "Initial durable workflow version must be preserved.",
  );

  console.log(
    "08.20 durable workflow persistence: SUCCESS",
  );

  const recovered =
    store.get(
      "workflow-tree-0820",
    );

  assert(
    recovered !==
      undefined,
    "Persisted engineering workflow must be recoverable.",
  );

  assert(
    recovered?.activeTaskId ===
      "task-test",
    "Active engineering task must survive persistence.",
  );

  assert(
    recovered?.tasks[1].status ===
      "ready",
    "Dependency advancement state must survive persistence.",
  );

  console.log(
    "08.20 workflow recovery: SUCCESS",
  );

  const updated =
    store.update(
      "workflow-tree-0820",
      new Date().toISOString(),
      (current) => ({
        ...current,
        activeTaskId:
          undefined,
        tasks:
          current.tasks.map(
            (task) =>
              task.id ===
                "task-test"
                ? {
                    ...task,
                    status:
                      "completed",
                  }
                : task,
          ),
      }),
    );

  assert(
    updated.version ===
      2,
    "Workflow updates must increment the durable version.",
  );

  assert(
    updated.tasks[1].status ===
      "completed",
    "Updated engineering task state must persist.",
  );

  console.log(
    "08.20 durable workflow state update: SUCCESS",
  );

  const isolated =
    store.get(
      "workflow-tree-0820",
    );

  assert(
    isolated !==
      saved,
    "Durable retrieval must return a defensive copy.",
  );

  isolated!.tasks[0].status =
    "active";

  const unchanged =
    store.get(
      "workflow-tree-0820",
    );

  assert(
    unchanged!.tasks[0].status ===
      "completed",
    "External mutation must not corrupt durable workflow state.",
  );

  console.log(
    "08.20 durable state isolation: SUCCESS",
  );

  console.log(
    "TREE-08.20 DURABLE ENGINEERING WORKFLOW: SUCCESS",
  );
}

main();
