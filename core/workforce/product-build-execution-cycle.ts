import type { WorkforceResult } from "./types";
import { ProductBuildExecutionGateway, type ProductBuildExecutionState } from "./product-build-execution-gateway";
import type { ProductBuildWorkerRunner } from "./product-build-worker-runner";

export interface ProductBuildExecutionCycleResult {
  completedTaskId?: string;
  workforceResult?: WorkforceResult;
  snapshot: ProductBuildExecutionState;
}

export class ProductBuildExecutionCycle {
  constructor(
    private readonly gateway: ProductBuildExecutionGateway,
    private readonly runner: ProductBuildWorkerRunner,
  ) {}

  async run(state: ProductBuildExecutionState): Promise<ProductBuildExecutionCycleResult> {
    const dispatch = state.dispatch ?? this.gateway.dispatchNext(state.missionId);
    if (!dispatch) return { snapshot: this.gateway.snapshot(state.missionId) };

    try {
      const worker = await this.runner.run({ dispatch });
      if (!worker.completed || worker.result?.status === "failure" || worker.result?.status === "rejected") {
        this.gateway.failTask(dispatch.taskId);
        return { workforceResult: worker.result, snapshot: this.gateway.snapshot(state.missionId) };
      }
      this.gateway.completeTask(dispatch.taskId);
      return {
        completedTaskId: dispatch.taskId,
        workforceResult: worker.result,
        snapshot: this.gateway.snapshot(state.missionId),
      };
    } catch (error) {
      this.gateway.failTask(dispatch.taskId);
      throw error;
    }
  }
}
