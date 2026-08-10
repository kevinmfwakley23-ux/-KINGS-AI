import type {
  ID,
  WorkforceResult,
} from "../types";

export interface WorkforceExecutionPort {
  execute(
    taskId: ID,
  ): Promise<WorkforceResult>;
}
