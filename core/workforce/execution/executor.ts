import type {
  ID,
} from "../types";

import type {
  AgentExecutionAdapter,
  AgentExecutionResult,
} from "./adapter";

import type {
  WorkforceExecutionPort,
} from "./execution-port";

import type {
  WorkforceRegistry,
} from "../registry";

import type {
  KnowledgeRuntimeAdapter,
} from "../knowledge-runtime-adapter";

import {
  ExecutionContextBuilder,
} from "./context-builder";

import type {
  GovernedMemoryExecutionPipelineOptions,
} from "../memory-governed-execution-pipeline";

import type {
  GovernedMemoryExecutionPipeline,
} from "../memory-governed-execution-pipeline";

import {
  BudgetAuthority,
} from "../budget-authority";

import type {
  WorkUnitRegistry,
} from "../work-unit-registry";

export class WorkforceExecutor
  implements WorkforceExecutionPort
{
  private readonly contextBuilder:
    ExecutionContextBuilder;

  private readonly budgetAuthority:
    BudgetAuthority;

  constructor(
    private readonly registry: WorkforceRegistry,
    private readonly adapters:
      AgentExecutionAdapter[] = [],
    knowledgeRuntime?:
      KnowledgeRuntimeAdapter,
    private readonly workUnitRegistry?:
      WorkUnitRegistry,
    budgetAuthority:
      BudgetAuthority =
        new BudgetAuthority(),

    private readonly governedMemoryPipeline?:
      GovernedMemoryExecutionPipeline,

    private readonly governedMemoryOptionsProvider?:
      (
        taskId: ID,
      ) =>
        Promise<
          GovernedMemoryExecutionPipelineOptions
        >,
  ) {
    this.contextBuilder =
      new ExecutionContextBuilder(
        knowledgeRuntime,

        undefined,

        undefined,

        this.governedMemoryPipeline,
      );

    this.budgetAuthority =
      budgetAuthority;
  }

  async execute(
    taskId: ID,
  ): Promise<AgentExecutionResult> {
    const startedAt =
      Date.now();

    const task =
      this.registry.getTask(
        taskId,
      );

    if (!task) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: task "${taskId}" not found`,
      );
    }

    // Direct executor callers historically enter with a ready task. The
    // governed TaskExecutionController now claims execution ownership first
    // and therefore enters this lower-level port with the task already running.
    // Both states are executable here; terminal/blocked states remain rejected.
    if (
      task.status !== "ready" &&
      task.status !== "running"
    ) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: task "${taskId}" ` +
        `is not executable because its status is "${task.status}"`,
      );
    }

    if (
      !task.assignedAgentId
    ) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: task "${taskId}" has no assigned agent`,
      );
    }

    const agent =
      this.registry.getAgent(
        task.assignedAgentId,
      );

    if (!agent) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: agent "${task.assignedAgentId}" not found`,
      );
    }

    const missingCapabilities =
      task.requiredCapabilities.filter(
        (capability) =>
          !agent.capabilities.includes(
            capability,
          ),
      );

    if (
      missingCapabilities.length > 0
    ) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: agent "${agent.id}" ` +
        `lacks required capabilities: ${missingCapabilities.join(", ")}`,
      );
    }

    const unauthorizedTools:
      string[] = [];

    for (
      const toolId of
      task.requiredToolIds
    ) {
      const tool =
        this.registry.getTool(
          toolId,
        );

      if (!tool) {
        unauthorizedTools.push(
          `${toolId} (not registered)`,
        );
        continue;
      }

      if (
        !agent.toolIds.includes(
          toolId,
        )
      ) {
        unauthorizedTools.push(
          `${toolId} (agent not authorized)`,
        );
        continue;
      }

      if (!tool.enabled) {
        unauthorizedTools.push(
          `${toolId} (tool disabled)`,
        );
      }
    }

    if (
      unauthorizedTools.length > 0
    ) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: agent "${agent.id}" ` +
        `cannot access required tools: ${unauthorizedTools.join(", ")}.`,
      );
    }

    const adapter =
      this.adapters.find(
        (candidate) =>
          candidate.canExecute(
            agent,
          ),
      );

    if (!adapter) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: no adapter can execute agent "${agent.id}"`,
      );
    }

    if (!this.workUnitRegistry) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: no Work Unit Registry is configured for task "${taskId}"`,
      );
    }

    const workUnit =
      this.workUnitRegistry.require(
        taskId,
      );

    const budgetValidation =
      this.budgetAuthority.validateBudget(
        workUnit.budget,
      );

    if (
      !budgetValidation.allowed
    ) {
      throw new Error(
        `K.I.N.G.S. Workforce Executor: invalid Work Unit budget: ` +
        budgetValidation.reasons.join(
          " ",
        ),
      );
    }

    let governedMemoryOptions:
      GovernedMemoryExecutionPipelineOptions |
      undefined;

    if (
      this.governedMemoryPipeline
    ) {
      if (
        !this.governedMemoryOptionsProvider
      ) {
        throw new Error(
          `K.I.N.G.S. Workforce Executor: governed memory is configured but no governed memory options provider is configured for task "${taskId}"`,
        );
      }

      governedMemoryOptions =
        await this.governedMemoryOptionsProvider(
          taskId,
        );
    }

    const context =
      await this.contextBuilder.build(
        agent,
        task,
        workUnit,
        governedMemoryOptions,
      );

    const result =
      await adapter.execute(
        context,
      );

    const measuredElapsedMs =
      Date.now() -
      startedAt;

    const usage =
      result.usage ?? {
        elapsedMs:
          measuredElapsedMs,
        tokensUsed:
          0,
        iterationsUsed:
          1,
      };

    const effectiveUsage = {
      elapsedMs:
        Math.max(
          measuredElapsedMs,
          usage.elapsedMs,
        ),
      tokensUsed:
        usage.tokensUsed,
      iterationsUsed:
        usage.iterationsUsed,
      estimatedCost:
        usage.estimatedCost,
    };

    this.budgetAuthority.assertAllowed(
      workUnit.budget,
      effectiveUsage,
    );

    return {
      ...result,
      usage:
        effectiveUsage,
    };
  }
}
