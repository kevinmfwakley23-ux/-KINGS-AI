import type {
  ID,
} from "./types";

import {
  BudgetAuthority,
  type BudgetUsage,
} from "./budget-authority";

import {
  CompletionGate,
  type CompletionEvidence,
  type CompletionDecision,
} from "./completion-gate";

import {
  validateWorkUnitContract,
} from "./work-unit-contract";

import {
  WorkUnitRegistry,
} from "./work-unit-registry";

import type {
  WorkforceRegistry,
} from "./registry";

import type {
  WorkforceExecutionPort,
} from "./execution/execution-port";

import type {
  AgentExecutionResult,
} from "./execution/adapter";

export type WorkerLoopStopReason =
  | "completed"
  | "execution-failed"
  | "execution-rejected"
  | "budget-exhausted"
  | "incomplete"
  | "invalid-work-unit";

export interface WorkerIterationEvidence {
  evidence:
    CompletionEvidence[];

  verified:
    boolean;

  verificationReasons:
    string[];
}

export interface WorkerIterationEvidenceProvider {
  collectAndVerify(
    taskId: ID,
    result: AgentExecutionResult,
    iteration: number,
  ): Promise<
    WorkerIterationEvidence
  >;
}

export interface WorkerOperatingLoopIteration {
  iteration:
    number;

  result:
    AgentExecutionResult;

  evidence:
    CompletionEvidence[];

  verified:
    boolean;

  verificationReasons:
    string[];

  completion:
    CompletionDecision;

  usage:
    BudgetUsage;
}

export interface WorkerOperatingLoopResult {
  taskId:
    ID;

  agentId:
    ID;

  workUnitId:
    ID;

  status:
    | "completed"
    | "failed"
    | "incomplete"
    | "budget-exhausted";

  stopReason:
    WorkerLoopStopReason;

  iterationsUsed:
    number;

  finalResult:
    AgentExecutionResult;

  completion:
    CompletionDecision;

  verificationReasons:
    string[];

  iterations:
    WorkerOperatingLoopIteration[];
}

export class WorkerOperatingLoopAuthority {
  private readonly budgetAuthority:
    BudgetAuthority;

  private readonly completionGate:
    CompletionGate;

  constructor(
    private readonly registry:
      WorkforceRegistry,
    private readonly workUnitRegistry:
      WorkUnitRegistry,
    private readonly executionPort:
      WorkforceExecutionPort,
    private readonly evidenceProvider:
      WorkerIterationEvidenceProvider,
    budgetAuthority:
      BudgetAuthority =
      new BudgetAuthority(),
    completionGate:
      CompletionGate =
      new CompletionGate(),
  ) {
    this.budgetAuthority =
      budgetAuthority;

    this.completionGate =
      completionGate;
  }

