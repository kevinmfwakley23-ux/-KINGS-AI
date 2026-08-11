import type {
  AgentDefinition,
  Mission,
  Task,
} from "../types";

import {
  WorkforceRegistry,
} from "../registry";

import {
  WorkUnitRegistry,
} from "../work-unit-registry";

import type {
  WorkUnitContract,
} from "../work-unit-contract";

import {
  WorkforceExecutor,
} from "./executor";

import type {
  AgentExecutionAdapter,
  AgentExecutionContext,
  AgentExecutionResult,
} from "./adapter";

class BudgetTestAdapter
  implements AgentExecutionAdapter
{
  readonly id =
    "budget-test-adapter";

  readonly name =
    "K.I.N.G.S. Budget Test Adapter";

  constructor(
    private readonly elapsedMs: number,
    private readonly tokensUsed: number,
    private readonly iterationsUsed: number,
  ) {}

  canExecute(
    agent: AgentDefinition,
  ): boolean {
    return agent.capabilities.includes(
      "test",
    );
  }

  async execute(
    context: AgentExecutionContext,
  ): Promise<AgentExecutionResult> {
    return {
      id:
        `result-${context.task.id}`,
      taskId:
        context.task.id,
      agentId:
        context.agent.id,
      status:
        "success",
      summary:
        "Budget enforcement integration test execution.",
      artifactIds: [],
      reasoning:
        "Deterministic test adapter used to verify Budget Authority enforcement.",
      verificationReferences: [],
      createdAt:
        new Date().toISOString(),
      usage: {
        elapsedMs:
          this.elapsedMs,
        tokensUsed:
          this.tokensUsed,
        iterationsUsed:
          this.iterationsUsed,
      },
    };
  }
}

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

