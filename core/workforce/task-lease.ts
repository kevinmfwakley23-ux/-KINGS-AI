import type {
  ID,
} from "./types";

import type {
  WorkforceRegistry,
} from "./registry";

export interface TaskLease {
  leaseId: ID;
  taskId: ID;
  ownerId: ID;
  claimedAt: string;
  expiresAt: string;
}

export class TaskLeaseManager {
  private readonly leases =
    new Map<ID, TaskLease>();

  constructor(
    private readonly registry: WorkforceRegistry,
  ) {}

  claim(
    taskId: ID,
    ownerId: ID,
    durationMs: number,
  ): TaskLease {
    if (!ownerId.trim()) {
      throw new Error(
        "K.I.N.G.S. Task Lease: ownerId is required",
      );
    }

    if (
      !Number.isFinite(durationMs) ||
      durationMs <= 0
    ) {
      throw new Error(
        "K.I.N.G.S. Task Lease: durationMs must be greater than zero",
      );
    }

    const task =
      this.registry.getTask(taskId);

    if (!task) {
      throw new Error(
        `K.I.N.G.S. Task Lease: task "${taskId}" not found`,
      );
    }

    const existingLease =
      this.leases.get(taskId);

    if (existingLease) {
      if (
        !this.isExpired(existingLease)
      ) {
        throw new Error(
          `K.I.N.G.S. Task Lease: task "${taskId}" is already leased`,
        );
      }

      this.leases.delete(taskId);
    }

    if (task.status !== "ready") {
      throw new Error(
        `K.I.N.G.S. Task Lease: task "${taskId}" ` +
        `cannot be claimed because its status is "${task.status}"`,
      );
    }

    const claimedAt =
      new Date();

    const expiresAt =
      new Date(
        claimedAt.getTime() +
          durationMs,
      );

    const lease: TaskLease = {
      leaseId:
        `lease-${taskId}-${claimedAt.getTime()}`,
      taskId,
      ownerId,
      claimedAt:
        claimedAt.toISOString(),
      expiresAt:
        expiresAt.toISOString(),
    };

    this.leases.set(
      taskId,
      lease,
    );

    return lease;
  }

  get(
    taskId: ID,
  ): TaskLease | undefined {
    const lease =
      this.leases.get(taskId);

    if (!lease) {
      return undefined;
    }

    if (this.isExpired(lease)) {
      this.leases.delete(taskId);
      return undefined;
    }

    return lease;
  }

  release(
    taskId: ID,
    ownerId: ID,
  ): void {
    const lease =
      this.leases.get(taskId);

    if (!lease) {
      throw new Error(
        `K.I.N.G.S. Task Lease: no active lease for task "${taskId}"`,
      );
    }

    if (this.isExpired(lease)) {
      this.leases.delete(taskId);

      throw new Error(
        `K.I.N.G.S. Task Lease: lease for task "${taskId}" has expired`,
      );
    }

    if (
      lease.ownerId !== ownerId
    ) {
      throw new Error(
        `K.I.N.G.S. Task Lease: owner "${ownerId}" does not own lease for task "${taskId}"`,
      );
    }

    this.leases.delete(taskId);
  }

  isExpired(
    lease: TaskLease,
  ): boolean {
    return (
      Date.now() >=
      new Date(
        lease.expiresAt,
      ).getTime()
    );
  }
}
