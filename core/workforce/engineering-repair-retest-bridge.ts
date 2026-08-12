import type {
  ID,
} from "./types";

import {
  EngineeringRepairExecutionAuthority,
} from "./engineering-repair-execution";

import type {
  EngineeringRepairPlan,
  EngineeringRepairStep,
} from "./engineering-repair-planner";

import {
  EngineeringRepairEditor,
  type EngineeringRepairEdit,
} from "./engineering-repair-editor";

import {
  ControlledFileEditor,
  type FileEditorPolicy,
} from "./file-editor";

import {
  EngineeringRuntimeExecutor,
} from "./engineering-runtime-executor";

import type {
  BuiltEngineeringCommand,
} from "./engineering-command-builder";

export interface EngineeringRepairRetestRequest {
  plan:
    EngineeringRepairPlan;
  failureDiagnostics:
    string;
  edit:
    EngineeringRepairEdit;
  retestCommand:
    BuiltEngineeringCommand;
  filePolicy:
    FileEditorPolicy;
  sandboxPolicy:
    ConstructorParameters<
      typeof EngineeringRuntimeExecutor
    >[0]["sandboxPolicy"];
  completedAt:
    string;
}

export interface EngineeringRepairRetestResult {
  id:
    ID;
  planId:
    ID;
  projectId:
    ID;
  status:
    "completed"
    | "failed"
    | "blocked";
  verified:
    boolean;
  stepResults:
    Array<{
      stepId:
        ID;
      strategy:
        EngineeringRepairStep["strategy"];
      status:
        "success"
        | "failed"
        | "blocked";
      output:
        string;
      completedAt:
        string;
    }>;
}

export class EngineeringRepairRetestBridge {
  async execute(
    request:
      EngineeringRepairRetestRequest,
  ):
    Promise<EngineeringRepairRetestResult> {
    const editor =
      new EngineeringRepairEditor(
        new ControlledFileEditor(
          request.filePolicy,
        ),
      );

    const runtime =
      new EngineeringRuntimeExecutor({
        sandboxPolicy:
          request.sandboxPolicy,
      });

    const authority =
      new EngineeringRepairExecutionAuthority();

    const result =
      await authority.execute(
        request.plan,
        {
          async execute(
            step:
              EngineeringRepairStep,
          ) {
            if (
              step.strategy ===
              "inspect"
            ) {
              if (
                !request.failureDiagnostics.trim()
              ) {
                return {
                  success:
                    false,
                  output:
                    "No verified failure diagnostics were supplied for inspection.",
                };
              }

              return {
                success:
                  true,
                output:
                  `Verified failure diagnostics inspected: ${request.failureDiagnostics}`,
              };
            }

            if (
              step.strategy ===
              "edit"
            ) {
              try {
                const editResult =
                  await editor.execute(
                    step,
                    request.edit,
                  );

                return {
                  success:
                    editResult.success,
                  output:
                    editResult.output,
                };
              } catch (
                error
              ) {
                return {
                  success:
                    false,
                  output:
                    error instanceof Error
                      ? error.message
                      : String(error),
                };
              }
            }

            if (
              step.strategy ===
              "retest"
            ) {
              try {
                if (
                  !request.retestCommand.authorized
                ) {
                  return {
                    success:
                      false,
                    output:
                      "Retest command is not authorized.",
                  };
                }

                const execution =
                  await runtime.execute(
                    request.retestCommand,
                  );

                if (
                  execution.exitCode !==
                  0
                ) {
                  return {
                    success:
                      false,
                    output:
                      [
                        `Retest failed with exit code ${execution.exitCode}.`,
                        execution.stdout,
                        execution.stderr,
                      ]
                        .filter(
                          (
                            value,
                          ) =>
                            value.length >
                            0,
                        )
                        .join(
                          "\n",
                        ),
                  };
                }

                return {
                  success:
                    true,
                  output:
                    [
                      "Real retest succeeded.",
                      execution.stdout,
                    ]
                      .filter(
                        (
                          value,
                        ) =>
                          value.length >
                          0,
                      )
                      .join(
                        "\n",
                      ),
                };
              } catch (
                error
              ) {
                return {
                  success:
                    false,
                  output:
                    error instanceof Error
                      ? error.message
                      : String(error),
                };
              }
            }

            return {
              success:
                false,
              output:
                `Repair strategy "${step.strategy}" is not executable by this bridge.`,
            };
          },
        },
        request.completedAt,
      );

    return {
      id:
        `repair-retest-${request.plan.id}`,
      planId:
        result.planId,
      projectId:
        result.projectId,
      status:
        result.status,
      verified:
        result.verified,
      stepResults:
        result.stepResults,
    };
  }
}
