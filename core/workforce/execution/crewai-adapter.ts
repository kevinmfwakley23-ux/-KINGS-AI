import type {
  AgentDefinition,
  WorkforceResult,
} from "../types";

import type {
  AgentExecutionAdapter,
  AgentExecutionContext,
} from "./adapter";

const CREWAI_PYTHON =
  "~/.local/share/uv/tools/crewai/bin/python";

export class CrewAIExecutionAdapter
  implements AgentExecutionAdapter
{
  readonly id = "crewai";
  readonly name = "CrewAI Execution Adapter";

  canExecute(agent: AgentDefinition): boolean {
    return agent.capabilities.includes("crewai");
  }

  async execute(
    context: AgentExecutionContext,
  ): Promise<WorkforceResult> {
    throw new Error(
      `CrewAI adapter execution bridge is not implemented yet for agent "${context.agent.id}". ` +
        `Configured CrewAI Python: ${CREWAI_PYTHON}`,
    );
  }
}
