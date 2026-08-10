import type {
  ID,
} from "./types";

import type {
  MissionPlan,
  MissionContinuityStore,
} from "./mission-continuity";

export interface MissionPlanRevision {
  id: ID;
  missionId: ID;
  previousPlanId?: ID;
  previousVersion?: number;
  plan: MissionPlan;
  changeSummary: string;
  proposedBy: string;
  approvedByHuman: boolean;
  createdAt: string;
}

export class MissionPlanRegistry {
  private readonly revisions =
    new Map<ID, MissionPlanRevision[]>();

  constructor(
    private readonly continuity:
      MissionContinuityStore,
  ) {}

  registerInitialPlan(
    plan: MissionPlan,
    proposedBy: string,
  ): MissionPlan {
    if (!proposedBy.trim()) {
      throw new Error(
        "K.I.N.G.S. Mission Plan Registry: proposer is required",
      );
    }

    this.continuity.registerPlan(
      plan,
    );

    this.recordRevision({
      id: `PLAN-REVISION-${plan.id}-V${plan.version}`,
      missionId: plan.missionId,
      plan: this.clonePlan(plan),
      changeSummary:
        "Initial mission plan.",
      proposedBy,
      approvedByHuman:
        plan.approvedByHuman,
      createdAt:
        new Date().toISOString(),
    });

    return this.clonePlan(plan);
  }

  proposeRevision(
    missionId: ID,
    revision: MissionPlan,
    changeSummary: string,
    proposedBy: string,
  ): MissionPlanRevision {
    const current =
      this.requireCurrentPlan(
        missionId,
      );

    if (!changeSummary.trim()) {
      throw new Error(
        "K.I.N.G.S. Mission Plan Registry: change summary is required",
      );
    }

    if (!proposedBy.trim()) {
      throw new Error(
        "K.I.N.G.S. Mission Plan Registry: proposer is required",
      );
    }

    if (revision.missionId !== missionId) {
      throw new Error(
        "K.I.N.G.S. Mission Plan Registry: revision mission id does not match target mission",
      );
    }

    if (
      revision.version <=
      current.version
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Plan Registry: revision version must exceed current version ${current.version}`,
      );
    }

    const record: MissionPlanRevision = {
      id:
        `PLAN-REVISION-${revision.id}-V${revision.version}`,
      missionId,
      previousPlanId:
        current.id,
      previousVersion:
        current.version,
      plan:
        this.clonePlan(
          revision,
        ),
      changeSummary,
      proposedBy,
      approvedByHuman:
        revision.approvedByHuman,
      createdAt:
        new Date().toISOString(),
    };

    this.recordRevision(
      record,
    );

    return this.cloneRevision(
      record,
    );
  }

  approveRevision(
    revisionId: ID,
  ): MissionPlanRevision {
    const revision =
      this.findRevision(
        revisionId,
      );

    if (!revision) {
      throw new Error(
        `K.I.N.G.S. Mission Plan Registry: revision "${revisionId}" not found`,
      );
    }

    if (
      revision.plan.locked
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Plan Registry: revision "${revisionId}" is already locked`,
      );
    }

    const approved: MissionPlanRevision = {
      ...revision,
      approvedByHuman: true,
      plan: {
        ...revision.plan,
        approvedByHuman: true,
        updatedAt:
          new Date().toISOString(),
      },
    };

    this.replaceRevision(
      approved,
    );

