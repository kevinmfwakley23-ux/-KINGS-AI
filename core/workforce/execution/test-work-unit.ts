import type {
  ID,
} from "../types";

import type {
  WorkUnitContract,
} from "../work-unit-contract";

import {
  WorkUnitRegistry,
} from "../work-unit-registry";

export function createTestWorkUnit(
  taskId: ID,
): WorkUnitContract {
  const now =
    new Date().toISOString();

  return {
    id:
      `work-unit-${taskId}`,
    role:
      "Controlled test execution worker",
    objective:
      `Execute controlled test task "${taskId}".`,
    capabilityIds: [
      "test",
      "crewai",
    ],
    allowedToolIds: [],
    allowedPaths: [
      "core/workforce",
    ],
    budget: {
      maxTimeMs: 60_000,
      maxTokens: 10_000,
      maxIterations: 10,
    },
    dependencyIds: [],
    acceptanceCriteria: [
      "Execution completes successfully.",
      "Execution remains within the Work Unit budget.",
    ],
    requiredEvidenceTypes: [
      "test",
    ],
    approved:
      true,
    createdAt:
      now,
    updatedAt:
      now,
  };
}

export function registerTestWorkUnit(
  registry: WorkUnitRegistry,
  taskId: ID,
): void {
  registry.register(
    taskId,
    createTestWorkUnit(taskId),
  );
}
