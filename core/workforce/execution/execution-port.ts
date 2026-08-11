import type {
  ID,
} from "../types";

import type {
  AgentExecutionResult,
} from "./adapter";

export interface WorkforceExecutionPort {
  execute(
    taskId: ID,
  ): Promise<AgentExecutionResult>;
}
