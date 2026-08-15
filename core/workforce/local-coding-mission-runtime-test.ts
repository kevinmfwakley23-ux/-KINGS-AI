import {
  LocalCodingMissionRuntime,
} from "./local-coding-mission-runtime";

const assert: (
  condition: unknown,
  message: string,
) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
};

async function main(): Promise<void> {
  const calls: string[] = [];

  const runtime = new LocalCodingMissionRuntime({
    workflowExecutor: {
      async execute(request: any) {
        calls.push(request.objective);

        return {
          success: true,
          workflowId: request.id,
          missionId: request.missionId,
          completedWorkUnits: request.workUnits.length,
          blockedWorkUnits: 0,
          evidence: [
            "workflow:executed",
            "workflow:local-path",
          ],
        };
      },
    } as any,
  });

  const result = await runtime.execute({
    id: "runtime-001",
    missionId: "mission-local-coding-001",
    objective:
      "Execute a software-engineering mission using the local K.I.N.G.S. coding runtime.",
    context:
      "K.I.N.G.S. must perform the engineering work locally and retain governed execution.",
    workUnits: [
      {
        id: "unit-001",
        missionId: "mission-local-coding-001",
        requiredCapabilities: [],
        objective:
          "Inspect the repository and determine the implementation required.",
        context:
          "Use the local K.I.N.G.S. coding runtime and preserve governed execution.",
      },
      {
        id: "unit-002",
        missionId: "mission-local-coding-001",
        requiredCapabilities: [],
        objective:
          "Implement, test, verify, and complete the requested change.",
        context:
          "Use the local K.I.N.G.S. coding runtime and preserve governed execution.",
      },
    ],
    executor: {} as any,
    model: {} as any,
  });

  assert(
    calls.length === 1,
    "mission runtime did not invoke the model-driven workflow",
  );

  assert(
    calls[0].includes("local K.I.N.G.S. coding runtime"),
    "mission objective was not forwarded",
  );

  assert(
    result.success === true,
    "local coding mission runtime did not report success",
  );

  assert(
    result.missionId === "mission-local-coding-001",
    "mission identity was not preserved",
  );

  assert(
    result.evidence.includes(
      "local-coding-runtime:model-driven",
    ),
    "model-driven runtime evidence missing",
  );

  assert(
    result.evidence.includes(
      "local-coding-runtime:local-engineering-path",
    ),
    "local engineering path evidence missing",
  );

  console.log(
    "001.LOCAL CODING RUNTIME → MODEL-DRIVEN JOIN: SUCCESS",
  );
  console.log(
    "002.LOCAL CODING RUNTIME → MISSION IDENTITY: SUCCESS",
  );
  console.log(
    "003.LOCAL CODING RUNTIME → LOCAL ENGINEERING PATH: SUCCESS",
  );
  console.log(
    "004.LOCAL CODING RUNTIME → GOVERNED RESULT: SUCCESS",
  );
  console.log(
    "K.I.N.G.S. LOCAL CODING MISSION RUNTIME: SUCCESS",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
