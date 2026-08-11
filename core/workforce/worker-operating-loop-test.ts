import type {
  AgentDefinition,
  Mission,
  Task,
  ToolDefinition,
} from "./types";

import type {
  AgentExecutionResult,
} from "./execution/adapter";

import type {
  WorkforceExecutionPort,
} from "./execution/execution-port";

import {
  WorkforceRegistry,
} from "./registry";

import {
  WorkUnitRegistry,
} from "./work-unit-registry";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

import {
  WorkerOperatingLoopAuthority,
  type WorkerIterationEvidence,
  type WorkerIterationEvidenceProvider,
} from "./worker-operating-loop";

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

function now(): string {
  return new Date().toISOString();
}

function createMission(
  id: string,
): Mission {
  return {
    id,
    name:
      "Worker Operating Loop Test Mission",
    description:
      "Verify the bounded worker operating loop.",
    status:
      "active",
    objectives: [
      "Verify observe-reason-act-observe-verify coordination.",
    ],
    sourceReferences: [],
    createdAt:
      now(),
    updatedAt:
      now(),
  };
}

function createAgent(
  id: string,
): AgentDefinition {
  return {
    id,
    name:
      `Worker Loop Test Agent ${id}`,
    role:
      "Worker operating loop test worker",
    description:
      "Worker used by the Tree 02.5 regression test.",
    capabilities: [
      "worker-loop-test",
    ],
    toolIds: [],
    status:
      "available",
  };
}

function createTask(
  missionId: string,
  id: string,
): Task {
  return {
    id,
    missionId,
    name:
      `Worker Loop Task ${id}`,
    description:
      "Task used by the Tree 02.5 operating loop test.",
    assignedAgentId:
      "agent-worker-loop-test",
    requiredCapabilities: [
      "worker-loop-test",
    ],
    requiredToolIds: [],
    status:
      "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Verified worker completion",
    ],
    createdAt:
      now(),
    updatedAt:
      now(),
  };
}

function createContract(
  id: string,
  maxIterations: number,
): WorkUnitContract {
  return {
    id,
    role:
      "Bounded worker loop test role",
    objective:
      "Complete the worker operating loop test objective.",
    capabilityIds: [
      "worker-loop-test",
    ],
    allowedToolIds: [],
    allowedPaths: [
      "core/workforce",
    ],
    budget: {
      maxTimeMs:
        60_000,
      maxTokens:
        10_000,
      maxIterations,
    },
    dependencyIds: [],
    acceptanceCriteria: [
      "Worker operating loop objective is verified.",
    ],
    requiredEvidenceTypes: [
      "test",
      "verification",
    ],
    approved:
      true,
    createdAt:
      now(),
    updatedAt:
      now(),
  };
}

function createResult(
  taskId: string,
  status:
    | "success"
    | "partial"
    | "failure"
    | "rejected",
  iteration: number,
): AgentExecutionResult {
  return {
    id:
      `result-${taskId}-${iteration}`,
    taskId,
    agentId:
      "agent-worker-loop-test",
    status,
    summary:
      `Worker loop test execution ${iteration}.`,
    artifactIds: [],
    reasoning:
      "Controlled test execution result.",
    verificationReferences: [
      `verification-${taskId}-${iteration}`,
    ],
    createdAt:
      now(),
    usage: {
      elapsedMs:
        5,
      tokensUsed:
        10,
      iterationsUsed:
        1,
    },
  };
}

class SequencedExecutionPort
implements WorkforceExecutionPort {
  private index =
    0;

  constructor(
    private readonly statuses:
      (
        | "success"
        | "partial"
        | "failure"
        | "rejected"
      )[],
  ) {}

  async execute(
    taskId: string,
  ): Promise<
    AgentExecutionResult
  > {
    const status =
      this.statuses[
        Math.min(
          this.index,
          this.statuses.length -
            1,
        )
      ];

    this.index += 1;

    return createResult(
      taskId,
      status,
      this.index,
    );
  }
}

