import type { WorkforceResult } from "./types";
import type { MissionExecutionDispatch } from "./mission-execution-coordinator";

export interface ProductBuildWorkerContext {
  dispatch: MissionExecutionDispatch;
}

export interface ProductBuildWorkerRunResult {
  completed: boolean;
  result?: WorkforceResult;
}

export interface ProductBuildWorkerRunner {
  run(context: ProductBuildWorkerContext): Promise<ProductBuildWorkerRunResult>;
}
