import type {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";

import type {
  CodingWorkUnitExecutionResult,
} from "./coding-work-unit-execution";

import type {
  ModelExecutionRequest,
  ModelToolDefinition,
} from "./model-interface";

import {
  estimateModelContextCapacity,
} from "./model-context-capacity";

import {
  ModelRouter,
  type ModelRoutingRequest,
} from "./model-routing";

import type {
  ProviderAdapterRegistry,
} from "./provider-adapters";

import {
  ResilientModelExecutionAuthority,
  type ResilientModelExecutionOutcome,
} from "./resilient-model-execution";

import type {
  GovernedModelToolLoop,
} from "./governed-model-tool-loop";

import {
  KingsCodingMachine,
  type KingsCodingMachineModelExecutionRequest,
} from "./kings-coding-machine";

export interface ModelDrivenCodingExecutionRequest {
  modelRequest:
    ModelExecutionRequest;

  routing:
    ModelRoutingRequest;

  machineRequest:
    Omit<
      KingsCodingMachineModelExecutionRequest,
      "modelResult"
    >;
}

function trimDiagnostics(
  value: string,
  limit = 20_000,
): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n...[diagnostics truncated by K.I.N.G.S.]`;
}

function isNonRetryablePolicyFailure(
  message: string,
): boolean {
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
  ].some((fragment) => normalized.includes(fragment));
}

export class ModelDrivenCodingExecutionAuthority {
  private readonly resilientExecution:
    ResilientModelExecutionAuthority;

  constructor(
    private readonly machine:
      KingsCodingMachine,
    private readonly router:
      ModelRouter,
    private readonly providers:
      ProviderAdapterRegistry,
    resilientExecution?:
      ResilientModelExecutionAuthority,
    private readonly governedToolLoop?:
      GovernedModelToolLoop,
    private readonly governedToolDefinitions:
      readonly ModelToolDefinition[] = [],
  ) {
    this.resilientExecution =
      resilientExecution ??
      new ResilientModelExecutionAuthority(
        providers,
      );
  }

  async execute(
    request:
      ModelDrivenCodingExecutionRequest,
    editor:
      EngineeringRepairEditor,
    buildTestOptions:
      ConstructorParameters<
        typeof import("./coding-work-unit-execution").CodingWorkUnitExecutionAuthority
      >[1],
  ):
    Promise<CodingWorkUnitExecutionResult> {
    const toolsActive = Boolean(
      this.governedToolLoop &&
      this.governedToolDefinitions.length > 0,
    );
    const initialModelRequest = toolsActive
      ? this.withGovernedTools(request.modelRequest)
      : request.modelRequest;
    const baseRoutingRequest: ModelRoutingRequest = toolsActive
      ? {
          ...request.routing,
          requireToolCalling: true,
        }
      : request.routing;

    const maxIterations = Math.max(
      1,
      request.machineRequest.execution.workUnit.budget.maxIterations,
    );

    let modelRequest = initialModelRequest;
    let lastResult: CodingWorkUnitExecutionResult | undefined;
    let lastError: Error | undefined;
    let previousModelContent = "";

    for (
      let iteration = 1;
      iteration <= maxIterations;
      iteration += 1
    ) {
      /*
       * Recalculate capacity on every repair iteration. Verification feedback,
       * previous generated code, and provider-visible tool schemas all grow the
       * request. Reusing the first route can therefore overflow a smaller model
       * later in the same governed coding loop.
       */
      const contextCapacity =
        estimateModelContextCapacity(
          modelRequest,
        );
      const routingRequest: ModelRoutingRequest = {
        ...baseRoutingRequest,
        requiredContextTokens: Math.max(
          baseRoutingRequest.requiredContextTokens ?? 0,
          contextCapacity.requiredContextTokens,
        ),
      };
      const route =
        this.router.route(
          routingRequest,
        );

      if (
        !route.selected ||
        route.candidates.length === 0
      ) {
        throw new Error(
          `K.I.N.G.S. Model Driven Coding: no model route can fit iteration ${iteration} requiring approximately ${routingRequest.requiredContextTokens} context tokens. ${route.reason}`,
        );
      }

      const execution =
        await this.executeModel(
          route.candidates,
          modelRequest,
        );

      if (!execution.result.success) {
        const attemptSummary =
          execution.attempts
            .map(
              (attempt) =>
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
        const codingResult =
          await this.machine.executeCodingWorkUnitFromModel(
            {
              ...request.machineRequest,
              modelResult:
                execution.result,
            },
            editor,
            buildTestOptions,
          );

        lastResult = codingResult;

        if (codingResult.completed) {
          return codingResult;
        }

        const diagnostics =
          codingResult.failureDiagnostics ??
          [
            ...codingResult.verification.unmetCriteria.map(
              (criterion) =>
                `UNMET ACCEPTANCE CRITERION: ${criterion}`,
            ),
            ...codingResult.buildTest.steps
              .filter((step) => !step.passed)
              .map(
                (step) =>
                  `FAILED COMMAND ${step.step.id}: ${step.execution.stderr || step.execution.stdout || `exit ${step.execution.exitCode}`}`,
              ),
          ].join("\n");

        if (iteration >= maxIterations) {
          return codingResult;
        }

        modelRequest = this.createRepairRequest(
          initialModelRequest,
          modelRequest,
          previousModelContent,
          diagnostics ||
            "The project did not pass K.I.N.G.S. project-aware completion verification.",
          iteration,
        );
      } catch (error) {
        const caught =
          error instanceof Error
            ? error
            : new Error(String(error));
        lastError = caught;

        if (
          isNonRetryablePolicyFailure(
            caught.message,
          ) ||
          iteration >= maxIterations
        ) {
          throw caught;
        }

        modelRequest = this.createRepairRequest(
          initialModelRequest,
          modelRequest,
          previousModelContent,
          caught.message,
          iteration,
        );
      }
    }

    if (lastResult) {
      return lastResult;
    }

    throw lastError ??
      new Error(
        "K.I.N.G.S. Model Driven Coding: coding loop ended without a verified result.",
      );
  }

  private withGovernedTools(
    request: ModelExecutionRequest,
  ): ModelExecutionRequest {
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
    original:
      ModelExecutionRequest,
    previous:
      ModelExecutionRequest,
    previousModelContent:
      string,
    diagnostics:
      string,
    completedIteration:
      number,
  ):
    ModelExecutionRequest {
    const repairNumber =
      completedIteration + 1;

    return {
      ...original,
      id:
        `${original.id}-repair-${repairNumber}`,
      messages: [
        ...previous.messages,
        {
          role:
            "assistant",
          content:
            previousModelContent.length > 12_000
              ? `${previousModelContent.slice(0, 12_000)}\n...[previous generated FILE blocks truncated]`
              : previousModelContent,
        },
        {
          role:
            "user",
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
      ],
      temperature:
        Math.min(
          original.temperature ?? 0.1,
          0.2,
        ),
    };
  }
}
