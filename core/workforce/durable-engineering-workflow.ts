import type {
  ID,
} from "./types";

import type {
  EngineeringWorkflowTask,
} from "./engineering-workflow-bridge";

export interface DurableEngineeringWorkflow {
  id:
    ID;
  projectId:
    ID;
  tasks:
    EngineeringWorkflowTask[];
  activeTaskId?:
    ID;
  version:
    number;
  updatedAt:
    string;
}

export class DurableEngineeringWorkflowStore {
  private readonly workflows =
    new Map<
      ID,
      DurableEngineeringWorkflow
    >();

  save(
    workflow:
      DurableEngineeringWorkflow,
  ):
    DurableEngineeringWorkflow {
    const stored = {
      ...workflow,
      tasks:
        workflow.tasks.map(
          (task) => ({
            ...task,
            dependencyIds: [
              ...task.dependencyIds,
            ],
          }),
        ),
    };

    this.workflows.set(
      workflow.id,
      stored,
    );

    return this.clone(
      stored,
    );
  }

  get(
    workflowId:
      ID,
  ):
    DurableEngineeringWorkflow
    | undefined {
    const workflow =
      this.workflows.get(
        workflowId,
      );

    return workflow
      ? this.clone(
          workflow,
        )
      : undefined;
  }

  update(
    workflowId:
      ID,
    updatedAt:
      string,
    update:
      (
        workflow:
          DurableEngineeringWorkflow,
      ) =>
        DurableEngineeringWorkflow,
  ):
    DurableEngineeringWorkflow {
    const current =
      this.workflows.get(
        workflowId,
      );

    if (!current) {
      throw new Error(
        `K.I.N.G.S. Durable Engineering Workflow: workflow "${workflowId}" was not found`,
      );
    }

    const next =
      update(
        this.clone(
          current,
        ),
      );

    if (
      next.id !==
      workflowId
    ) {
      throw new Error(
        "K.I.N.G.S. Durable Engineering Workflow: workflow identity cannot change",
      );
    }

    const persisted = {
      ...next,
      version:
        current.version +
        1,
      updatedAt,
    };

    this.workflows.set(
      workflowId,
      persisted,
    );

    return this.clone(
      persisted,
    );
  }

  private clone(
    workflow:
      DurableEngineeringWorkflow,
  ):
    DurableEngineeringWorkflow {
    return {
      ...workflow,
      tasks:
        workflow.tasks.map(
          (task) => ({
            ...task,
            dependencyIds: [
              ...task.dependencyIds,
            ],
          }),
        ),
    };
  }
}
