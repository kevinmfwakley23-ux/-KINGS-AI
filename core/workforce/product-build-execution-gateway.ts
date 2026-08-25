import type { ID, Mission, WorkforceResult } from "./types";
import { WorkforceRegistry } from "./registry";
import type { MissionPlan } from "./mission-continuity";
import { ProductBuildMissionAssembler, type ProductBuildMissionAssemblyResult } from "./product-build-mission-assembler";
import { MissionExecutionCoordinator, type MissionExecutionDispatch } from "./mission-execution-coordinator";
import type { WorkforceExecutorKind } from "./workforce-role-dispatcher";

export interface ProductBuildExecutionGatewayRequest {
  mission: Mission;
  plan: MissionPlan;
  ownerVision: string;
}

export interface ProductBuildExecutionGatewaySnapshot {
  missionId: ID;
  assembly: ProductBuildMissionAssemblyResult;
  execution: ReturnType<MissionExecutionCoordinator["snapshot"]>;
  nextDispatch?: MissionExecutionDispatch & {
    executor: WorkforceExecutorKind;
  };
}

/**
 * Product-level entrypoint for turning an approved application mission into
 * executable governed workforce work.
 *
 * K.I.N.G.S. is the brains and brawn: all workforce execution is performed by
 * K.I.N.G.S.-owned internal roles. External models, web research, providers,
 * and other services are capabilities/tools invoked under K.I.N.G.S. authority,
 * never external workforce executors.
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
    const dispatch = execution.dispatchableTaskIds.length > 0
      ? this.coordinator.dispatchNext(request.mission.id)
      : undefined;

    return {
      missionId: request.mission.id,
      assembly,
      execution,
      nextDispatch: dispatch
        ? { ...dispatch, executor: "kings-internal" }
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
    const dispatch = execution.dispatchableTaskIds.length > 0
      ? this.coordinator.dispatchNext(missionId)
      : undefined;

    return {
      missionId,
      assembly,
      execution,
      nextDispatch: dispatch
        ? { ...dispatch, executor: "kings-internal" }
        : undefined,
    };
  }
}