class SequencedEvidenceProvider
implements WorkerIterationEvidenceProvider {
  private index =
    0;

  constructor(
    private readonly outcomes:
      {
        verified: boolean;
        complete: boolean;
      }[],
  ) {}

  async collectAndVerify(
    taskId: string,
    _result: AgentExecutionResult,
    _iteration: number,
  ): Promise<
    WorkerIterationEvidence
  > {
    const outcome =
      this.outcomes[
        Math.min(
          this.index,
          this.outcomes.length -
            1,
        )
      ];

    this.index += 1;

    const criterion =
      "Worker operating loop objective is verified.";

    const evidence:
      WorkerIterationEvidence = {
      evidence: [
        {
          id:
            `test-evidence-${taskId}-${this.index}`,
          type:
            "test",
          criterion:
            outcome.complete
              ? criterion
              : "Some other criterion.",
          status:
            outcome.complete &&
            outcome.verified
              ? "passed"
              : "failed",
          summary:
            outcome.complete
              ? "The worker loop objective was verified."
              : "The worker loop objective remains incomplete.",
          verificationReference:
            `test-verification-${taskId}-${this.index}`,
          createdAt:
            now(),
        },
        {
          id:
            `verification-evidence-${taskId}-${this.index}`,
          type:
            "verification",
          criterion:
            outcome.complete
              ? criterion
              : "Some other criterion.",
          status:
            outcome.verified &&
            outcome.complete
              ? "passed"
              : "failed",
          summary:
            outcome.verified
              ? "Verification completed."
              : "Verification failed.",
          verificationReference:
            `test-verification-reference-${taskId}-${this.index}`,
          createdAt:
            now(),
        },
      ],
      verified:
        outcome.verified,
      verificationReasons:
        outcome.verified
          ? []
          : [
              "Test verification intentionally failed.",
            ],
    };

    return evidence;
  }
}

function createRegistry(
  missionId: string,
  taskId: string,
  contractIterations: number,
): {
  registry: WorkforceRegistry;
  workUnits: WorkUnitRegistry;
} {
  const registry =
    new WorkforceRegistry();

  const workUnits =
    new WorkUnitRegistry();

  const mission =
    createMission(
      missionId,
    );

  const agent =
    createAgent(
      "agent-worker-loop-test",
    );

  const task =
    createTask(
      missionId,
      taskId,
    );

  const tool: ToolDefinition = {
    id:
      `tool-${taskId}`,
    name:
      "Worker Loop Test Tool",
    description:
      "Unused tool required only for registry completeness.",
    capabilities: [],
    enabled:
      true,
  };

  registry.registerMission(
    mission,
  );

  registry.registerAgent(
    agent,
  );

  registry.registerTool(
    tool,
  );

  registry.registerTask(
    task,
  );

  workUnits.register(
    taskId,
    createContract(
      `work-unit-${taskId}`,
      contractIterations,
    ),
  );

  return {
    registry,
    workUnits,
  };
}

