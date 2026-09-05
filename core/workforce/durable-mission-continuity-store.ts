import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";

import {
  dirname,
} from "node:path";

import type {
  ID,
  Mission,
} from "./types";

import {
  MissionContinuityStore,
  type MissionCheckpoint,
  type MissionDecision,
  type MissionPlan,
  type MissionState,
} from "./mission-continuity";

interface DurableMissionRecord {
  mission: Mission;
  plan?: MissionPlan;
  state: MissionState;
  decisions: MissionDecision[];
  latestCheckpoint?: MissionCheckpoint;
}

interface DurableMissionDocument {
  schemaVersion: 1;
  savedAt: string;
  missions: DurableMissionRecord[];
}

/**
 * File-backed MissionContinuityStore for the local-first K.I.N.G.S. runtime.
 *
 * Every mutating operation is followed by an atomic JSON snapshot write
 * (temporary file + rename). A newly constructed store hydrates the mission,
 * plan, state, decisions and latest checkpoint so an owner-runtime restart does
 * not silently erase active mission continuity.
 *
 * The base in-memory store remains available for tests and ephemeral callers.
 */
export class DurableMissionContinuityStore extends MissionContinuityStore {
  private readonly missionIds =
    new Set<ID>();

  private readonly decisionIds =
    new Map<ID, Set<ID>>();

  private hydrating =
    false;

  constructor(
    private readonly storagePath: string,
  ) {
    super();

    if (!storagePath.trim()) {
      throw new Error(
        "K.I.N.G.S. Durable Mission Continuity: storage path is required",
      );
    }

    this.hydrate();
  }

  get path(): string {
    return this.storagePath;
  }

  override registerMission(
    mission: Mission,
  ): void {
    super.registerMission(mission);
    this.missionIds.add(mission.id);
    this.persistIfReady();
  }

  override registerPlan(
    plan: MissionPlan,
  ): void {
    super.registerPlan(plan);
    this.persistIfReady();
  }

  override approvePlan(
    missionId: ID,
  ): MissionPlan {
    const plan =
      super.approvePlan(missionId);
    this.persistIfReady();
    return plan;
  }

  override lockPlan(
    missionId: ID,
  ): MissionPlan {
    const plan =
      super.lockPlan(missionId);
    this.persistIfReady();
    return plan;
  }

  override activatePlanRevision(
    revision: MissionPlan,
  ): MissionPlan {
    const plan =
      super.activatePlanRevision(revision);
    this.persistIfReady();
    return plan;
  }

  override registerDecision(
    decision: MissionDecision,
  ): void {
    super.registerDecision(decision);

    const ids =
      this.decisionIds.get(
        decision.missionId,
      ) ?? new Set<ID>();

    ids.add(decision.id);
    this.decisionIds.set(
      decision.missionId,
      ids,
    );

    this.persistIfReady();
  }

  override updateState(
    missionId: ID,
    changes: Partial<
      Omit<
        MissionState,
        "missionId"
      >
    >,
  ): MissionState {
    const state =
      super.updateState(
        missionId,
        changes,
      );
    this.persistIfReady();
    return state;
  }

  override createCheckpoint(
    checkpoint: MissionCheckpoint,
  ): MissionCheckpoint {
    const stored =
      super.createCheckpoint(
        checkpoint,
      );
    this.persistIfReady();
    return stored;
  }

  override restoreLatestCheckpoint(
    missionId: ID,
  ): MissionState {
    const state =
      super.restoreLatestCheckpoint(
        missionId,
      );
    this.persistIfReady();
    return state;
  }

  override clear(): void {
    super.clear();
    this.missionIds.clear();
    this.decisionIds.clear();
    this.persistIfReady();
  }

  private persistIfReady(): void {
    if (!this.hydrating) {
      this.persist();
    }
  }

  private persist(): void {
    const document:
      DurableMissionDocument = {
      schemaVersion: 1,
      savedAt:
        new Date().toISOString(),
      missions:
        [...this.missionIds]
          .sort()
          .map(
            (missionId) =>
              this.record(
                missionId,
              ),
          ),
    };

    const directory =
      dirname(
        this.storagePath,
      );

    mkdirSync(
      directory,
      {
        recursive: true,
      },
    );

    const temporaryPath =
      `${this.storagePath}.${process.pid}.${Date.now()}.tmp`;

    try {
      writeFileSync(
        temporaryPath,
        `${JSON.stringify(document, null, 2)}\n`,
        {
          encoding: "utf8",
          mode: 0o600,
        },
      );

      renameSync(
        temporaryPath,
        this.storagePath,
      );
    } finally {
      if (
        existsSync(
          temporaryPath,
        )
      ) {
        rmSync(
          temporaryPath,
          {
            force: true,
          },
        );
      }
    }
  }

  private record(
    missionId: ID,
  ): DurableMissionRecord {
    const mission =
      super.getMission(
        missionId,
      );

    const state =
      super.getState(
        missionId,
      );

    if (!mission || !state) {
      throw new Error(
        `K.I.N.G.S. Durable Mission Continuity: mission "${missionId}" is incomplete and cannot be persisted`,
      );
    }

    const decisions =
      [
        ...(
          this.decisionIds.get(
            missionId,
          ) ?? new Set<ID>()
        ),
      ]
        .sort()
        .map(
          (decisionId) =>
            super.getDecision(
              decisionId,
            ),
        )
        .filter(
          (
            decision,
          ): decision is MissionDecision =>
            decision !== undefined,
        );

    return {
      mission,
      plan:
        super.getPlan(
          missionId,
        ),
      state,
      decisions,
      latestCheckpoint:
        super.getLatestCheckpoint(
          missionId,
        ),
    };
  }

  private hydrate(): void {
    if (
      !existsSync(
        this.storagePath,
      )
    ) {
      return;
    }

    let document:
      DurableMissionDocument;

    try {
      document =
        JSON.parse(
          readFileSync(
            this.storagePath,
            "utf8",
          ),
        ) as DurableMissionDocument;
    } catch (error) {
      throw new Error(
        `K.I.N.G.S. Durable Mission Continuity: failed to read state file "${this.storagePath}": ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }

    if (
      document.schemaVersion !== 1 ||
      !Array.isArray(
        document.missions,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Durable Mission Continuity: unsupported or invalid state file "${this.storagePath}"`,
      );
    }

    this.hydrating =
      true;

    try {
      for (
        const record of
        document.missions
      ) {
        super.registerMission(
          record.mission,
        );
        this.missionIds.add(
          record.mission.id,
        );

        if (record.plan) {
          super.registerPlan(
            record.plan,
          );
        }

        for (
          const decision of
          record.decisions ?? []
        ) {
          super.registerDecision(
            decision,
          );

          const ids =
            this.decisionIds.get(
              decision.missionId,
            ) ?? new Set<ID>();
          ids.add(
            decision.id,
          );
          this.decisionIds.set(
            decision.missionId,
            ids,
          );
        }

        if (
          record.latestCheckpoint &&
          record.plan
        ) {
          super.createCheckpoint(
            record.latestCheckpoint,
          );
        }

        super.updateState(
          record.mission.id,
          record.state,
        );
      }
    } finally {
      this.hydrating =
        false;
    }
  }
}
