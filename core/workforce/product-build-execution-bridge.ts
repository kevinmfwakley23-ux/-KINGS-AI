import type { ID, Mission } from "./types";
import type { MissionPlan } from "./mission-continuity";
import { WorkforceRegistry } from "./registry";
import { ProductBuildMissionAssembler, type ProductBuildMissionAssemblyResult } from "./product-build-mission-assembler";
import { MissionExecutionCoordinator, type MissionExecutionCoordinatorSnapshot, type MissionExecutionDispatch } from "./mission-execution-coordinator";

export interface ProductBuildExecutionStartRequest {
  mission: Mission;
  plan: MissionPlan;
  ownerVision: string;
}

export interface ProductBuildExecutionStartResult {
  missionId: ID;
  assembly: ProductBuildMissionAssemblyResult;
  snapshot: MissionExecutionCoordinatorSnapshot;
  firstDispatch?: MissionExecutionDispatch;
}

/**
 * Bridges product-scale mission assembly into the existing governed workforce
 * coordinator. It does not execute tools itself; it only prepares the mission
 * graph and requests the first qualified dispatch.
 */
export class ProductBuildExecutionBridge {
  private readonly assembler: ProductBuildMissionAssembler;
  private readonly coordinator: MissionExecutionCoordinator;

  constructor(private readonly registry: WorkforceRegistry) {
    this.assembler = new ProductBuildMissionAssembler(registry);
    this.coordinator = new MissionExecutionCoordinator({ registry });
  }

  start(request: ProductBuildExecutionStartRequest): ProductBuildExecutionStartResult {
    const existingMission = this.registry.getMission(request.mission.id);
    if (!existingMission) {
      this.registry.registerMission(request.mission);
    }
    const assembly = this.assembler.assemble(request);
    const snapshot = this.coordinator.snapshot(request.mission.id);
    const firstDispatch = this.coordinator.dispatchNext(request.mission.id);

    return {
      missionId: request.mission.id,
      assembly,
      snapshot,
      firstDispatch,
    };
  }

  coordinatorSnapshot(missionId: ID): MissionExecutionCoordinatorSnapshot {
    return this.coordinator.snapshot(missionId);
  }
}
