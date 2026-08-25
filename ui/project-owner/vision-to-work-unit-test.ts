import { strict as assert } from "node:assert";

import { ProjectOwnerUiController } from "../../core/workforce/project-owner-ui-contract";
import { ProjectOwnerMachineApi } from "../../core/workforce/project-owner-machine-api";
import { KingsCodingMachine } from "../../core/workforce/kings-coding-machine";
import { TaskControl } from "../../core/workforce/task-control";
import { WorkforceRegistry } from "../../core/workforce/registry";
import { WorkUnitRegistry } from "../../core/workforce/work-unit-registry";

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const workUnits = new WorkUnitRegistry();
  const taskControl = new TaskControl(registry);
  const machine = new KingsCodingMachine(undefined, undefined, taskControl, workUnits);

  const factory = {
    create(input: any) {
      const now = new Date().toISOString();
      const taskId = `task-${input.id}-build`;
      const workUnitId = `work-unit-${input.id}-build`;

      const mission = {
        id: input.id,
        name: input.projectName,
        description: input.objective,
        status: "planned" as const,
        objectives: [input.objective],
        sourceReferences: ["project-owner-ui"],
        createdAt: now,
        updatedAt: now,
      };

      const task = {
        id: taskId,
        missionId: input.id,
        name: `Build ${input.projectName}`,
        description: input.objective,
        requiredCapabilities: ["coding", "debugging", "verification"],
        requiredToolIds: ["tool-execution-sandbox"],
        status: "ready" as const,
        dependencyIds: [],
        inputReferences: ["project-owner-vision"],
        expectedOutputs: ["Working application", "Verification evidence"],
        createdAt: now,
        updatedAt: now,
      };

      const workUnit = {
        id: workUnitId,
        role: "coding-engineer",
        objective: input.objective,
        capabilityIds: ["engineering-typescript"],
        allowedToolIds: ["tool-execution-sandbox"],
        allowedPaths: ["."],
        budget: {
          maxTimeMs: 120_000,
          maxTokens: 8_000,
          maxIterations: 5,
        },
        dependencyIds: [],
        acceptanceCriteria: input.acceptanceCriteria,
        requiredEvidenceTypes: ["write", "command", "verification"],
        approved: true,
        createdAt: now,
        updatedAt: now,
      };

      registry.registerTask(task);
      workUnits.register(taskId, workUnit);

      return {
        mission,
        plan: {
          id: `plan-${input.id}`,
          missionId: input.id,
          version: 1,
          objective: input.objective,
          milestones: [
            {
              id: `milestone-${input.id}`,
              missionId: input.id,
              name: "Build",
              objective: input.objective,
              taskIds: [taskId],
              dependencyIds: [],
              status: "ready",
            },
          ],
          decisionIds: [],
          acceptanceCriteria: input.acceptanceCriteria,
          locked: false,
          approvedByHuman: false,
          createdAt: now,
          updatedAt: now,
        },
      };
    },
  };

  const executionContext = {
    getTask(taskId: string) {
      return registry.getTask(taskId);
    },
    getWorkUnit(taskId: string) {
      return workUnits.require(taskId);
    },
  };

  const controller = new ProjectOwnerMachineApi(
    machine,
    factory,
    {} as any,
    executionContext,
    new ProjectOwnerUiController(),
  );

  const result = await controller.handle({
    action: "create-mission",
    input: {
      id: "ui-star-draw-proof",
      projectName: "Star Draw",
      objective: "Build a creative drawing application from the owner's vision.",
      requirements: [
        "Multiple brush types",
        "Image upload",
        "Painting and sketching",
        "Zoom for precision",
        "Save the finished work",
      ],
      constraints: [],
      acceptanceCriteria: [
        "The app launches.",
        "The owner can draw and save a finished image.",
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.view?.plan.milestones[0]?.taskIds.length, 1);
  assert.ok(result.view?.plan.milestones[0]?.taskIds[0]);
  assert.ok(
    workUnits.has(
      result.view!.plan.milestones[0].taskIds[0],
    ),
  );

  console.log("K.I.N.G.S. OWNER VISION → TASK: SUCCESS");
  console.log("K.I.N.G.S. OWNER VISION → WORK UNIT: SUCCESS");
  console.log("TREE-KCM-OWNER-VISION-COMPILER: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-OWNER-VISION-COMPILER: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