async function main(): Promise<void> {
  /*
   * TEST 1
   *
   * One successful execution, verified evidence,
   * passing completion gate.
   */
  {
    const {
      registry,
      workUnits,
    } =
      createRegistry(
        "mission-worker-loop-001",
        "task-worker-loop-001",
        3,
      );

    const loop =
      new WorkerOperatingLoopAuthority(
        registry,
        workUnits,
        new SequencedExecutionPort([
          "success",
        ]),
        new SequencedEvidenceProvider([
          {
            verified:
              true,
            complete:
              true,
          },
        ]),
      );

    const result =
      await loop.execute(
        "task-worker-loop-001",
      );

    assert(
      result.status ===
        "completed",
      "Verified successful work must complete.",
    );

    assert(
      result.iterationsUsed ===
        1,
      "Completed work should stop after the first iteration.",
    );

    assert(
      result.completion.passed,
      "Completion Gate must pass verified acceptance evidence.",
    );

    console.log(
      "02.5 observe-reason-act-observe-verify cycle: SUCCESS",
    );

    console.log(
      "02.5 verified completion gate: SUCCESS",
    );
  }

  /*
   * TEST 2
   *
   * First iteration is incomplete.
   * Second iteration produces verified completion.
   */
  {
    const {
      registry,
      workUnits,
    } =
      createRegistry(
        "mission-worker-loop-002",
        "task-worker-loop-002",
        3,
      );

    const loop =
      new WorkerOperatingLoopAuthority(
        registry,
        workUnits,
        new SequencedExecutionPort([
          "partial",
          "success",
        ]),
        new SequencedEvidenceProvider([
          {
            verified:
              true,
            complete:
              false,
          },
          {
            verified:
              true,
            complete:
              true,
          },
        ]),
      );

    const result =
      await loop.execute(
        "task-worker-loop-002",
      );

    assert(
      result.status ===
        "completed",
      "Incomplete first iteration must be allowed to continue.",
    );

    assert(
      result.iterationsUsed ===
        2,
      "Loop must use the second bounded iteration.",
    );

    assert(
      result.iterations.length ===
        2,
      "Two iterations must be recorded.",
    );

    console.log(
      "02.5 bounded continuation after incomplete work: SUCCESS",
    );

    console.log(
      "02.5 iteration history preservation: SUCCESS",
    );
  }

  /*
   * TEST 3
   *
   * Verification failure must prevent completion.
   * A later bounded iteration may succeed.
   */
  {
    const {
      registry,
      workUnits,
    } =
      createRegistry(
        "mission-worker-loop-003",
        "task-worker-loop-003",
        3,
      );

    const loop =
      new WorkerOperatingLoopAuthority(
        registry,
        workUnits,
        new SequencedExecutionPort([
          "success",
          "success",
        ]),
        new SequencedEvidenceProvider([
          {
            verified:
              false,
            complete:
              true,
          },
          {
            verified:
              true,
            complete:
              true,
          },
        ]),
      );

    const result =
      await loop.execute(
        "task-worker-loop-003",
      );

    assert(
      result.status ===
        "completed",
      "Verified second iteration must be able to complete the work.",
    );

    assert(
      result.iterationsUsed ===
        2,
      "Verification failure must prevent first-iteration completion.",
    );

    assert(
      result.iterations[0]
        .completion.passed ===
        false,
      "Failed verification must block the Completion Gate.",
    );

    console.log(
      "02.5 verification blocks premature completion: SUCCESS",
    );
  }

  /*
   * TEST 4
   *
   * Iteration budget exhaustion must stop the loop.
   */
  {
    const {
      registry,
      workUnits,
    } =
      createRegistry(
        "mission-worker-loop-004",
        "task-worker-loop-004",
        2,
      );

    const loop =
      new WorkerOperatingLoopAuthority(
        registry,
        workUnits,
        new SequencedExecutionPort([
          "partial",
          "partial",
        ]),
        new SequencedEvidenceProvider([
          {
            verified:
              true,
            complete:
              false,
          },
          {
            verified:
              true,
            complete:
              false,
          },
        ]),
      );

    const result =
      await loop.execute(
        "task-worker-loop-004",
      );

    assert(
      result.status ===
        "budget-exhausted",
      "Incomplete work must stop when maxIterations is reached.",
    );

    assert(
      result.iterationsUsed ===
        2,
      "Loop must never exceed maxIterations.",
    );

    assert(
      result.iterations.length ===
        2,
      "Budget exhaustion must preserve all bounded iterations.",
    );

    console.log(
      "02.5 iteration budget boundary: SUCCESS",
    );

    console.log(
      "02.5 bounded loop termination: SUCCESS",
    );
  }

  /*
   * TEST 5
   *
   * Hard execution failure must stop rather than
   * silently retrying.
   */
  {
    const {
      registry,
      workUnits,
    } =
      createRegistry(
        "mission-worker-loop-005",
        "task-worker-loop-005",
        3,
      );

    const loop =
      new WorkerOperatingLoopAuthority(
        registry,
        workUnits,
        new SequencedExecutionPort([
          "failure",
          "success",
        ]),
        new SequencedEvidenceProvider([
          {
            verified:
              true,
            complete:
              true,
          },
        ]),
      );

    const result =
      await loop.execute(
        "task-worker-loop-005",
      );

    assert(
      result.status ===
        "failed",
      "Hard execution failure must be preserved.",
    );

    assert(
      result.stopReason ===
        "execution-failed",
      "Execution failure must have an explicit stop reason.",
    );

    assert(
      result.iterationsUsed ===
        1,
      "Hard execution failure must not trigger an uncontrolled retry.",
    );

    console.log(
      "02.5 execution failure preservation: SUCCESS",
    );

    console.log(
      "02.5 no uncontrolled retry: SUCCESS",
    );
  }

  /*
   * TEST 6
   *
   * The worker loop must not own task-state transitions.
   */
  {
    const {
      registry,
      workUnits,
    } =
      createRegistry(
        "mission-worker-loop-006",
        "task-worker-loop-006",
        1,
      );

    const loop =
      new WorkerOperatingLoopAuthority(
        registry,
        workUnits,
        new SequencedExecutionPort([
          "success",
        ]),
        new SequencedEvidenceProvider([
          {
            verified:
              true,
            complete:
              true,
          },
        ]),
      );

    await loop.execute(
      "task-worker-loop-006",
    );

    assert(
      registry.getTask(
        "task-worker-loop-006",
      )?.status ===
        "ready",
      "Worker loop must not mutate task lifecycle state.",
    );

    console.log(
      "02.5 task-state authority boundary: SUCCESS",
    );
  }

  console.log(
    "TREE-02.5 WORKER OPERATING LOOP: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "=== TREE-02.5 FAILED ===",
    );
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