function createMission(): Mission {
  const now =
    new Date().toISOString();

  return {
    id:
      "mission-budget-authority-test",
    name:
      "Budget Authority Integration Test",
    description:
      "Verify authoritative Work Unit budget enforcement during execution.",
    status:
      "active",
    objectives: [
      "Verify authorized execution.",
      "Verify budget overrun rejection.",
    ],
    sourceReferences: [],
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function createAgent(): AgentDefinition {
  return {
    id:
      "agent-budget-authority-test",
    name:
      "Budget Authority Test Agent",
    role:
      "Budget enforcement verification worker",
    description:
      "Deterministic worker used to verify Budget Authority.",
    capabilities: [
      "test",
    ],
    toolIds: [],
    status:
      "available",
  };
}

function createTask(
  id: string,
  missionId: string,
): Task {
  const now =
    new Date().toISOString();

  return {
    id,
    missionId,
    name:
      "Budget enforcement test task",
    description:
      "Verify execution is governed by the authoritative Work Unit budget.",
    assignedAgentId:
      "agent-budget-authority-test",
    requiredCapabilities: [
      "test",
    ],
    requiredToolIds: [],
    status:
      "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Budget enforcement result",
    ],
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function createWorkUnit(
  maxTimeMs: number,
  maxTokens: number,
  maxIterations: number,
): WorkUnitContract {
  const now =
    new Date().toISOString();

  return {
    id:
      "work-unit-budget-authority-test",
    objective:
      "Execute a deterministic budget enforcement test.",
    role:
      "Budget enforcement verification worker",
    capabilityIds: [
      "test",
    ],
    allowedToolIds: [],
    allowedPaths: [],
    budget: {
      maxTimeMs,
      maxTokens,
      maxIterations,
    },
    dependencyIds: [],
    acceptanceCriteria: [
      "Budget enforcement is respected during execution.",
    ],
    requiredEvidenceTypes: [
      "test",
    ],
    approved:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };
}

function createExecutor(
  task: Task,
  workUnit: WorkUnitContract,
  adapter: AgentExecutionAdapter,
): WorkforceExecutor {
  const registry =
    new WorkforceRegistry();

  const workUnits =
    new WorkUnitRegistry();

  const mission =
    createMission();

  const agent =
    createAgent();

  registry.registerMission(
    mission,
  );

  registry.registerAgent(
    agent,
  );

  registry.registerTask(
    task,
  );

  workUnits.register(
    task.id,
    workUnit,
  );

  return new WorkforceExecutor(
    registry,
    [adapter],
    undefined,
    workUnits,
  );
}

async function main(): Promise<void> {
  const mission =
    createMission();

  const successfulTask =
    createTask(
      "task-budget-within-limit",
      mission.id,
    );

  const successfulWorkUnit =
    createWorkUnit(
      1000,
      100,
      5,
    );

  const successExecutor =
    createExecutor(
      successfulTask,
      successfulWorkUnit,
      new BudgetTestAdapter(
        1,
        50,
        2,
      ),
    );

  const successResult =
    await successExecutor.execute(
      successfulTask.id,
    );

  assert(
    successResult.status ===
      "success",
    "Execution within budget should succeed.",
  );

  assert(
    successResult.usage !==
      undefined,
    "Successful execution must preserve measured usage.",
  );

  assert(
    successResult.usage?.tokensUsed ===
      50,
    "Successful execution must preserve token usage.",
  );

  assert(
    successResult.usage?.iterationsUsed ===
      2,
    "Successful execution must preserve iteration usage.",
  );

  console.log(
    "01.6 authorized execution within budget: SUCCESS",
  );

  console.log(
    "01.6 execution usage preserved: SUCCESS",
  );

  const tokenTask =
    createTask(
      "task-budget-token-over-limit",
      mission.id,
    );

  const tokenWorkUnit =
    createWorkUnit(
      1000,
      100,
      5,
    );

  const tokenExecutor =
    createExecutor(
      tokenTask,
      tokenWorkUnit,
      new BudgetTestAdapter(
        1,
        101,
        2,
      ),
    );

  let tokenBlocked =
    false;

  try {
    await tokenExecutor.execute(
      tokenTask.id,
    );
  } catch (
    error: unknown
  ) {
    tokenBlocked = true;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    assert(
      message.includes(
        "Token budget exceeded",
      ),
      "Token rejection must identify the exceeded token budget.",
    );
  }

  assert(
    tokenBlocked,
    "Execution exceeding the token budget must be blocked.",
  );

  console.log(
    "01.6 token budget execution blocking: SUCCESS",
  );

  const iterationTask =
    createTask(
      "task-budget-iteration-over-limit",
      mission.id,
    );

  const iterationWorkUnit =
    createWorkUnit(
      1000,
      100,
      2,
    );

  const iterationExecutor =
    createExecutor(
      iterationTask,
      iterationWorkUnit,
      new BudgetTestAdapter(
        1,
        50,
        3,
      ),
    );

  let iterationBlocked =
    false;

  try {
    await iterationExecutor.execute(
      iterationTask.id,
    );
  } catch (
    error: unknown
  ) {
    iterationBlocked = true;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    assert(
      message.includes(
        "Iteration budget exceeded",
      ),
      "Iteration rejection must identify the exceeded iteration budget.",
    );
  }

  assert(
    iterationBlocked,
    "Execution exceeding the iteration budget must be blocked.",
  );

  console.log(
    "01.6 iteration budget execution blocking: SUCCESS",
  );

  const timeTask =
    createTask(
      "task-budget-time-over-limit",
      mission.id,
    );

  const timeWorkUnit =
    createWorkUnit(
      1000,
      100,
      5,
    );

  const timeExecutor =
    createExecutor(
      timeTask,
      timeWorkUnit,
      new BudgetTestAdapter(
        1001,
        50,
        2,
      ),
    );

  let timeBlocked =
    false;

  try {
    await timeExecutor.execute(
      timeTask.id,
    );
  } catch (
    error: unknown
  ) {
    timeBlocked = true;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    assert(
      message.includes(
        "Time budget exceeded",
      ),
      "Time rejection must identify the exceeded time budget.",
    );
  }

  assert(
    timeBlocked,
    "Execution exceeding the time budget must be blocked.",
  );

  console.log(
    "01.6 time budget execution blocking: SUCCESS",
  );

  console.log(
    "01.6 end-to-end Budget Authority enforcement: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "01.6 Budget Authority integration: FAILED",
    );

    console.error(
      error,
    );

    throw error;
  },
);
