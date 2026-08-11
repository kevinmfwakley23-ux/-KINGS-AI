import type {
  AgentDefinition,
} from "../types";

import type {
  AgentExecutionAdapter,
  AgentExecutionContext,
  AgentExecutionResult,
} from "./adapter";

export class TestExecutionAdapter
  implements AgentExecutionAdapter
{
  readonly id =
    "test-adapter";

  readonly name =
    "K.I.N.G.S. Test Adapter";

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
        `Test adapter successfully executed task "${context.task.name}".`,
      artifactIds: [],
      reasoning:
        "This result was produced by the K.I.N.G.S. test execution adapter.",
      verificationReferences: [],
      createdAt:
        new Date().toISOString(),
      usage: {
        elapsedMs: 1,
        tokensUsed: 1,
        iterationsUsed: 1,
      },
    };
  }
}
