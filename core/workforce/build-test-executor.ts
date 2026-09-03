import type {
  ID,
} from "./types";

import {
  resolve,
  relative,
  isAbsolute,
} from "node:path";

import {
  ExecutionSandbox,
  type SandboxExecutionResult,
  type SandboxPolicy,
} from "./execution-sandbox";

import type {
  WorkUnitContract,
} from "./work-unit-contract";

export type BuildTestOperation =
  | "build"
  | "test"
  | "lint"
  | "validate";

export interface BuildTestStep {
  id:
    ID;
  operation:
    BuildTestOperation;
  command:
    string;
  args:
    string[];
  workingDirectory:
    string;
  verifiesCriteria?:
    string[];
}

export interface BuildTestExecutionRequest {
  taskId:
    ID;
  workUnit:
    WorkUnitContract;
  steps:
    BuildTestStep[];
  workspaceRoot?:
    string;
}

export interface BuildTestStepResult {
  step:
    BuildTestStep;
  execution:
    SandboxExecutionResult;
  passed:
    boolean;
}

export interface BuildTestExecutionResult {
  taskId:
    ID;
  passed:
    boolean;
  steps:
    BuildTestStepResult[];
  startedAt:
    string;
  completedAt:
    string;
}

export interface BuildTestExecutorOptions {
  sandboxPolicy:
    SandboxPolicy;
}

function isPathWithin(
  candidate: string,
  allowedRoot: string,
): boolean {
  const relativePath = relative(
    resolve(allowedRoot),
    resolve(candidate),
  );

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

export class BuildTestExecutor {
  private readonly sandbox:
    ExecutionSandbox;

  constructor(
    options:
      BuildTestExecutorOptions,
  ) {
    this.sandbox =
      new ExecutionSandbox(
        options.sandboxPolicy,
      );
  }

  async execute(
    request:
      BuildTestExecutionRequest,
  ): Promise<
    BuildTestExecutionResult
  > {
    this.validateRequest(
      request,
    );

    const startedAt =
      new Date().toISOString();

    const results:
      BuildTestStepResult[] =
      [];

    for (
      const step of
        request.steps
    ) {
      const execution =
        await this.sandbox.execute({
          command:
            step.command,
          args:
            step.args,
          workingDirectory:
            step.workingDirectory,
          sideEffects: [
            "read",
            "execute",
            "write",
          ],
        });

      const passed =
        execution.exitCode ===
          0 &&
        !execution.timedOut;

      results.push({
        step,
        execution,
        passed,
      });

      if (!passed) {
        return {
          taskId:
            request.taskId,
          passed:
            false,
          steps:
            results,
          startedAt,
          completedAt:
            new Date().toISOString(),
        };
      }
    }

    return {
      taskId:
        request.taskId,
      passed:
        true,
      steps:
        results,
      startedAt,
      completedAt:
        new Date().toISOString(),
    };
  }

  private validateRequest(
    request:
      BuildTestExecutionRequest,
  ): void {
    if (
      !request.taskId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Build/Test Executor: task id is required",
      );
    }

    if (
      !request.workUnit.approved
    ) {
      throw new Error(
        `K.I.N.G.S. Build/Test Executor: Work Unit "${request.workUnit.id}" is not approved`,
      );
    }

    if (
      request.steps.length ===
      0
    ) {
      throw new Error(
        "K.I.N.G.S. Build/Test Executor: at least one build/test step is required",
      );
    }

    if (
      request.steps.some(
        (step) =>
          !step.id.trim() ||
          !step.command.trim() ||
          !step.workingDirectory.trim(),
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Build/Test Executor: every step requires id, command, and working directory",
      );
    }

    const invalidCriterion =
      request.steps.find(
        (step) =>
          step.verifiesCriteria?.some(
            (criterion) =>
              !criterion.trim(),
          ),
      );

    if (invalidCriterion) {
      throw new Error(
        `K.I.N.G.S. Build/Test Executor: step "${invalidCriterion.id}" contains a blank verification criterion`,
      );
    }

    const workspaceRoot =
      resolve(
        request.workspaceRoot ??
        process.cwd(),
      );

    const unauthorizedStep =
      request.steps.find(
        (step) =>
          !request.workUnit.allowedPaths.some(
            (allowedPath) =>
              isPathWithin(
                step.workingDirectory,
                resolve(
                  workspaceRoot,
                  allowedPath,
                ),
              ),
          ),
      );

    if (
      unauthorizedStep
    ) {
      throw new Error(
        `K.I.N.G.S. Build/Test Executor: step "${unauthorizedStep.id}" uses an unauthorized working directory`,
      );
    }
  }
}
