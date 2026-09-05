import type { EngineeringRepairEditor } from "./engineering-repair-editor";
import type { CodingWorkUnitExecutionResult } from "./coding-work-unit-execution";
import type {
  ModelExecutionRequest,
  ModelRequestMessage,
  ModelToolDefinition,
} from "./model-interface";
import { estimateModelContextCapacity } from "./model-context-capacity";
import {
  ModelRouter,
  type ModelRoutingCandidate,
  type ModelRoutingRequest,
} from "./model-routing";
import type { ProviderAdapterRegistry } from "./provider-adapters";
import {
  ResilientModelExecutionAuthority,
  type ResilientModelExecutionOutcome,
} from "./resilient-model-execution";
import type { GovernedModelToolLoop } from "./governed-model-tool-loop";
import {
  KingsCodingMachine,
  type KingsCodingMachineModelExecutionRequest,
} from "./kings-coding-machine";
import {
  InferenceBudgetAuthority,
  type DurableInferenceEconomicsLedger,
  type InferenceBudgetPolicy,
  type InferenceRouteClass,
} from "./inference-economics";
import type { ProviderQuotaAuthority } from "./provider-quota-state";

export interface ModelDrivenCodingEconomicsRuntime {
  ledger: DurableInferenceEconomicsLedger;
  policy: InferenceBudgetPolicy;
  approvedPaidEscalation?: boolean;
  quotaAuthority?: ProviderQuotaAuthority;
}

export interface ModelDrivenCodingExecutionRequest {
  modelRequest: ModelExecutionRequest;
  routing: ModelRoutingRequest;
  machineRequest: Omit<KingsCodingMachineModelExecutionRequest, "modelResult">;
  economics?: ModelDrivenCodingEconomicsRuntime;
}

