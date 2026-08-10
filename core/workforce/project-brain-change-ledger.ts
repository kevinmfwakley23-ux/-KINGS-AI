import type {
  ID,
} from "./types";

import type {
  ProjectBrainStateDelta,
  ProjectBrainStateChange,
} from "./project-brain-state-delta";

export interface ProjectBrainChangeEvent {
  id: ID;
  missionId: ID;

  previousCreatedAt: string;
  currentCreatedAt: string;

  changes: ProjectBrainStateChange[];

  /**
   * Provenance linking this event to the exact state
   * snapshots that produced it.
   */
  previousStateCreatedAt: string;
  currentStateCreatedAt: string;

  createdAt: string;
}

export class ProjectBrainChangeLedger {
  private readonly events =
    new Map<ID, ProjectBrainChangeEvent>();

  register(
    delta: ProjectBrainStateDelta,
  ): ProjectBrainChangeEvent {
    if (!delta.missionId.trim()) {
      throw new Error(
        "K.I.N.G.S. Project Brain Change Ledger: mission id is required",
      );
    }

    if (!delta.changed) {
      throw new Error(
        "K.I.N.G.S. Project Brain Change Ledger: unchanged state cannot be registered as a change event",
      );
    }

    if (delta.changes.length === 0) {
      throw new Error(
        "K.I.N.G.S. Project Brain Change Ledger: changed delta requires at least one change",
      );
    }

    const id =
      this.createEventId(delta);

    if (this.events.has(id)) {
      throw new Error(
        `K.I.N.G.S. Project Brain Change Ledger: duplicate change event "${id}"`,
      );
    }

    const event: ProjectBrainChangeEvent = {
      id,
      missionId:
        delta.missionId,

      previousCreatedAt:
        delta.previousCreatedAt,

      currentCreatedAt:
        delta.currentCreatedAt,

      changes:
        delta.changes.map(
          (change) => ({
            ...change,
          }),
        ),

      previousStateCreatedAt:
        delta.previousCreatedAt,

      currentStateCreatedAt:
        delta.currentCreatedAt,

      createdAt:
        new Date().toISOString(),
    };

    this.events.set(
      id,
      event,
    );

    return this.clone(event);
  }

  get(
    eventId: ID,
  ):
    | ProjectBrainChangeEvent
    | undefined {
    const event =
      this.events.get(eventId);

    return event
      ? this.clone(event)
      : undefined;
  }

  list(
    missionId?: ID,
  ): ProjectBrainChangeEvent[] {
    return [
      ...this.events.values(),
    ]
      .filter(
        (event) =>
          !missionId ||
          event.missionId ===
            missionId,
      )
      .map(
        (event) =>
          this.clone(event),
      );
  }

  private createEventId(
    delta: ProjectBrainStateDelta,
  ): ID {
    return [
      "PROJECT-BRAIN-CHANGE",
      delta.missionId,
      delta.previousCreatedAt,
      delta.currentCreatedAt,
    ].join(":");
  }

  private clone(
    event: ProjectBrainChangeEvent,
  ): ProjectBrainChangeEvent {
    return {
      ...event,
      changes:
        event.changes.map(
          (change) => ({
            ...change,
          }),
        ),
    };
  }
}
