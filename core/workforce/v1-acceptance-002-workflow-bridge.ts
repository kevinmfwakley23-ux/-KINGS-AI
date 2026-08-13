import type { ID, Task } from "./types";
import type { WorkforceRegistry } from "./registry";
import {
  WorkflowDependencyEvaluator,
  type DependencyEvaluation,
} from "./workflow-dependency";
import {
  WorkflowReadinessEvaluator,
  type TaskReadinessEvaluation,
} from "./workflow-readiness";
import {
  V1AcceptanceDecision,
} from "./v1-acceptance-001";

export type AcceptanceDependencyStatus =
  | "satisfied"
  | "blocked"
  | "invalid";

export interface AcceptanceDependencyDecision {
  id: ID;
  dependencyTaskId: ID;
  acceptanceId: ID;
  accepted: boolean;
  status: AcceptanceDependencyStatus;
  reasons: string[];
  evidenceIds: ID[];
  verificationIds: ID[];
  createdAt: string;
}

export interface AcceptanceWorkflowBridgeRequest {
  dependencyTask: Task;
  dependentTask: Task;
  acceptance: V1AcceptanceDecision;
}

export interface AcceptanceWorkflowBridgeResult {
  accepted: boolean;
  dependency: AcceptanceDependencyDecision;
  dependencyEvaluation: DependencyEvaluation;
  dependentReadiness: TaskReadinessEvaluation;
}

export class V1AcceptanceWorkflowBridge {
  private readonly dependencyEvaluator:
    WorkflowDependencyEvaluator;

  private readonly readinessEvaluator:
    WorkflowReadinessEvaluator;

  constructor(
    private readonly registry: WorkforceRegistry,
  ) {
    this.dependencyEvaluator =
      new WorkflowDependencyEvaluator(
        registry,
      );

    this.readinessEvaluator =
      new WorkflowReadinessEvaluator(
        registry,
      );
  }

  evaluate(
    request: AcceptanceWorkflowBridgeRequest,
  ): AcceptanceWorkflowBridgeResult {
    const {
      dependencyTask,
      dependentTask,
      acceptance,
    } = request;

    const reasons: string[] = [];

    if (
      acceptance.taskId !==
      dependencyTask.id
    ) {
      reasons.push(
        `Acceptance task "${acceptance.taskId}" does not match dependency task "${dependencyTask.id}".`,
      );
    }

    if (!acceptance.accepted) {
      reasons.push(
        ...acceptance.reasons.map(
          (reason) =>
            `Acceptance rejected: ${reason}`,
        ),
      );
    }

    const dependencyEvaluation =
      this.dependencyEvaluator.evaluate(
        dependentTask,
      );

    if (
      !dependencyEvaluation.satisfied
    ) {
      reasons.push(
        ...dependencyEvaluation.missingDependencyIds.map(
          (dependencyId) =>
            `Dependency "${dependencyId}" is not completed.`,
        ),
      );
    }

    const dependentReadiness =
      this.readinessEvaluator.evaluate(
        dependentTask,
      );

    if (
      dependentReadiness.status ===
      "invalid"
    ) {
      reasons.push(
        ...dependentReadiness.reasons.map(
          (reason) =>
            `Dependent task invalid: ${reason}`,
        ),
      );
    }

    const accepted =
      acceptance.accepted &&
      dependencyTask.status ===
        "completed" &&
      dependencyEvaluation.satisfied &&
      dependentReadiness.status ===
        "ready" &&
      reasons.length === 0;

    const status: AcceptanceDependencyStatus =
      !acceptance.accepted
        ? "blocked"
        : dependentReadiness.status ===
            "invalid"
          ? "invalid"
          : dependencyEvaluation.satisfied
            ? "satisfied"
            : "blocked";

    const dependency: AcceptanceDependencyDecision =
      {
        id:
          `acceptance-dependency-${dependencyTask.id}-${dependentTask.id}`,

        dependencyTaskId:
          dependencyTask.id,

        acceptanceId:
          acceptance.id,

        accepted:
          acceptance.accepted,

        status,

        reasons,

        evidenceIds:
          [...acceptance.evidenceIds],

        verificationIds:
          [...acceptance.verificationIds],

        createdAt:
          new Date().toISOString(),
      };

    return {
      accepted,
      dependency,
      dependencyEvaluation,
      dependentReadiness,
    };
  }
}