  async execute(
    taskId: ID,
  ): Promise<
    WorkerOperatingLoopResult
  > {
    const task =
      this.registry.getTask(
        taskId,
      );

    if (!task) {
      throw new Error(
        `K.I.N.G.S. Worker Operating Loop: task "${taskId}" not found.`,
      );
    }

    if (
      !task.assignedAgentId
    ) {
      throw new Error(
        `K.I.N.G.S. Worker Operating Loop: task "${taskId}" has no assigned worker.`,
      );
    }

    if (
      task.status !==
      "ready"
    ) {
      throw new Error(
        `K.I.N.G.S. Worker Operating Loop: task "${taskId}" must be ready; current status is "${task.status}".`,
      );
    }

    const agent =
      this.registry.getAgent(
        task.assignedAgentId,
      );

    if (!agent) {
      throw new Error(
        `K.I.N.G.S. Worker Operating Loop: assigned worker "${task.assignedAgentId}" not found.`,
      );
    }

    const workUnit =
      this.workUnitRegistry.get(
        taskId,
      );

    if (!workUnit) {
      throw new Error(
        `K.I.N.G.S. Worker Operating Loop: no Work Unit Contract is bound to task "${taskId}".`,
      );
    }

    const validation =
      validateWorkUnitContract(
        workUnit,
      );

    if (
      !validation.valid
    ) {
      throw new Error(
        `K.I.N.G.S. Worker Operating Loop: invalid Work Unit Contract: ` +
        validation.reasons.join(
          " ",
        ),
      );
    }

    const budgetValidation =
      this.budgetAuthority.validateBudget(
        workUnit.budget,
      );

    if (
      !budgetValidation.allowed
    ) {
      throw new Error(
        `K.I.N.G.S. Worker Operating Loop: invalid Work Unit budget: ` +
        budgetValidation.reasons.join(
          " ",
        ),
      );
    }

    const iterations:
      WorkerOperatingLoopIteration[] =
      [];

    let cumulativeUsage:
      BudgetUsage = {
        elapsedMs:
          0,
        tokensUsed:
          0,
        iterationsUsed:
          0,
      };

    let finalResult:
      AgentExecutionResult |
      undefined;

    let finalCompletion:
      CompletionDecision = {
        taskId,
        passed:
          false,
        reasons: [
          "Worker has not executed.",
        ],
        evidenceIds: [],
      };

    let finalVerificationReasons:
      string[] = [];

    for (
      let iteration = 1;
      iteration <=
      workUnit.budget.maxIterations;
      iteration += 1
    ) {
      const result =
        await this.executionPort.execute(
          taskId,
        );

      finalResult =
        result;

      const iterationUsage =
        result.usage ?? {
          elapsedMs:
            0,
          tokensUsed:
            0,
          iterationsUsed:
            1,
        };

      cumulativeUsage = {
        elapsedMs:
          cumulativeUsage.elapsedMs +
          iterationUsage.elapsedMs,

        tokensUsed:
          cumulativeUsage.tokensUsed +
          iterationUsage.tokensUsed,

        iterationsUsed:
          iteration,

        estimatedCost:
          cumulativeUsage.estimatedCost ===
            undefined &&
          iterationUsage.estimatedCost ===
            undefined
            ? undefined
            : (
                cumulativeUsage.estimatedCost ??
                0
              ) +
              (
                iterationUsage.estimatedCost ??
                0
              ),
      };

      const budgetDecision =
        this.budgetAuthority.evaluate(
          workUnit.budget,
          cumulativeUsage,
        );

      if (
        !budgetDecision.allowed
      ) {
        finalVerificationReasons =
          budgetDecision.reasons;

        finalCompletion = {
          taskId,
          passed:
            false,
          reasons:
            budgetDecision.reasons,
          evidenceIds: [],
        };

        iterations.push({
          iteration,
          result,
          evidence: [],
          verified:
            false,
          verificationReasons:
            budgetDecision.reasons,
          completion:
            finalCompletion,
          usage:
            cumulativeUsage,
        });

        return {
          taskId,
          agentId:
            agent.id,
          workUnitId:
            workUnit.id,
          status:
            "budget-exhausted",
          stopReason:
            "budget-exhausted",
          iterationsUsed:
            iteration,
          finalResult:
            result,
          completion:
            finalCompletion,
          verificationReasons:
            finalVerificationReasons,
          iterations,
        };
      }

      if (
        result.status ===
        "failure"
      ) {
        finalCompletion = {
          taskId,
          passed:
            false,
          reasons: [
            "Worker execution returned failure.",
          ],
          evidenceIds: [],
        };

        iterations.push({
          iteration,
          result,
          evidence: [],
          verified:
            false,
          verificationReasons: [
            "Worker execution returned failure.",
          ],
          completion:
            finalCompletion,
          usage:
            cumulativeUsage,
        });

        return {
          taskId,
          agentId:
            agent.id,
          workUnitId:
            workUnit.id,
          status:
            "failed",
          stopReason:
            "execution-failed",
          iterationsUsed:
            iteration,
          finalResult:
            result,
          completion:
            finalCompletion,
          verificationReasons: [
            "Worker execution returned failure.",
          ],
          iterations,
        };
      }

      if (
        result.status ===
        "rejected"
      ) {
        finalCompletion = {
          taskId,
          passed:
            false,
          reasons: [
            "Worker execution was rejected.",
          ],
          evidenceIds: [],
        };

        iterations.push({
          iteration,
          result,
          evidence: [],
          verified:
            false,
          verificationReasons: [
            "Worker execution was rejected.",
          ],
          completion:
            finalCompletion,
          usage:
            cumulativeUsage,
        });

        return {
          taskId,
          agentId:
            agent.id,
          workUnitId:
            workUnit.id,
          status:
            "failed",
          stopReason:
            "execution-rejected",
          iterationsUsed:
            iteration,
          finalResult:
            result,
          completion:
            finalCompletion,
          verificationReasons: [
            "Worker execution was rejected.",
          ],
          iterations,
        };
      }

      const iterationEvidence =
        await this.evidenceProvider
          .collectAndVerify(
            taskId,
            result,
            iteration,
          );

      finalVerificationReasons =
        iterationEvidence
          .verificationReasons;

      /*
       * Explicit annotation is intentional.
       *
       * CompletionEvidenceStatus is a repository-owned
       * union. Without this annotation TypeScript widens
       * the object literal status field to string.
       */
      const evidenceForGate:
        CompletionEvidence[] =
        iterationEvidence.verified
          ? iterationEvidence.evidence
          : [
              ...iterationEvidence.evidence,
              {
                id:
                  `verification-failure-${taskId}-${iteration}`,
                type:
                  "verification",
                criterion:
                  "Execution evidence is independently verified.",
                status:
                  "failed",
                summary:
                  iterationEvidence
                    .verificationReasons
                    .join(
                      " ",
                    ) ||
                  "Verification failed.",
                verificationReference:
                  "worker-operating-loop-verification",
                createdAt:
                  new Date().toISOString(),
              },
            ];

      finalCompletion =
        this.completionGate.evaluate(
          taskId,
          workUnit,
          evidenceForGate,
        );

      iterations.push({
        iteration,
        result,
        evidence:
          evidenceForGate,
        verified:
          iterationEvidence.verified,
        verificationReasons:
          iterationEvidence
            .verificationReasons,
        completion:
          finalCompletion,
        usage:
          cumulativeUsage,
      });

      if (
        iterationEvidence.verified &&
        finalCompletion.passed
      ) {
        return {
          taskId,
          agentId:
            agent.id,
          workUnitId:
            workUnit.id,
          status:
            "completed",
          stopReason:
            "completed",
          iterationsUsed:
            iteration,
          finalResult:
            result,
          completion:
            finalCompletion,
          verificationReasons:
            finalVerificationReasons,
          iterations,
        };
      }

      if (
        iteration <
        workUnit.budget.maxIterations
      ) {
        continue;
      }

      return {
        taskId,
        agentId:
          agent.id,
        workUnitId:
          workUnit.id,
        status:
          "budget-exhausted",
        stopReason:
          "budget-exhausted",
        iterationsUsed:
          iteration,
        finalResult:
          result,
        completion:
          finalCompletion,
        verificationReasons:
          finalVerificationReasons,
        iterations,
      };
    }

    throw new Error(
      "K.I.N.G.S. Worker Operating Loop: unreachable loop termination.",
    );
  }
}
