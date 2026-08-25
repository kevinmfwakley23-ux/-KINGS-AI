import type { WorkforceResult } from "./types";
import { ProductBuildExecutionGateway, type ProductBuildExecutionGatewaySnapshot } from "./product-build-execution-gateway";
import type { ProductBuildWorkerRunner, ProductBuildWorkerExecutionContext } from "./product-build-worker-runner";

export interface ProductBuildExecutionCycleResult {
  initial: ProductBuildExecutionGatewaySnapshot;
  completedTaskId?: string;
  workforceResult?: WorkforceResult;
  next?: ProductBuildExecutionGatewaySnapshot;
  diagnostics?: string;
}

/**
 * Drives one real product-build work cycle through the existing governed
 * gateway: dispatch, specialized execution, verified handoff, then refresh.
 */
export class ProductBuildExecutionCycle {
  constructor(
    private readonly gateway: ProductBuildExecutionGateway,
    private readonly runner: ProductBuildWorkerRunner,
  ) {}

  async run(
    snapshot: ProductBuildExecutionGatewaySnapshot,
  ): Promise<ProductBuildExecutionCycleResult> {
    const dispatch = snapshot.nextDispatch;
    if (!dispatch) {
      return {
        initial: snapshot,
        diagnostics: "K.I.N.G.S. Product Build Execution: no dispatchable task is currently available.",
      };
    }

    const context: ProductBuildWorkerExecutionContext = {
      missionId: snapshot.missionId,
      dispatch,
      snapshot,
    };

    const workerResult = await this.runner.run(context);
    if (!workerResult.completed || !workerResult.result) {
      return {
        initial: snapshot,
        diagnostics: workerResult.diagnostics ?? `Worker for task "${dispatch.taskId}" did not produce a completed verified result.`,
      };
    }

    const handoff = this.gateway.acceptVerifiedResult(workerResult.result);
    if (handoff.status !== "accepted") {
      return {
        initial: snapshot,
        workforceResult: workerResult.result,
        diagnostics: handoff.reason,
      };
    }

    const next = this.gateway.snapshot(snapshot.missionId);
    return {
      initial: snapshot,
      completedTaskId: dispatch.taskId,
      workforceResult: workerResult.result,
      next,
    };
  }
}
