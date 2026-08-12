import type {
  AgentDefinition,
  Mission,
  Task,
  ToolDefinition,
} from "./types";

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
  ToolGateway,
} from "./tool-gateway";

import type {
  ToolAdapter,
  ToolExecutionRequest,
} from "./tool-gateway";

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

class EchoToolAdapter
  implements ToolAdapter {
  readonly toolId =
    "tool-gateway-test";

  async execute(
    request:
      ToolExecutionRequest,
  ): Promise<unknown> {
    return {
      echoed:
        request.arguments,
      executed:
        true,
    };
  }
}

class ThrowingToolAdapter
  implements ToolAdapter {
  readonly toolId =
    "tool-gateway-throwing";

  async execute(): Promise<unknown> {
    throw new Error(
      "intentional tool failure",
    );
  }
}

function createMission(): Mission {
  return {
    id:
      "mission-tool-gateway",
    name:
      "Tool Gateway Test Mission",
    description:
      "Verify K.I.N.G.S. tool gateway authority.",
    status:
      "active",
    objectives: [
      "Verify tool authorization.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };
}

function createTool(
  id:
    string,
  enabled:
    boolean = true,
): ToolDefinition {
  return {
    id,
    name:
      `Tool ${id}`,
    description:
      "Controlled tool gateway test tool.",
    capabilities: [
      "test-tool",
    ],
    enabled,
  };
}

function createAgent(
  toolIds:
    string[],
  id:
    string = "agent-tool-gateway",
): AgentDefinition {
  return {
    id,
    name:
      "K.I.N.G.S. Tool Gateway Test Agent",
    role:
      "Controlled tool gateway worker",
    description:
      "Agent used to verify gateway authorization.",
    capabilities: [
      "test",
    ],
    toolIds,
    status:
      "available",
  };
}

function createTask(
  missionId:
    string,
  toolIds:
    string[],
): Task {
  return {
    id:
      "task-tool-gateway",
    missionId,
    name:
      "Tool Gateway Test Task",
    description:
      "Task used to verify tool gateway authorization.",
    assignedAgentId:
      "agent-tool-gateway",
    requiredCapabilities: [
      "test",
    ],
    requiredToolIds:
      toolIds,
    status:
      "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Authorized tool execution.",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };
}

function createWorkUnit(
  toolIds:
    string[],
): WorkUnitContract {
  return {
    id:
      "work-unit-tool-gateway",
    role:
      "Controlled tool gateway worker",
    objective:
      "Execute only explicitly authorized tool operations.",
    capabilityIds: [
      "capability-test",
    ],
    allowedToolIds:
      toolIds,
    allowedPaths: [],
    budget: {
      maxTimeMs:
        60_000,
      maxTokens:
        1_000,
      maxIterations:
        3,
    },
    dependencyIds: [],
    acceptanceCriteria: [
      "Tool execution is authorized.",
    ],
    requiredEvidenceTypes: [
      "tool-execution-result",
    ],
    approved:
      true,
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  };
}

async function runTest(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const mission =
    createMission();

  const tool =
    createTool(
      "tool-gateway-test",
    );

  const agent =
    createAgent([
      tool.id,
    ]);

  const task =
    createTask(
      mission.id,
      [
        tool.id,
      ],
    );

  registry.registerMission(
    mission,
  );

  registry.registerTool(
    tool,
  );

  registry.registerAgent(
    agent,
  );

  registry.registerTask(
    task,
  );

  const workUnitRegistry =
    new WorkUnitRegistry();

  workUnitRegistry.register(
    task.id,
    createWorkUnit([
      tool.id,
    ]),
  );

  const gateway =
    new ToolGateway(
      registry,
      workUnitRegistry,
    );

  gateway.registerAdapter(
    new EchoToolAdapter(),
  );

  assert(
    gateway.listAdapters().length ===
      1,
    "Tool adapter registration failed.",
  );

  console.log(
    "04.6 tool adapter registration: SUCCESS",
  );

  const request:
    ToolExecutionRequest = {
    requestId:
      "tool-request-001",
    taskId:
      task.id,
    agentId:
      agent.id,
    toolId:
      tool.id,
    arguments: {
      value:
        "K.I.N.G.S.",
    },
  };

  const authorization =
    gateway.authorize(
      request,
    );

  assert(
    authorization.allowed,
    "Fully authorized tool request was rejected.",
  );

  console.log(
    "04.6 authorized tool boundary: SUCCESS",
  );

  const result =
    await gateway.execute(
      request,
    );

  assert(
    result.success,
    "Authorized tool execution failed.",
  );

  assert(
    (
      result.output as {
        echoed:
          Record<
            string,
            unknown
          >;
      }
    ).echoed.value ===
      "K.I.N.G.S.",
    "Tool output was not preserved.",
  );

  console.log(
    "04.6 authorized tool execution: SUCCESS",
  );

  const unauthorizedAgent =
    createAgent(
      [],
      "agent-tool-gateway-unauthorized",
    );

  registry.registerAgent(
    unauthorizedAgent,
  );

  const agentRejected =
    gateway.authorize({
      ...request,
      requestId:
        "tool-request-agent-rejected",
      agentId:
        unauthorizedAgent.id,
    });

  assert(
    !agentRejected.allowed,
    "Agent without tool authorization was allowed.",
  );

  assert(
    agentRejected.reasons.some(
      (
        reason,
      ) =>
        reason.includes(
          "not authorized",
        ),
    ),
    "Agent authorization failure was not preserved.",
  );

  console.log(
    "04.6 agent authorization enforcement: SUCCESS",
  );

  const taskWithoutTool =
    createTask(
      mission.id,
      [],
    );

  taskWithoutTool.id =
    "task-tool-gateway-no-task-tool";

  registry.registerTask(
    taskWithoutTool,
  );

  workUnitRegistry.register(
    taskWithoutTool.id,
    createWorkUnit([
      tool.id,
    ]),
  );

  const taskRejected =
    gateway.authorize({
      ...request,
      requestId:
        "tool-request-task-rejected",
      taskId:
        taskWithoutTool.id,
    });

  assert(
    !taskRejected.allowed,
    "Task that does not authorize a tool was allowed.",
  );

  assert(
    taskRejected.reasons.some(
      (
        reason,
      ) =>
        reason.includes(
          "does not authorize",
        ),
    ),
    "Task authorization failure was not preserved.",
  );

  console.log(
    "04.6 task tool authorization enforcement: SUCCESS",
  );

  const workUnitWithoutTool =
    createWorkUnit([]);

  const workUnitRejectedRegistry =
    new WorkUnitRegistry();

  workUnitRejectedRegistry.register(
    task.id,
    workUnitWithoutTool,
  );

  const workUnitRejectedGateway =
    new ToolGateway(
      registry,
      workUnitRejectedRegistry,
    );

  workUnitRejectedGateway.registerAdapter(
    new EchoToolAdapter(),
  );

  const workUnitRejected =
    workUnitRejectedGateway.authorize(
      request,
    );

  assert(
    !workUnitRejected.allowed,
    "Tool outside the Work Unit was allowed.",
  );

  assert(
    workUnitRejected.reasons.some(
      (
        reason,
      ) =>
        reason.includes(
          "does not authorize tool",
        ),
    ),
    "Work Unit authorization failure was not preserved.",
  );

  console.log(
    "04.6 Work Unit tool boundary: SUCCESS",
  );

  const disabledTool =
    createTool(
      "tool-gateway-disabled",
      false,
    );

  registry.registerTool(
    disabledTool,
  );

  const disabledWorkUnit =
    new WorkUnitRegistry();

  const disabledTask =
    createTask(
      mission.id,
      [
        disabledTool.id,
      ],
    );

  disabledTask.id =
    "task-tool-gateway-disabled";

  registry.registerTask(
    disabledTask,
  );

  disabledWorkUnit.register(
    disabledTask.id,
    createWorkUnit([
      disabledTool.id,
    ]),
  );

  const disabledGateway =
    new ToolGateway(
      registry,
      disabledWorkUnit,
    );

  const disabledAdapter:
    ToolAdapter = {
    toolId:
      disabledTool.id,

    async execute() {
      return {
        executed:
          true,
      };
    },
  };

  disabledGateway.registerAdapter(
    disabledAdapter,
  );

  const disabledResult =
    await disabledGateway.execute({
      ...request,
      requestId:
        "tool-request-disabled",
      taskId:
        disabledTask.id,
      toolId:
        disabledTool.id,
    });

  assert(
    !disabledResult.success,
    "Disabled tool was allowed to execute.",
  );

  assert(
    disabledResult.errorCode ===
      "TOOL_AUTHORIZATION_REJECTED",
    "Disabled tool rejection code was not preserved.",
  );

  console.log(
    "04.6 disabled tool enforcement: SUCCESS",
  );

  const missingAdapterTool =
    createTool(
      "tool-gateway-no-adapter",
    );

  registry.registerTool(
    missingAdapterTool,
  );

  const missingAdapterTask =
    createTask(
      mission.id,
      [
        missingAdapterTool.id,
      ],
    );

  missingAdapterTask.id =
    "task-tool-gateway-no-adapter";

  registry.registerTask(
    missingAdapterTask,
  );

  const missingAdapterWorkUnit =
    new WorkUnitRegistry();

  missingAdapterWorkUnit.register(
    missingAdapterTask.id,
    createWorkUnit([
      missingAdapterTool.id,
    ]),
  );

  const missingAdapterGateway =
    new ToolGateway(
      registry,
      missingAdapterWorkUnit,
    );

  const missingAdapter =
    await missingAdapterGateway.execute({
      ...request,
      requestId:
        "tool-request-no-adapter",
      taskId:
        missingAdapterTask.id,
      toolId:
        missingAdapterTool.id,
    });

  assert(
    !missingAdapter.success,
    "Tool without an adapter was allowed to execute.",
  );

  assert(
    missingAdapter.errorCode ===
      "TOOL_AUTHORIZATION_REJECTED",
    "Missing adapter should be rejected before execution.",
  );

  assert(
    missingAdapter.errorMessage?.includes(
      "no registered execution adapter",
    ) === true,
    "Missing adapter reason was not preserved.",
  );

  console.log(
    "04.6 missing adapter rejection: SUCCESS",
  );

  const unregistered =
    await gateway.execute({
      ...request,
      requestId:
        "tool-request-unregistered",
      toolId:
        "tool-does-not-exist",
    });

  assert(
    !unregistered.success,
    "Unregistered tool was allowed to execute.",
  );

  assert(
    unregistered.errorCode ===
      "TOOL_AUTHORIZATION_REJECTED",
    "Unregistered tool rejection code was not preserved.",
  );

  console.log(
    "04.6 unregistered tool rejection: SUCCESS",
  );

  const unapprovedWorkUnitRegistry =
    new WorkUnitRegistry();

  const unapprovedContract =
    createWorkUnit([
      tool.id,
    ]);

  unapprovedContract.approved =
    false;

  let unapprovedRejected =
    false;

  try {
    unapprovedWorkUnitRegistry.register(
      task.id,
      unapprovedContract,
    );
  } catch {
    unapprovedRejected =
      true;
  }

  assert(
    unapprovedRejected,
    "Unapproved Work Unit must not enter the gateway.",
  );

  console.log(
    "04.6 unapproved Work Unit rejection: SUCCESS",
  );

  const throwingTool =
    createTool(
      "tool-gateway-throwing",
    );

  registry.registerTool(
    throwingTool,
  );

  const throwingAgent =
    createAgent(
      [
        throwingTool.id,
      ],
      "agent-tool-gateway-throwing",
    );

  registry.registerAgent(
    throwingAgent,
  );

  const throwingTask =
    createTask(
      mission.id,
      [
        throwingTool.id,
      ],
    );

  throwingTask.assignedAgentId =
    throwingAgent.id;

  throwingTask.id =
    "task-tool-gateway-throwing";

  registry.registerTask(
    throwingTask,
  );

  const throwingWorkUnit =
    new WorkUnitRegistry();

  throwingWorkUnit.register(
    throwingTask.id,
    createWorkUnit([
      throwingTool.id,
    ]),
  );

  const throwingGateway =
    new ToolGateway(
      registry,
      throwingWorkUnit,
    );

  throwingGateway.registerAdapter(
    new ThrowingToolAdapter(),
  );

  const failedExecution =
    await throwingGateway.execute({
      ...request,
      requestId:
        "tool-request-throwing",
      taskId:
        throwingTask.id,
      agentId:
        throwingAgent.id,
      toolId:
        throwingTool.id,
    });

  assert(
    !failedExecution.success,
    "Tool adapter failure should be returned as a failed result.",
  );

  assert(
    failedExecution.errorCode ===
      "TOOL_EXECUTION_FAILED",
    "Tool execution failure code was not preserved.",
  );

  assert(
    failedExecution.errorMessage ===
      "intentional tool failure",
    "Tool execution failure message was not preserved.",
  );

  console.log(
    "04.6 tool execution failure preservation: SUCCESS",
  );

  const deterministicA =
    gateway.authorize(
      request,
    );

  const deterministicB =
    gateway.authorize(
      request,
    );

  assert(
    JSON.stringify(
      deterministicA,
    ) ===
      JSON.stringify(
        deterministicB,
      ),
    "Tool authorization decisions must be deterministic.",
  );

  console.log(
    "04.6 deterministic authorization decision: SUCCESS",
  );

  console.log(
    "TREE-04.6 TOOL GATEWAY: SUCCESS",
  );
}

runTest().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
