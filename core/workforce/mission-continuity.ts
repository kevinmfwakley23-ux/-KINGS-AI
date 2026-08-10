import type {
  ID,
  Mission,
  MissionStatus,
} from "./types";

export interface MissionMilestone {
  id: ID;
  missionId: ID;
  name: string;
  objective: string;
  taskIds: ID[];
  dependencyIds: ID[];
  status: MissionStatus;
  completedAt?: string;
}

export interface MissionDecision {
  id: ID;
  missionId: ID;
  statement: string;
  rationale: string;
  authoritative: boolean;
  locked: boolean;
  sourceReferences: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MissionPlan {
  id: ID;
  missionId: ID;
  version: number;
  objective: string;
  milestones: MissionMilestone[];
  decisionIds: ID[];
  acceptanceCriteria: string[];
  locked: boolean;
  approvedByHuman: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MissionState {
  missionId: ID;
  currentMilestoneId?: ID;
  activeTaskIds: ID[];
  completedTaskIds: ID[];
  blockedTaskIds: ID[];
  failedTaskIds: ID[];
  openQuestionIds: ID[];
  riskIds: ID[];
  artifactIds: ID[];
  evidenceIds: ID[];
  lastCheckpointId?: ID;
  updatedAt: string;
}

export interface MissionCheckpoint {
  id: ID;
  missionId: ID;
  planId: ID;
  planVersion: number;
  state: MissionState;
  summary: string;
  reason: string;
  createdAt: string;
}

export interface MissionContinuitySnapshot {
  mission: Mission;
  plan: MissionPlan;
  state: MissionState;
  decisions: MissionDecision[];
  latestCheckpoint?: MissionCheckpoint;
}

export class MissionContinuityStore {
  private readonly missions =
    new Map<ID, Mission>();

  private readonly plans =
    new Map<ID, MissionPlan>();

  private readonly states =
    new Map<ID, MissionState>();

  private readonly decisions =
    new Map<ID, MissionDecision>();

  private readonly checkpoints =
    new Map<ID, MissionCheckpoint>();

  registerMission(
    mission: Mission,
  ): void {
    if (!mission.id) {
      throw new Error(
        "K.I.N.G.S. Mission Continuity: mission id is required",
      );
    }

    if (!mission.name.trim()) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: mission "${mission.id}" requires a name`,
      );
    }

    if (!mission.description.trim()) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: mission "${mission.id}" requires a description`,
      );
    }

    if (
      this.missions.has(mission.id)
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: duplicate mission id "${mission.id}"`,
      );
    }

    this.missions.set(
      mission.id,
      { ...mission },
    );

    this.states.set(
      mission.id,
      this.createInitialState(
        mission.id,
      ),
    );
  }

  getMission(
    missionId: ID,
  ): Mission | undefined {
    const mission =
      this.missions.get(missionId);

    return mission
      ? { ...mission }
      : undefined;
  }

  registerPlan(
    plan: MissionPlan,
  ): void {
    this.requireMission(
      plan.missionId,
    );

    if (!plan.id) {
      throw new Error(
        "K.I.N.G.S. Mission Continuity: plan id is required",
      );
    }

    if (
      plan.version <= 0
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: plan "${plan.id}" requires a positive version`,
      );
    }