function trimBounded(value: string, limit: number, marker: string): string {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit)}\n...[${marker} truncated by K.I.N.G.S.]`;
}

function trimDiagnostics(value: string, limit = 20_000): string {
  return trimBounded(value, limit, "diagnostics");
}

/**
 * Build one bounded repair turn without replaying prior failed repair turns.
 * The stable system/task/repository prefix remains reusable by provider prompt
 * caches; only the latest proposal and executable verification evidence change.
 */
export function buildBoundedRepairMessages(
  originalMessages: readonly ModelRequestMessage[],
  previousModelContent: string,
  diagnostics: string,
  completedIteration: number,
): ModelRequestMessage[] {
  return [
    ...originalMessages.map((message) => ({
      ...message,
      toolCalls: message.toolCalls
        ? message.toolCalls.map((proposal) => ({
            ...proposal,
            arguments: { ...proposal.arguments },
          }))
        : undefined,
    })),
    {
      role: "assistant",
      content: trimBounded(
        previousModelContent,
        12_000,
        "previous generated FILE blocks",
      ),
    },
    {
      role: "user",
      content: [
        `K.I.N.G.S. real build/test verification failed after coding iteration ${completedIteration}.`,
        "Diagnose the actual failure below and repair the project.",
        "Return ONLY complete FILE blocks. Use [replace] for existing files that must change and [create] for new files.",
        "Do not weaken, delete, skip, fake, or replace the acceptance tests merely to get green. Fix the product so the real checks pass.",
        "If K.I.N.G.S. reports an uncovered acceptance criterion, add a genuine executable test or launch/smoke path that exercises that criterion.",
        "Do not emit commentary outside FILE blocks.",
        "",
        "REAL VERIFICATION DIAGNOSTICS:",
        trimDiagnostics(diagnostics),
      ].join("\n"),
    },
  ];
}

function isNonRetryablePolicyFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "path escape",
    "outside the authorized workspace",
    "unauthorized path",
    "not approved",
    "mission id does not match",
    "proposal mission does not match",
    "proposal task does not match",
    "project mismatch",
    "workspace project mismatch",
    "requires an approved and locked mission plan",
    "governed tool loop",
    "requires human input",
    "owner approval is required",
    "hard inference budget",
  ].some((fragment) => normalized.includes(fragment));
}

function routeClass(candidate: ModelRoutingCandidate): InferenceRouteClass {
  if (candidate.internal) return "local";
  if (candidate.zeroMarginalCost || candidate.costBasis === "verified-free") return "free";
  // External routes that have not been proven zero-marginal-cost are governed as
  // paid before fallback. Unknown price must never become an implicit free route.
  return "paid";
}

export class ModelDrivenCodingExecutionAuthority {
  private readonly resilientExecution: ResilientModelExecutionAuthority;

  constructor(
    private readonly machine: KingsCodingMachine,
    private readonly router: ModelRouter,
    private readonly providers: ProviderAdapterRegistry,
    resilientExecution?: ResilientModelExecutionAuthority,
    private readonly governedToolLoop?: GovernedModelToolLoop,
    private readonly governedToolDefinitions: readonly ModelToolDefinition[] = [],
  ) {
    this.resilientExecution =
      resilientExecution ?? new ResilientModelExecutionAuthority(providers);
  }

  async execute(
    request: ModelDrivenCodingExecutionRequest,
    editor: EngineeringRepairEditor,
    buildTestOptions: ConstructorParameters<
      typeof import("./coding-work-unit-execution").CodingWorkUnitExecutionAuthority
    >[1],
  ): Promise<CodingWorkUnitExecutionResult> {
    const toolsActive = Boolean(
      this.governedToolLoop && this.governedToolDefinitions.length > 0,
    );
    const initialModelRequest = toolsActive
      ? this.withGovernedTools(request.modelRequest)
      : request.modelRequest;
    const baseRoutingRequest: ModelRoutingRequest = toolsActive
      ? { ...request.routing, requireToolCalling: true }
      : request.routing;
    const maxIterations = Math.max(
      1,
      request.machineRequest.execution.workUnit.budget.maxIterations,
    );
    const budgetAuthority = request.economics
      ? new InferenceBudgetAuthority(
          request.economics.ledger,
          request.economics.policy,
        )
      : undefined;

    let modelRequest = initialModelRequest;
    let lastResult: CodingWorkUnitExecutionResult | undefined;
    let lastError: Error | undefined;
    let previousModelContent = "";

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const contextCapacity = estimateModelContextCapacity(modelRequest);
      const routingRequest: ModelRoutingRequest = {
        ...baseRoutingRequest,
        requiredContextTokens: Math.max(
          baseRoutingRequest.requiredContextTokens ?? 0,
          contextCapacity.requiredContextTokens,
        ),
      };
      const route = this.router.route(routingRequest);
      if (!route.selected || route.candidates.length === 0) {
        throw new Error(
          `K.I.N.G.S. Model Driven Coding: no model route can fit iteration ${iteration} requiring approximately ${routingRequest.requiredContextTokens} context tokens. ${route.reason}`,
        );
      }

      let candidates = [...route.candidates];
      const governanceReasons: string[] = [];
      if (request.economics?.quotaAuthority) {
        const quota = request.economics.quotaAuthority.filter(candidates);
        candidates = quota.candidates;
        governanceReasons.push(
          ...quota.excluded.map((item) =>
            `${item.providerId}/${item.modelId}: ${item.reason}`,
          ),
        );
      }

      if (budgetAuthority) {
        const permitted: ModelRoutingCandidate[] = [];
        for (const candidate of candidates) {
          const classification = routeClass(candidate);
          const decision = await budgetAuthority.assess({
            missionId: modelRequest.missionId,
            providerId: candidate.providerId,
            modelId: candidate.modelId,
            routeClass: classification,
            estimatedCostUsd:
              classification === "paid" && candidate.estimatedCost !== null
                ? candidate.estimatedCost
                : undefined,
            estimatedPaidTokens:
              classification === "paid"
                ? contextCapacity.requiredContextTokens
                : 0,
            approvedPaidEscalation:
              request.economics?.approvedPaidEscalation === true,
          });
          if (decision.status === "allowed") {
            permitted.push(candidate);
          } else {
            governanceReasons.push(
              `${candidate.providerId}/${candidate.modelId}: ${decision.status}: ${decision.reason}`,
            );
          }
        }
        candidates = permitted;
      }

      if (candidates.length === 0) {
        throw new Error(
          `K.I.N.G.S. Model Driven Coding: every route was withheld by quota/cost governance before iteration ${iteration}.${governanceReasons.length ? ` ${governanceReasons.join(" | ")}` : ""}`,
        );
      }

      const execution = await this.executeModel(candidates, modelRequest);
      this.observeQuotaFailures(request, execution);
      await this.recordEconomics(request, execution, candidates);

      if (!execution.result.success) {
        const attemptSummary = execution.attempts
          .map((attempt) =>
            `${attempt.providerId}/${attempt.modelId}:${attempt.skipped ? "skipped" : attempt.failureCode ?? "failed"}`,
          )
          .join(", ");
        throw new Error(
          execution.result.failure?.message ??
            `K.I.N.G.S. Model Driven Coding: all routed model executions failed.${attemptSummary ? ` Attempts: ${attemptSummary}` : ""}`,
        );
      }
      if (!execution.result.response) {
        throw new Error(
          "K.I.N.G.S. Model Driven Coding: provider returned success without a model response.",
        );
      }

      previousModelContent = execution.result.response.content;
      try {
        const codingResult = await this.machine.executeCodingWorkUnitFromModel(
          { ...request.machineRequest, modelResult: execution.result },
          editor,
          buildTestOptions,
        );
        lastResult = codingResult;
        if (codingResult.completed) return codingResult;

        const diagnostics = codingResult.failureDiagnostics ?? [
          ...codingResult.verification.unmetCriteria.map(
            (criterion) => `UNMET ACCEPTANCE CRITERION: ${criterion}`,
          ),
          ...codingResult.buildTest.steps
            .filter((step) => !step.passed)
            .map(
              (step) =>
                `FAILED COMMAND ${step.step.id}: ${step.execution.stderr || step.execution.stdout || `exit ${step.execution.exitCode}`}`,
            ),
        ].join("\n");
        if (iteration >= maxIterations) return codingResult;
        modelRequest = this.createRepairRequest(
          initialModelRequest,
          previousModelContent,
          diagnostics || "The project did not pass K.I.N.G.S. project-aware completion verification.",
          iteration,
        );
      } catch (error) {
        const caught = error instanceof Error ? error : new Error(String(error));
        lastError = caught;
        if (isNonRetryablePolicyFailure(caught.message) || iteration >= maxIterations) {
          throw caught;
        }
        modelRequest = this.createRepairRequest(
          initialModelRequest,
          previousModelContent,
          caught.message,
          iteration,
        );
      }
    }

    if (lastResult) return lastResult;
    throw lastError ?? new Error(
      "K.I.N.G.S. Model Driven Coding: coding loop ended without a verified result.",
    );
  }

  private observeQuotaFailures(
    request: ModelDrivenCodingExecutionRequest,
    execution: ResilientModelExecutionOutcome,
  ): void {
    const quota = request.economics?.quotaAuthority;
    if (!quota) return;
    const observedAt = new Date().toISOString();
    for (const attempt of execution.attempts) {
      if (attempt.skipped) continue;
      if (attempt.failureCode?.includes("429")) {
        quota.observe({
          providerId: attempt.providerId,
          modelId: attempt.modelId,
          observedAt,
          statusCode: 429,
        });
      }
    }
  }

  private async recordEconomics(
    request: ModelDrivenCodingExecutionRequest,
    execution: ResilientModelExecutionOutcome,
    candidates: readonly ModelRoutingCandidate[],
  ): Promise<void> {
    const ledger = request.economics?.ledger;
    const response = execution.result.response;
    if (!ledger || !execution.result.success || !response || !execution.providerId || !execution.modelId) {
      return;
    }
    const candidate = candidates.find((item) =>
      item.providerId === execution.providerId && item.modelId === execution.modelId,
    );
    if (!candidate) return;
    const classification = routeClass(candidate);
    const totalTokens = response.usage.tokensUsed;
    await ledger.record({
      requestId: response.requestId,
      missionId: request.modelRequest.missionId,
      providerId: execution.providerId,
      modelId: execution.modelId,
      completedAt: response.metadata.completedAt,
      routeClass: classification,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cachedTokens: response.usage.cachedTokens ?? 0,
      totalTokens,
      paidTokens: classification === "paid" ? totalTokens : 0,
      actualCostUsd: response.usage.reportedCostUsd,
    });
  }

  private withGovernedTools(request: ModelExecutionRequest): ModelExecutionRequest {
    return {
      ...request,
      allowToolProposals: true,
      toolDefinitions: this.governedToolDefinitions.map((tool) => ({
        ...tool,
        inputSchema: { ...tool.inputSchema },
      })),
      parallelToolCalls: false,
    };
  }

  private executeModel(
    candidates: Parameters<ResilientModelExecutionAuthority["execute"]>[0],
    request: ModelExecutionRequest,
  ): Promise<ResilientModelExecutionOutcome> {
    return this.governedToolLoop
      ? this.governedToolLoop.execute(candidates, request)
      : this.resilientExecution.execute(candidates, request);
  }

  private createRepairRequest(
    original: ModelExecutionRequest,
    previousModelContent: string,
    diagnostics: string,
    completedIteration: number,
  ): ModelExecutionRequest {
    const repairNumber = completedIteration + 1;
    return {
      ...original,
      id: `${original.id}-repair-${repairNumber}`,
      messages: buildBoundedRepairMessages(
        original.messages,
        previousModelContent,
        diagnostics,
        completedIteration,
      ),
      temperature: Math.min(original.temperature ?? 0.1, 0.2),
    };
  }
}
