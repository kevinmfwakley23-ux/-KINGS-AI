import type {
  ID,
} from "./types";

import type {
  ProjectBrainChangeEvent,
} from "./project-brain-change-ledger";

export type ProjectBrainChangeImpact =
  | "informational"
  | "attention-required"
  | "blocking";

export interface ProjectBrainChangeImpactAssessment {
  eventId: ID;
  missionId: ID;
  impact: ProjectBrainChangeImpact;
  reasons: string[];
  changeIds: ID[];
  createdAt: string;
}

export class ProjectBrainChangeImpactAuthority {
  assess(
    event: ProjectBrainChangeEvent,
  ): ProjectBrainChangeImpactAssessment {
    if (!event.id.trim()) {
      throw new Error(
        "K.I.N.G.S. Project Brain Change Impact: event id is required",
      );
    }

    if (!event.missionId.trim()) {
      throw new Error(
        "K.I.N.G.S. Project Brain Change Impact: mission id is required",
      );
    }

    if (event.changes.length === 0) {
      throw new Error(
        "K.I.N.G.S. Project Brain Change Impact: change event requires at least one change",
      );
    }

    const reasons: string[] = [];

    let impact:
      ProjectBrainChangeImpact =
      "informational";

    for (
      const change of event.changes
    ) {
      if (
        change.category === "plan"
      ) {
        impact =
          "blocking";

        reasons.push(
          `Mission plan change "${change.id}" requires attention before dependent execution can safely continue.`,
        );

        continue;
      }

      if (
        change.category === "decision"
      ) {
        if (
          impact !== "blocking"
        ) {
          impact =
            "attention-required";
        }

        reasons.push(
          `Mission decision change "${change.id}" requires review of affected mission context.`,
        );

        continue;
      }

      if (
        change.category === "checkpoint"
      ) {
        if (
          impact === "informational"
        ) {
          impact =
            "attention-required";
        }

        reasons.push(
          `Mission checkpoint change "${change.id}" may affect mission continuity.`,
        );

        continue;
      }

      if (
        change.category === "state"
      ) {
        if (
          impact === "informational"
        ) {
          impact =
            "attention-required";
        }

        reasons.push(
          `Mission execution state change "${change.id}" requires contextual awareness.`,
        );

        continue;
      }

      if (
        change.category === "knowledge"
      ) {
        if (
          impact === "informational"
        ) {
          impact =
            "attention-required";
        }

        reasons.push(
          `Authoritative Project Brain knowledge change "${change.id}" may affect future execution context.`,
        );

        continue;
      }

      if (
        change.category === "mission"
      ) {
        impact =
          "blocking";

        reasons.push(
          `Mission identity/state change "${change.id}" requires attention before dependent execution can safely continue.`,
        );
      }
    }

    if (
      reasons.length === 0
    ) {
      reasons.push(
        "Project Brain change is informational.",
      );
    }

    return {
      eventId:
        event.id,

      missionId:
        event.missionId,

      impact,

      reasons,

      changeIds:
        event.changes.map(
          (change) =>
            change.id,
        ),

      createdAt:
        new Date().toISOString(),
    };
  }
}