    if (
      !plan.objective.trim()
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: plan "${plan.id}" requires an objective`,
      );
    }

    if (
      plan.acceptanceCriteria.length === 0
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: plan "${plan.id}" requires acceptance criteria`,
      );
    }

    if (
      this.plans.has(plan.missionId)
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: mission "${plan.missionId}" already has a plan`,
      );
    }

    this.plans.set(
      plan.missionId,
      this.clonePlan(plan),
    );
  }

  getPlan(
    missionId: ID,
  ): MissionPlan | undefined {
    const plan =
      this.plans.get(missionId);

    return plan
      ? this.clonePlan(plan)
      : undefined;
  }

  approvePlan(
    missionId: ID,
  ): MissionPlan {
    const plan =
      this.requirePlan(
        missionId,
      );

    if (plan.locked) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: locked plan "${plan.id}" cannot be modified`,
      );
    }

    const approved: MissionPlan = {
      ...plan,
      approvedByHuman: true,
      updatedAt:
        new Date().toISOString(),
    };

    this.plans.set(
      missionId,
      this.clonePlan(
        approved,
      ),
    );

    return this.clonePlan(
      approved,
    );
  }

  lockPlan(
    missionId: ID,
  ): MissionPlan {
    const plan =
      this.requirePlan(
        missionId,
      );

    if (!plan.approvedByHuman) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: mission "${missionId}" plan requires human approval before locking`,
      );
    }

    const locked: MissionPlan = {
      ...plan,
      locked: true,
      updatedAt:
        new Date().toISOString(),
    };

    this.plans.set(
      missionId,
      this.clonePlan(
        locked,
      ),
    );

    return this.clonePlan(
      locked,
    );
  }

  /*
   * Controlled activation of a newer, human-approved, locked plan.
   *
   * This is intentionally the only operation that replaces the active
   * mission plan after the initial plan has been registered.
   */
  activatePlanRevision(
    revision: MissionPlan,
  ): MissionPlan {
    this.requireMission(
      revision.missionId,
    );

    const current =
      this.requirePlan(
        revision.missionId,
      );

    if (
      revision.version <=
      current.version
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: replacement plan version must exceed current version ${current.version}`,
      );
    }

    if (!revision.approvedByHuman) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: replacement plan "${revision.id}" requires human approval`,
      );
    }

    if (!revision.locked) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: replacement plan "${revision.id}" must be locked before activation`,
      );
    }

    const activated: MissionPlan = {
      ...revision,
      updatedAt:
        new Date().toISOString(),
    };

    this.plans.set(
      revision.missionId,
      this.clonePlan(
        activated,
      ),
    );

    return this.clonePlan(
      activated,
    );
  }

  registerDecision(
    decision: MissionDecision,
  ): void {
    this.requireMission(
      decision.missionId,
    );

    if (!decision.id) {
      throw new Error(
        "K.I.N.G.S. Mission Continuity: decision id is required",
      );
    }

    if (
      !decision.statement.trim()
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: decision "${decision.id}" requires a statement`,
      );
    }

    if (
      decision.authoritative &&
      decision.sourceReferences.length === 0
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: authoritative decision "${decision.id}" requires provenance`,
      );
    }

    if (
      this.decisions.has(
        decision.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: duplicate decision id "${decision.id}"`,
      );
    }

    this.decisions.set(
      decision.id,
      {
        ...decision,
        sourceReferences: [
          ...decision.sourceReferences,
        ],
      },
    );
  }

  getDecision(
    decisionId: ID,
  ): MissionDecision | undefined {
    const decision =
      this.decisions.get(
        decisionId,
      );

    return decision
      ? {
          ...decision,
          sourceReferences: [
            ...decision.sourceReferences,
          ],
        }
      : undefined;
  }

  updateState(
    missionId: ID,
    changes: Partial<
      Omit<
        MissionState,
        "missionId"
      >
    >,
  ): MissionState {
    this.requireMission(
      missionId,
    );

    const current =
      this.requireState(
        missionId,
      );

    const updated: MissionState = {
      ...current,
      ...changes,
      missionId,
      updatedAt:
        new Date().toISOString(),
    };

    this.states.set(
      missionId,
      this.cloneState(
        updated,
      ),
    );

    return this.cloneState(
      updated,
    );
  }

  getState(
    missionId: ID,
  ): MissionState | undefined {
    const state =
      this.states.get(missionId);

    return state
      ? this.cloneState(state)
      : undefined;
  }

  createCheckpoint(
    checkpoint: MissionCheckpoint,
  ): MissionCheckpoint {
    this.requireMission(
      checkpoint.missionId,
    );

    const plan =
      this.requirePlan(
        checkpoint.missionId,
      );

    if (
      checkpoint.planVersion !==
      plan.version
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: checkpoint "${checkpoint.id}" does not match the current plan version`,
      );
    }

    if (
      checkpoint.planId !==
      plan.id
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: checkpoint "${checkpoint.id}" does not match the current plan`,
      );
    }

    if (
      this.checkpoints.has(
        checkpoint.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: duplicate checkpoint id "${checkpoint.id}"`,
      );
    }

    const stored: MissionCheckpoint = {
      ...checkpoint,
      state:
        this.cloneState(
          checkpoint.state,
        ),
    };

    this.checkpoints.set(
      checkpoint.id,
      stored,
    );

    this.states.set(
      checkpoint.missionId,
      this.cloneState(
        checkpoint.state,
      ),
    );

    const mission =
      this.requireMission(
        checkpoint.missionId,
      );

    this.missions.set(
      checkpoint.missionId,
      {
        ...mission,
        updatedAt:
          checkpoint.createdAt,
      },
    );

    const updatedState =
      this.requireState(
        checkpoint.missionId,
      );

    this.states.set(
      checkpoint.missionId,
      {
        ...updatedState,
        lastCheckpointId:
          checkpoint.id,
      },
    );

    return this.cloneCheckpoint(
      stored,
    );
  }

  getCheckpoint(
    checkpointId: ID,
  ): MissionCheckpoint | undefined {
    const checkpoint =
      this.checkpoints.get(
        checkpointId,
      );

    return checkpoint
      ? this.cloneCheckpoint(
          checkpoint,
        )
      : undefined;
  }

  getLatestCheckpoint(
    missionId: ID,
  ): MissionCheckpoint | undefined {
    this.requireMission(
      missionId,
    );

    const checkpoints =
      [
        ...this.checkpoints.values(),
      ]
        .filter(
          (checkpoint) =>
            checkpoint.missionId ===
            missionId,
        )
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(
              b.createdAt,
            ),
        );

    const latest =
      checkpoints[
        checkpoints.length - 1
      ];

    return latest
      ? this.cloneCheckpoint(
          latest,
        )
      : undefined;
  }

  restoreLatestCheckpoint(
    missionId: ID,
  ): MissionState {
    const checkpoint =
      this.getLatestCheckpoint(
        missionId,
      );

    if (!checkpoint) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: mission "${missionId}" has no checkpoint to restore`,
      );
    }

    const restored: MissionState = {
      ...checkpoint.state,
      missionId,
      lastCheckpointId:
        checkpoint.id,
      updatedAt:
        new Date().toISOString(),
    };

    this.states.set(
      missionId,
      this.cloneState(
        restored,
      ),
    );

    return this.cloneState(
      restored,
    );
  }

  snapshot(
    missionId: ID,
  ): MissionContinuitySnapshot {
    const mission =
      this.requireMission(
        missionId,
      );

    const plan =
      this.requirePlan(
        missionId,
      );

    const state =
      this.requireState(
        missionId,
      );

    const decisions =
      [
        ...this.decisions.values(),
      ]
        .filter(
          (decision) =>
            decision.missionId ===
            missionId,
        )
        .map(
          (decision) => ({
            ...decision,
            sourceReferences: [
              ...decision.sourceReferences,
            ],
          }),
        );

    return {
      mission: {
        ...mission,
      },
      plan:
        this.clonePlan(plan),
      state:
        this.cloneState(state),
      decisions,
      latestCheckpoint:
        this.getLatestCheckpoint(
          missionId,
        ),
    };
  }

  clear(): void {
    this.missions.clear();
    this.plans.clear();
    this.states.clear();
    this.decisions.clear();
    this.checkpoints.clear();
  }

  private createInitialState(
    missionId: ID,
  ): MissionState {
    return {
      missionId,
      activeTaskIds: [],
      completedTaskIds: [],
      blockedTaskIds: [],
      failedTaskIds: [],
      openQuestionIds: [],
      riskIds: [],
      artifactIds: [],
      evidenceIds: [],
      updatedAt:
        new Date().toISOString(),
    };
  }

  private requireMission(
    missionId: ID,
  ): Mission {
    const mission =
      this.missions.get(missionId);

    if (!mission) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: mission "${missionId}" not found`,
      );
    }

    return mission;
  }

  private requirePlan(
    missionId: ID,
  ): MissionPlan {
    const plan =
      this.plans.get(missionId);

    if (!plan) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: mission "${missionId}" has no plan`,
      );
    }

    return plan;
  }

  private requireState(
    missionId: ID,
  ): MissionState {
    const state =
      this.states.get(missionId);

    if (!state) {
      throw new Error(
        `K.I.N.G.S. Mission Continuity: mission "${missionId}" has no state`,
      );
    }

    return state;
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

  private cloneState(
    state: MissionState,
  ): MissionState {
    return {
      ...state,
      activeTaskIds: [
        ...state.activeTaskIds,
      ],
      completedTaskIds: [
        ...state.completedTaskIds,
      ],
      blockedTaskIds: [
        ...state.blockedTaskIds,
      ],
      failedTaskIds: [
        ...state.failedTaskIds,
      ],
      openQuestionIds: [
        ...state.openQuestionIds,
      ],
      riskIds: [
        ...state.riskIds,
      ],
      artifactIds: [
        ...state.artifactIds,
      ],
      evidenceIds: [
        ...state.evidenceIds,
      ],
    };
  }

  private cloneCheckpoint(
    checkpoint: MissionCheckpoint,
  ): MissionCheckpoint {
    return {
      ...checkpoint,
      state:
        this.cloneState(
          checkpoint.state,
        ),
    };
  }
}
