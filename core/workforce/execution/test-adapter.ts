import type {
  AgentDefinition,
  WorkforceResult,
} from "../types";

import type {
  AgentExecutionAdapter,
  AgentExecutionContext,
} from "./adapter";

export class TestExecutionAdapter
  implements AgentExecutionAdapter
{
  readonly id = "test-adapter";
  readonly name = "K.I.N.G.S. Test Adapter";

  canExecute(agent: AgentDefinition): boolean {
    return agent.capabilities.includes("test");
  }

  async execute(
    context: AgentExecutionContext,
  ): Promise<WorkforceResult> {
    return {
      id: `result-${context.task.id}`,
      taskId: context.task.id,
      agentId: context.agent.id,
      status: "success",
      summary: `Test adapter successfully executed task "${context.task.name}".`,
      artifactIds: [],
      reasoning:
        "This result was produced by the K.I.N.G.S. test execution adapter.",
      verificationReferences: [],
      createdAt: new Date().toISOString(),
    };
  }
}
