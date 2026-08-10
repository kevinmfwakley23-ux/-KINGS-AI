import type {
  ID,
} from "./types";

export interface WorkUnitBudget {
  maxTimeMs: number;
  maxTokens: number;
  maxIterations: number;
}

export interface WorkUnitContract {
  id: ID;

  /**
   * Human-readable role assigned to the worker.
   */
  role: string;

  /**
   * Explicit objective for this bounded work unit.
   */
  objective: string;

  /**
   * Capabilities authorized for this work unit.
   */
  capabilityIds: ID[];

  /**
   * Tools explicitly allowed by the contract.
   */
  allowedToolIds: ID[];

  /**
   * Paths/resources explicitly allowed by the contract.
   */
  allowedPaths: string[];

  /**
   * Execution budget.
   */
  budget: WorkUnitBudget;

  /**
   * Work units that must complete first.
   */
  dependencyIds: ID[];

  /**
   * Conditions that must be satisfied before completion.
   */
  acceptanceCriteria: string[];

  /**
   * Evidence required before completion may be promoted.
   */
  requiredEvidenceTypes: string[];

  /**
   * Whether the contract has been explicitly approved.
   */
  approved: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface WorkUnitContractValidation {
  valid: boolean;
  reasons: string[];
}

export function validateWorkUnitContract(
  contract: WorkUnitContract,
): WorkUnitContractValidation {
  const reasons: string[] = [];

  if (!contract.id) {
    reasons.push(
      "Work unit contract id is required.",
    );
  }

  if (!contract.role.trim()) {
    reasons.push(
      "Work unit contract role is required.",
    );
  }

  if (!contract.objective.trim()) {
    reasons.push(
      "Work unit contract objective is required.",
    );
  }

  if (
    contract.capabilityIds.length === 0
  ) {
    reasons.push(
      "Work unit contract requires at least one capability.",
    );
  }

  if (
    contract.budget.maxTimeMs <= 0
  ) {
    reasons.push(
      "Work unit maxTimeMs must be greater than zero.",
    );
  }

  if (
    contract.budget.maxTokens <= 0
  ) {
    reasons.push(
      "Work unit maxTokens must be greater than zero.",
    );
  }

  if (
    contract.budget.maxIterations <= 0
  ) {
    reasons.push(
      "Work unit maxIterations must be greater than zero.",
    );
  }

  if (
    contract.acceptanceCriteria.length === 0
  ) {
    reasons.push(
      "Work unit contract requires acceptance criteria.",
    );
  }

  if (
    contract.requiredEvidenceTypes.length === 0
  ) {
    reasons.push(
      "Work unit contract requires evidence requirements.",
    );
  }

  if (!contract.approved) {
    reasons.push(
      "Work unit contract has not been approved.",
    );
  }

  return {
    valid:
      reasons.length === 0,
    reasons,
  };
}
