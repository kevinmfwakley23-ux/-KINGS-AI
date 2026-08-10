import type {
  ID,
  KnowledgeRecord,
} from "./types";

import type {
  ProjectBrainStateSnapshot,
} from "./project-brain-state";

export type ProjectBrainChangeType =
  | "added"
  | "removed"
  | "changed";

export interface ProjectBrainStateChange {
  type: ProjectBrainChangeType;
  category:
    | "mission"
    | "plan"
    | "state"
    | "decision"
    | "checkpoint"
    | "knowledge";
  id: ID;
  summary: string;
}

export interface ProjectBrainStateDelta {
  missionId: ID;
  previousCreatedAt: string;
  currentCreatedAt: string;
  changes: ProjectBrainStateChange[];
  changed: boolean;
}

export class ProjectBrainStateDeltaAuthority {
  compare(
    previous: ProjectBrainStateSnapshot,
    current: ProjectBrainStateSnapshot,
  ): ProjectBrainStateDelta {
    if (
      previous.missionId !==
      current.missionId
    ) {
      throw new Error(
        "K.I.N.G.S. Project Brain State Delta: snapshots must belong to the same mission",
      );
    }

    const changes:
      ProjectBrainStateChange[] = [];

    this.compareObject(
      changes,
      "mission",
      previous.continuity.mission,
      current.continuity.mission,
      previous.continuity.mission.id,
      "Mission state changed.",
    );

    if (
      previous.continuity.plan.id !==
      current.continuity.plan.id
    ) {
      changes.push({
        type: "removed",
        category: "plan",
        id: previous.continuity.plan.id,
        summary:
          `Mission plan "${previous.continuity.plan.id}" was removed.`,
      });

      changes.push({
        type: "added",
        category: "plan",
        id: current.continuity.plan.id,
        summary:
          `Mission plan "${current.continuity.plan.id}" was added.`,
      });
    } else {
      this.compareObject(
        changes,
        "plan",
        previous.continuity.plan,
        current.continuity.plan,
        current.continuity.plan.id,
        "Mission plan changed.",
      );
    }

    this.compareObject(
      changes,
      "state",
      previous.continuity.state,
      current.continuity.state,
      current.continuity.state.missionId,
      "Mission execution state changed.",
    );

    this.compareCollection(
      changes,
      "decision",
      previous.continuity.decisions,
      current.continuity.decisions,
      (item) => item.id,
      "Mission decision",
    );

    this.compareOptional(
      changes,
      "checkpoint",
      previous.continuity.latestCheckpoint,
      current.continuity.latestCheckpoint,
      (item) => item.id,
      "Latest mission checkpoint",
    );

    this.compareCollection(
      changes,
      "knowledge",
      previous.authoritativeRecords,
      current.authoritativeRecords,
      (item) => item.id,
      "Authoritative Project Brain record",
    );

    return {
      missionId:
        current.missionId,
      previousCreatedAt:
        previous.createdAt,
      currentCreatedAt:
        current.createdAt,
      changes,
      changed:
        changes.length > 0,
    };
  }

  private compareObject(
    changes: ProjectBrainStateChange[],
    category: ProjectBrainStateChange["category"],
    previous: unknown,
    current: unknown,
    id: ID,
    summary: string,
  ): void {
    if (
      JSON.stringify(previous) !==
      JSON.stringify(current)
    ) {
      changes.push({
        type: "changed",
        category,
        id,
        summary,
      });
    }
  }

  private compareCollection<T>(
    changes: ProjectBrainStateChange[],
    category: ProjectBrainStateChange["category"],
    previous: T[],
    current: T[],
    getId: (item: T) => ID,
    label: string,
  ): void {
    const previousMap =
      new Map(
        previous.map(
          (item) => [
            getId(item),
            item,
          ],
        ),
      );

    const currentMap =
      new Map(
        current.map(
          (item) => [
            getId(item),
            item,
          ],
        ),
      );

    for (
      const [id, item]
      of currentMap
    ) {
      if (
        !previousMap.has(id)
      ) {
        changes.push({
          type: "added",
          category,
          id,
          summary:
            `${label} "${id}" was added.`,
        });
        continue;
      }

      if (
        JSON.stringify(
          previousMap.get(id),
        ) !==
        JSON.stringify(item)
      ) {
        changes.push({
          type: "changed",
          category,
          id,
          summary:
            `${label} "${id}" changed.`,
        });
      }
    }

    for (
      const id
      of previousMap.keys()
    ) {
      if (
        !currentMap.has(id)
      ) {
        changes.push({
          type: "removed",
          category,
          id,
          summary:
            `${label} "${id}" was removed.`,
        });
      }
    }
  }

  private compareOptional<T>(
    changes: ProjectBrainStateChange[],
    category: ProjectBrainStateChange["category"],
    previous: T | undefined,
    current: T | undefined,
    getId: (item: T) => ID,
    label: string,
  ): void {
    if (
      !previous &&
      !current
    ) {
      return;
    }

    if (
      !previous &&
      current
    ) {
      changes.push({
        type: "added",
        category,
        id: getId(current),
        summary:
          `${label} "${getId(current)}" was added.`,
      });
      return;
    }

    if (
      previous &&
      !current
    ) {
      changes.push({
        type: "removed",
        category,
        id: getId(previous),
        summary:
          `${label} "${getId(previous)}" was removed.`,
      });
      return;
    }

    if (
      JSON.stringify(previous) !==
      JSON.stringify(current)
    ) {
      changes.push({
        type: "changed",
        category,
        id:
          getId(
            current as T,
          ),
        summary:
          `${label} "${getId(current as T)}" changed.`,
      });
    }
  }
}
