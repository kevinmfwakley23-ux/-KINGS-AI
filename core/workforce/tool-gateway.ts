import type {
  ID,
  AgentDefinition,
  Task,
  ToolDefinition,
} from "./types";

import {
  WorkforceRegistry,
} from "./registry";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

import {
  WorkUnitRegistry,
} from "./work-unit-registry";

export interface ToolExecutionRequest {
  requestId: ID;
  taskId: ID;
  agentId: ID;
  toolId: ID;
  arguments: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  requestId: ID;
  toolId: ID;
  output?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export interface ToolAdapter {
  readonly toolId: ID;

  execute(
    request: ToolExecutionRequest,
  ): Promise<unknown>;
}

export interface ToolAuthorizationDecision {
  allowed: boolean;
  reasons: string[];
}

export class ToolGateway {
  private readonly adapters =
    new Map<ID, ToolAdapter>();

  constructor(
    private readonly registry:
      WorkforceRegistry,
    private readonly workUnitRegistry:
      WorkUnitRegistry,
  ) {}

  registerAdapter(
    adapter: ToolAdapter,
  ): void {
    if (
      this.adapters.has(
        adapter.toolId,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Tool Gateway: duplicate adapter for tool "${adapter.toolId}"`,
      );
    }

    const tool =
      this.registry.getTool(
        adapter.toolId,
      );

    if (!tool) {
      throw new Error(
        `K.I.N.G.S. Tool Gateway: cannot register adapter for unregistered tool "${adapter.toolId}"`,
      );
    }

    this.adapters.set(
      adapter.toolId,
      adapter,
    );
  }

  authorize(
    request:
      ToolExecutionRequest,
  ):
    ToolAuthorizationDecision {
    const reasons: string[] = [];

    const agent =
      this.registry.getAgent(
        request.agentId,
      );

    const task =
      this.registry.getTask(
        request.taskId,
      );

    const tool =
      this.registry.getTool(
        request.toolId,
      );

    let workUnit:
      WorkUnitContract | undefined;

    try {
      workUnit =
        this.workUnitRegistry.require(
          request.taskId,
        );
    } catch (
      error: unknown
    ) {
      reasons.push(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }

    if (!agent) {
      reasons.push(
        `agent "${request.agentId}" is not registered`,
      );
    }

    if (!task) {
      reasons.push(
        `task "${request.taskId}" is not registered`,
      );
    }

    if (!tool) {
      reasons.push(
        `tool "${request.toolId}" is not registered`,
      );
    }

    if (
      agent &&
      !agent.toolIds.includes(
        request.toolId,
      )
    ) {
      reasons.push(
        `agent "${agent.id}" is not authorized for tool "${request.toolId}"`,
      );
    }

    if (
      task &&
      !task.requiredToolIds.includes(
        request.toolId,
      )
    ) {
      reasons.push(
        `task "${task.id}" does not authorize tool "${request.toolId}"`,
      );
    }

    if (
      tool &&
      !tool.enabled
    ) {
      reasons.push(
        `tool "${tool.id}" is disabled`,
      );
    }

    if (
      workUnit &&
      !workUnit.allowedToolIds.includes(
        request.toolId,
      )
    ) {
      reasons.push(
        `work unit "${workUnit.id}" does not authorize tool "${request.toolId}"`,
      );
    }

    if (
      !this.adapters.has(
        request.toolId,
      )
    ) {
      reasons.push(
        `tool "${request.toolId}" has no registered execution adapter`,
      );
    }

    return {
      allowed:
        reasons.length === 0,
      reasons,
    };
  }

  async execute(
    request:
      ToolExecutionRequest,
  ):
    Promise<ToolExecutionResult> {
    const decision =
      this.authorize(
        request,
      );

    if (
      !decision.allowed
    ) {
      return {
        success:
          false,
        requestId:
          request.requestId,
        toolId:
          request.toolId,
        errorCode:
          "TOOL_AUTHORIZATION_REJECTED",
        errorMessage:
          decision.reasons.join(
            "; ",
          ),
      };
    }

    const adapter =
      this.adapters.get(
        request.toolId,
      );

    if (!adapter) {
      return {
        success:
          false,
        requestId:
          request.requestId,
        toolId:
          request.toolId,
        errorCode:
          "TOOL_ADAPTER_MISSING",
        errorMessage:
          `Tool "${request.toolId}" has no execution adapter.`,
      };
    }

    try {
      const output =
        await adapter.execute(
          request,
        );

      return {
        success:
          true,
        requestId:
          request.requestId,
        toolId:
          request.toolId,
        output,
      };
    } catch (
      error: unknown
    ) {
      return {
        success:
          false,
        requestId:
          request.requestId,
        toolId:
          request.toolId,
        errorCode:
          "TOOL_EXECUTION_FAILED",
        errorMessage:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }

  listAdapters():
    ID[] {
    return Array.from(
      this.adapters.keys(),
    ).sort();
  }

  getTool(
    toolId: ID,
  ):
    ToolDefinition | undefined {
    return this.registry.getTool(
      toolId,
    );
  }

  getAgent(
    agentId: ID,
  ):
    AgentDefinition | undefined {
    return this.registry.getAgent(
      agentId,
    );
  }

  getTask(
    taskId: ID,
  ):
    Task | undefined {
    return this.registry.getTask(
      taskId,
    );
  }
}
