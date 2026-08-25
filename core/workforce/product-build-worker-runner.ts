import type { ID, WorkforceResult } from "./types";
import type { MissionExecutionDispatch } from "./mission-execution-coordinator";
import type { ProductBuildExecutionGatewaySnapshot } from "./product-build-execution-gateway";

export interface ProductBuildWorkerExecutionContext {
  missionId: ID;
  dispatch: MissionExecutionDispatch;
  snapshot: ProductBuildExecutionGatewaySnapshot;
}

export interface ProductBuildWorkerExecutionResult {
  completed: boolean;
  result?: WorkforceResult;
  diagnostics?: string;
}

/**
 * Boundary between workforce dispatch and specialized execution authorities.
 * The runner does not decide policy or grant tools; it invokes a role-specific
 * adapter selected by the caller and returns a verified workforce result.
 */
export interface ProductBuildWorkerRunner {
  run(context: ProductBuildWorkerExecutionContext): Promise<ProductBuildWorkerExecutionResult>;
}
