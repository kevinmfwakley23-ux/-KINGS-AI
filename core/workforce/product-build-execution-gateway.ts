import type { ID, Mission } from "./types";
import type { MissionPlan } from "./mission-continuity";
import { WorkforceRegistry } from "./registry";
import { ProductBuildMissionAssembler, type ProductBuildMissionAssemblyRequest, type ProductBuildMissionAssemblyResult } from "./product-build-mission-assembler";
import { MissionExecutionCoordinator, type MissionExecutionCoordinatorSnapshot, type MissionExecutionDispatch } from "./mission-execution-coordinator";

export interface ProductBuildExecutionStartRequest {
  mission: Mission;
  plan: MissionPlan;
  ownerVision: string;
}

export interface ProductBuildExecutionState {
  missionId: ID;
  snapshot: MissionExecutionCoordinatorSnapshot;
  dispatch?: MissionExecutionDispatch;
}

export class ProductBuildExecutionGateway {
  private readonly coordinator: MissionExecutionCoordinator;

  constructor(
    private readonly registry: WorkforceRegistry,
    private readonly assembler: Pick<ProductBuildMissionAssembler, "assemble"> = new ProductBuildMissionAssembler(registry),
  ) {
    this.coordinator = new MissionExecutionCoordinator({ registry });
  }

  start(request: ProductBuildExecutionStartRequest): ProductBuildMissionAssemblyResult {
    if (!this.registry.getMission(request.mission.id)) this.registry.registerMission(request.mission);
    const assembly = this.assembler.assemble(request as ProductBuildMissionAssemblyRequest);
    return assembly;
  }

  snapshot(missionId: ID): ProductBuildExecutionState {
    return { missionId, snapshot: this.coordinator.snapshot(missionId), dispatch: this.coordinator.dispatchNext(missionId) };
  }

  dispatchNext(missionId: ID): MissionExecutionDispatch | undefined {
    return this.coordinator.dispatchNext(missionId);
  }

  completeTask(taskId: ID): void { this.coordinator.completeTask(taskId); }
  failTask(taskId: ID): void { this.coordinator.failTask(taskId); }
}
