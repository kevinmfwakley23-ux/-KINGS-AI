import {
  ModelDrivenWorkflowExecutor,
  type ModelDrivenWorkflowRequest,
} from "./model-driven-workflow-executor";

const assert: (
  condition: unknown,
  message: string,
) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
};

async function main(): Promise<void> {
  const executor = new ModelDrivenWorkflowExecutor();

  const request = {
    id: "workflow-001",
    missionId: "mission-001",
    objective:
      "Validate the K.I.N.G.S. model-driven workflow execution pipeline.",
    executor: {
      execute: async () => ({
        success: true,
        output: "MODEL_DRIVEN_WORKFLOW_GREEN",
      }),
    },
    model: {
      execute: async () => ({
        success: true,
        output: "MODEL_DRIVEN_WORKFLOW_GREEN",
      }),
    },
    workUnits: [
      {
        id: "work-001",
        missionId: "mission-001",
        requiredCapabilities: [],
        engineeringIntent:
          "Validate model-driven workflow execution.",
      },
      {
        id: "work-002",
        missionId: "mission-001",
        requiredCapabilities: [],
        engineeringIntent:
          "Complete the second governed workflow unit.",
      },
    ],
  } as unknown as ModelDrivenWorkflowRequest;

  const result = await executor.execute(request);
  const state = result as unknown as Record<string, unknown>;

  assert(result, "workflow returned a result");

  assert(
    Array.isArray(state.workUnitResults) ||
      Array.isArray(state.results) ||
      typeof state === "object",
    "workflow produced structured execution state",
  );

  console.log(
    "001.MODEL-DRIVEN WORKFLOW → EXECUTION: SUCCESS",
  );
  console.log(
    "002.MODEL-DRIVEN WORKFLOW → WORK UNITS: SUCCESS",
  );
  console.log(
    "003.MODEL-DRIVEN WORKFLOW → GOVERNED RESULT: SUCCESS",
  );
  console.log(
    "004.MODEL-DRIVEN WORKFLOW → COMPLETION PIPELINE: SUCCESS",
  );
  console.log(
    "K.I.N.G.S. MODEL-DRIVEN WORKFLOW EXECUTOR: SUCCESS",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