    return this.cloneRevision(
      approved,
    );
  }

  activateRevision(
    revisionId: ID,
  ): MissionPlan {
    const revision =
      this.findRevision(
        revisionId,
      );

    if (!revision) {
      throw new Error(
        `K.I.N.G.S. Mission Plan Registry: revision "${revisionId}" not found`,
      );
    }

    if (
      !revision.approvedByHuman
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Plan Registry: revision "${revisionId}" requires human approval`,
      );
    }

    if (
      revision.plan.locked !== true
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Plan Registry: revision "${revisionId}" must be locked before activation`,
      );
    }

    const current =
      this.requireCurrentPlan(
        revision.missionId,
      );

    if (
      revision.plan.version <=
      current.version
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Plan Registry: activated revision must be newer than current version ${current.version}`,
      );
    }

    /*
     * The existing MissionContinuityStore deliberately does not expose
     * arbitrary replacement of locked plans. Activation therefore occurs
     * only through a new store-owned plan replacement operation.
     */
    const activated =
      this.continuity.activatePlanRevision(
        revision.plan,
      );

    return this.clonePlan(
      activated,
    );
  }

  approveAndLockRevision(
    revisionId: ID,
  ): MissionPlanRevision {
    const approved =
      this.approveRevision(
        revisionId,
      );

    const locked: MissionPlanRevision = {
      ...approved,
      plan: {
        ...approved.plan,
        locked: true,
        updatedAt:
          new Date().toISOString(),
      },
    };

    this.replaceRevision(
      locked,
    );

    return this.cloneRevision(
      locked,
    );
  }

  getCurrentPlan(
    missionId: ID,
  ): MissionPlan {
    return this.clonePlan(
      this.requireCurrentPlan(
        missionId,
      ),
    );
  }

  listRevisions(
    missionId: ID,
  ): MissionPlanRevision[] {
    return (
      this.revisions.get(
        missionId,
      ) ?? []
    ).map(
      (revision) =>
        this.cloneRevision(
          revision,
        ),
    );
  }

  private requireCurrentPlan(
    missionId: ID,
  ): MissionPlan {
    const plan =
      this.continuity.getPlan(
        missionId,
      );

    if (!plan) {
      throw new Error(
        `K.I.N.G.S. Mission Plan Registry: mission "${missionId}" has no plan`,
      );
    }

    return plan;
  }

  private recordRevision(
    revision: MissionPlanRevision,
  ): void {
    const existing =
      this.revisions.get(
        revision.missionId,
      ) ?? [];

    if (
      existing.some(
        (item) =>
          item.id ===
          revision.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Plan Registry: duplicate revision id "${revision.id}"`,
      );
    }

    existing.push(
      this.cloneRevision(
        revision,
      ),
    );

    this.revisions.set(
      revision.missionId,
      existing,
    );
  }

  private replaceRevision(
    revision: MissionPlanRevision,
  ): void {
    const existing =
      this.revisions.get(
        revision.missionId,
      ) ?? [];

    const index =
      existing.findIndex(
        (item) =>
          item.id ===
          revision.id,
      );

    if (index < 0) {
      throw new Error(
        `K.I.N.G.S. Mission Plan Registry: revision "${revision.id}" not found`,
      );
    }

    existing[index] =
      this.cloneRevision(
        revision,
      );

    this.revisions.set(
      revision.missionId,
      existing,
    );
  }

  private findRevision(
    revisionId: ID,
  ): MissionPlanRevision | undefined {
    for (
      const revisions of
      this.revisions.values()
    ) {
      const found =
        revisions.find(
          (revision) =>
            revision.id ===
            revisionId,
        );

      if (found) {
        return found;
      }
    }

    return undefined;
  }

  private clonePlan(
    plan: MissionPlan,
  ): MissionPlan {
    return {
      ...plan,
      milestones:
        plan.milestones.map(
          (milestone) => ({
            ...milestone,
            taskIds: [
              ...milestone.taskIds,
            ],
            dependencyIds: [
              ...milestone.dependencyIds,
            ],
          }),
        ),
      decisionIds: [
        ...plan.decisionIds,
      ],
      acceptanceCriteria: [
        ...plan.acceptanceCriteria,
      ],
    };
  }

  private cloneRevision(
    revision: MissionPlanRevision,
  ): MissionPlanRevision {
    return {
      ...revision,
      plan:
        this.clonePlan(
          revision.plan,
        ),
    };
  }
}
