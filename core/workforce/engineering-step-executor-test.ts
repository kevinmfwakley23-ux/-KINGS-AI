import { EngineeringStepExecutor } from "./engineering-step-executor";
import type { AutonomousEngineeringExecution } from "./autonomous-engineering-execution";
import type { BuiltEngineeringCommand } from "./engineering-command-builder";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function expectFailure(action: () => Promise<unknown>, message: string): Promise<void> {
  let failed = false;
  try {
    await action();
  } catch {
    failed = true;
  }
  assert(failed, message);
}

async function main(): Promise<void> {
  const executor = new EngineeringStepExecutor();
  const execution: AutonomousEngineeringExecution = {
    id: "engineering-execution-tree-0831",
    projectId: "project-tree-0831",
    status: "ready",
    steps: [{
      id: "engineering-step-tree-0831",
      language: "typescript",
      operation: "build",
      capabilityId: "engineering-typescript",
      sequence: 1,
    }],
    currentStepId: "engineering-step-tree-0831",
    completedStepIds: [],
    blockedReasons: [],
  };

  const command: BuiltEngineeringCommand = {
    id: "command-tree-0831",
    projectId: "project-tree-0831",
    executionStepId: "engineering-step-tree-0831",
    workingDirectory: "/tmp",
    authorized: true,
    language: "typescript",
    operation: "build",
    executable: "/bin/true",
    args: [],
  };

  const result = await executor.execute({
    id: "step-execution-tree-0831",
    projectId: "project-tree-0831",
    executionId: execution.id,
    step: execution.steps[0],
    command,
  }, execution);

  assert(result.started, "Authorized engineering steps must actually start.");
  assert(result.completed, "Successful engineering steps must produce a completed result.");
  assert(result.exitCode === 0, "Successful engineering execution must report exit code zero.");
  assert(result.evidence.length > 0, "Engineering execution must produce evidence.");

  console.log("08.31 governed engineering step execution: SUCCESS");

  const wrongProject = { ...execution, projectId: "wrong-project" };
  await expectFailure(() => executor.execute({
    id: "wrong-project-execution",
    projectId: execution.projectId,
    executionId: execution.id,
    step: execution.steps[0],
    command,
  }, wrongProject), "Execution must enforce project identity.");
  console.log("08.31 project identity enforcement: SUCCESS");

  const wrongLanguageCommand: BuiltEngineeringCommand = { ...command, language: "python" };
  await expectFailure(() => executor.execute({
    id: "wrong-language-command",
    projectId: execution.projectId,
    executionId: execution.id,
    step: execution.steps[0],
    command: wrongLanguageCommand,
  }, execution), "Execution must reject commands for the wrong language.");
  console.log("08.31 language authorization enforcement: SUCCESS");

  const wrongOperationCommand: BuiltEngineeringCommand = { ...command, operation: "test" };
  await expectFailure(() => executor.execute({
    id: "wrong-operation-command",
    projectId: execution.projectId,
    executionId: execution.id,
    step: execution.steps[0],
    command: wrongOperationCommand,
  }, execution), "Execution must reject commands for the wrong operation.");
  console.log("08.31 operation authorization enforcement: SUCCESS");

  const blockedExecution: AutonomousEngineeringExecution = { ...execution, status: "blocked" };
  await expectFailure(() => executor.execute({
    id: "blocked-execution",
    projectId: execution.projectId,
    executionId: execution.id,
    step: execution.steps[0],
    command,
  }, blockedExecution), "Blocked engineering execution must never execute.");
  console.log("08.31 blocked-execution protection: SUCCESS");

  console.log("TREE-08.31 GOVERNED ENGINEERING STEP EXECUTOR: SUCCESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
