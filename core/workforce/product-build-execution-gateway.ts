import type { ID, Mission, WorkforceResult } from "./types";
import { WorkforceRegistry } from "./registry";
import type { MissionPlan } from "./mission-continuity";
import { ProductBuildMissionAssembler, type ProductBuildMissionAssemblyResult } from "./product-build-mission-assembler";
import { MissionExecutionCoordinator, type MissionExecutionDispatch } from "./mission-execution-coordinator";

export interface ProductBuildExecutionGatewayRequest {
  mission: Mission;
  plan: MissionPlan;
  ownerVision: string;
}

export interface ProductBuildExecutionGatewaySnapshot {
  missionId: ID;
  assembly: ProductBuildMissionAssemblyResult;
  execution: ReturnType<MissionExecutionCoordinator["snapshot"]>;
  nextDispatch?: MissionExecutionDispatch;
}

/**
 * Product-level entrypoint for turning an approved application mission into
 * executable governed workforce work. This gateway assembles the product
 * graph once, then delegates scheduling/assignment/result flow to the existing
 * mission execution coordinator.
 */
export class ProductBuildExecutionGateway {
  private readonly assembler: ProductBuildMissionAssembler;
  private readonly coordinator: MissionExecutionCoordinator;
  private assembled = new Map<ID, ProductBuildMissionAssemblyResult>();

  constructor(
    private readonly registry: WorkforceRegistry,
    assembler?: ProductBuildMissionAssembler,
    coordinator?: MissionExecutionCoordinator,
  ) {
    this.assembler = assembler ?? new ProductBuildMissionAssembler(registry);
    this.coordinator = coordinator ?? new MissionExecutionCoordinator({ registry });
  }

  start(request: ProductBuildExecutionGatewayRequest): ProductBuildExecutionGatewaySnapshot {
    const existing = this.assembled.get(request.mission.id);
    const assembly = existing ?? this.assembler.assemble(request);

    this.assembled.set(request.mission.id, assembly);

    const execution = this.coordinator.snapshot(request.mission.id);

    return {
      missionId: request.mission.id,
      assembly,
      execution,
      nextDispatch: execution.dispatchableTaskIds.length > 0
        ? this.coordinator.dispatchNext(request.mission.id)
        : undefined,
    };
  }

  acceptVerifiedResult(result: WorkforceResult): ReturnType<MissionExecutionCoordinator["acceptVerifiedResult"]> {
    return this.coordinator.acceptVerifiedResult(result);
  }

  snapshot(missionId: ID): ProductBuildExecutionGatewaySnapshot {
    const assembly = this.assembled.get(missionId);
    if (!assembly) {
      throw new Error(`K.I.N.G.S. Product Build Execution: mission "${missionId}" has not been assembled`);
    }

    const execution = this.coordinator.snapshot(missionId);

    return {
      missionId,
      assembly,
      execution,
      nextDispatch: execution.dispatchableTaskIds.length > 0
        ? this.coordinator.dispatchNext(missionId)
        : undefined,
    };
  }
}
