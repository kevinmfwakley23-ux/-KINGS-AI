import type {
  ID,
} from "./types";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

import {
  validateWorkUnitContract,
} from "./work-unit-contract";

export interface BoundWorkUnit {
  taskId: ID;
  contract: WorkUnitContract;
}

export class WorkUnitRegistry {
  private readonly workUnits =
    new Map<ID, BoundWorkUnit>();

  register(
    taskId: ID,
    contract: WorkUnitContract,
  ): void {
    if (!taskId.trim()) {
      throw new Error(
        "K.I.N.G.S. Work Unit Registry: taskId is required",
      );
    }

    const validation =
      validateWorkUnitContract(
        contract,
      );

    if (!validation.valid) {
      throw new Error(
        "K.I.N.G.S. Work Unit Registry: invalid work unit contract: " +
        validation.reasons.join(" "),
      );
    }

    if (
      this.workUnits.has(taskId)
    ) {
      throw new Error(
        `K.I.N.G.S. Work Unit Registry: task "${taskId}" already has a work unit`,
      );
    }

    this.workUnits.set(
      taskId,
      {
        taskId,
        contract,
      },
    );
  }

  get(
    taskId: ID,
  ): WorkUnitContract | undefined {
    return this.workUnits.get(
      taskId,
    )?.contract;
  }

  require(
    taskId: ID,
  ): WorkUnitContract {
    const contract =
      this.get(taskId);

    if (!contract) {
      throw new Error(
        `K.I.N.G.S. Work Unit Registry: no work unit is bound to task "${taskId}"`,
      );
    }

    return contract;
  }

  has(
    taskId: ID,
  ): boolean {
    return this.workUnits.has(
      taskId,
    );
  }

  list(): BoundWorkUnit[] {
    return [
      ...this.workUnits.values(),
    ];
  }

  clear(): void {
    this.workUnits.clear();
  }
}
