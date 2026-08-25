import {
  mkdtemp,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { KingsCodingMachine } from "./kings-coding-machine";
import { TaskControl } from "./task-control";
import { WorkforceRegistry } from "./registry";
import type { Mission, Task } from "./types";
import type { MissionPlan } from "./mission-continuity";
import { EngineeringRuntimeExecutor } from "./engineering-runtime-executor";
import {
  EngineeringToolchainRegistry,
  createDefaultEngineeringToolchains,
} from "./engineering-toolchain";
import { ToolchainVerificationAuthority } from "./toolchain-verification";
import { AutonomousEngineeringExecutionAuthority } from "./autonomous-engineering-execution";
import { EngineeringWorkspaceAuthority } from "./engineering-workspace";
import { EngineeringWorkUnitBridge } from "./engineering-work-unit-bridge";
import { ProjectEngineeringProfileAuthority } from "./project-engineering-profile";

type Assert = (
  condition: unknown,
  message: string,
) => asserts condition;

const assert: Assert = (
  condition,
  message,
): asserts condition => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
};

async function main(): Promise<void> {
  console.log("KCM TEST START");

  const now = new Date().toISOString();
  const root = await mkdtemp("/tmp/kings-kcm-real-");
  const proofFile = join(root, "kcm-proof.js");

  await writeFile(
    proofFile,
    'process.stdout.write("KCM_REAL_EXECUTION_GREEN");\n',
    "utf8",
  );

  const mission: Mission = {
    id: "mission-kcm-real",
    name: "KCM real execution",
    description: "Prove the coding machine can drive the real Linux execution pipeline.",
    status: "active",
    objectives: ["Execute one real governed engineering operation."],
    sourceReferences: ["test://kcm-real-execution"],
    createdAt: now,
    updatedAt: now,
  };

  const task: Task = {
    id: "task-kcm-real",
    missionId: mission.id,
    name: "Run KCM proof",
    description: "Execute the KCM proof program.",
    requiredCapabilities: ["engineering-javascript"],
    requiredToolIds: [],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: ["KCM_REAL_EXECUTION_GREEN"],
    createdAt: now,
    updatedAt: now,
  };

  const plan: MissionPlan = {
    id: "plan-kcm-real",
    missionId: mission.id,
    version: 1,
    objective: "Execute one real governed engineering operation.",
    milestones: [
      {
        id: "milestone-kcm-real",
        missionId: mission.id,
        name: "Real execution",
        objective: "Execute the proof program.",
        taskIds: [task.id],
        dependencyIds: [],
        status: "active",
      },
    ],
    decisionIds: [],
    acceptanceCriteria: ["The real command executes successfully."],
    locked: false,
    approvedByHuman: false,
    createdAt: now,
    updatedAt: now,
  };

  const registry = new WorkforceRegistry();
  registry.registerTask(task);

  const machine = new KingsCodingMachine(
    undefined,
    undefined,
    new TaskControl(registry),
  );

  machine.startMission({ mission, plan });
  machine.approvePlan(mission.id);
  const locked = machine.lockPlan(mission.id);
  assert(locked.locked, "plan did not lock");

  const toolchains = new EngineeringToolchainRegistry();
  for (const toolchain of createDefaultEngineeringToolchains()) {
    toolchains.register(toolchain);
  }

  const verified = new ToolchainVerificationAuthority(toolchains).verify({
    language: "javascript",
    requiredOperations: ["run"],
    probes: [
      {
        executable: "node",
        available: true,
        version: process.version,
        capabilities: ["runtime:javascript"],
      },
    ],
  });

  assert(verified.verified, "javascript toolchain should verify");

  const proofToolchain = {
    ...verified.toolchain,
    commands: verified.toolchain.commands.map((command) =>
      command.operation === "run"
        ? { ...command, args: [proofFile] }
        : command,
    ),
  };

  const profile = new ProjectEngineeringProfileAuthority().build({
    id: "profile-kcm-real",
    projectPath: root,
    languages: [
      {
        language: "javascript",
        fileCount: 1,
        extensions: [".js"],
      },
    ],
    requiredOperations: ["run"],
    toolchainResults: [verified],
  });

  const engineeringPlan = new EngineeringWorkUnitBridge().createPlan(
    mission.id,
    profile,
  );

  assert(!engineeringPlan.blocked, "engineering plan must be unblocked");

  const execution = new AutonomousEngineeringExecutionAuthority().plan({
    id: "execution-kcm-real",
    projectId: mission.id,
    profile,
    plan: engineeringPlan,
  });

  assert(execution.currentStepId, "engineering execution has no current step");

  const workspace = new EngineeringWorkspaceAuthority().create({
    id: "workspace-kcm-real",
    projectId: mission.id,
    rootPath: root,
    allowedPaths: [root],
    allowedLanguages: ["javascript"],
    allowedOperations: ["run"],
  });

  const runtime = new EngineeringRuntimeExecutor({
    sandboxPolicy: {
      allowedCommands: [process.execPath],
      allowedWorkingDirectories: [root],
      allowedReadPaths: [root],
      allowedWritePaths: [root],
      allowedEnvironmentKeys: [],
      allowedSideEffects: ["read", "write", "execute"],
      timeoutMs: 10_000,
      maxOutputBytes: 16_384,
      maxConcurrentProcesses: 1,
      allowShell: false,
      allowNetwork: false,
    },
  });

  const result = await machine.executeEngineeringStep(
    {
      missionId: mission.id,
      projectId: mission.id,
      execution,
      step: execution.steps[0],
      workspace,
      toolchain: proofToolchain,
      completedAt: new Date().toISOString(),
    },
    runtime,
  );

  console.log("PIPELINE STATUS:", result.pipeline.execution.status);
  console.log("EXIT CODE:", result.pipeline.step.exitCode);
  console.log("STDOUT:", JSON.stringify(result.pipeline.step.stdout));

  assert(result.pipeline.realExecution, "machine did not reach real execution");
  assert(result.pipeline.execution.status === "completed", "real execution did not complete");
  assert(result.pipeline.step.exitCode === 0, "real command did not exit successfully");
  assert(
    result.pipeline.step.stdout.includes("KCM_REAL_EXECUTION_GREEN"),
    "real command output did not propagate",
  );
  assert(result.execution.completedStepIds.length === 1, "machine did not advance execution state");
  assert(
    result.missionState.completedTaskIds.includes(execution.steps[0].id),
    "machine did not update mission state",
  );

  console.log("K.I.N.G.S. MACHINE → REAL LINUX EXECUTION: SUCCESS");
  console.log("K.I.N.G.S. MACHINE → EXECUTION STATE ADVANCE: SUCCESS");
  console.log("K.I.N.G.S. MACHINE → MISSION STATE UPDATE: SUCCESS");
  console.log("TREE-KCM-EXECUTION: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-EXECUTION: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
