import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

import type {
  AgentDefinition,
  Mission,
  Task,
} from "./types";
import {
  WorkforceRegistry,
} from "./registry";
import {
  MissionExecutionCoordinator,
} from "./mission-execution-coordinator";
import {
  HttpOllamaExecutionClient,
  type OllamaHttpTransport,
} from "./ollama-execution-client";
import {
  OllamaIntelligenceModel,
} from "./ollama-intelligence-model";
import {
  ControlledFileEditor,
} from "./file-editor";
import {
  EngineeringRepairEditor,
} from "./engineering-repair-editor";
import {
  EngineeringWorkspaceAuthority,
} from "./engineering-workspace";
import {
  LocalCodingWriteBridge,
} from "./local-coding-write-bridge";
import {
  LocalEngineeringExecutionRunner,
} from "./local-engineering-execution-runner";
import {
  LocalEngineeringRecoveryCycle,
} from "./local-engineering-recovery-cycle";
import {
  LocalModelEngineeringRepairCoordinator,
} from "./local-model-engineering-repair-coordinator";
import {
  LocalProjectEngineeringReadinessAuthority,
} from "./local-project-engineering-readiness";

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main(): Promise<void> {
  const missionId =
    "mission-v1-acceptance-010-local-debug-repair";
  const diagnoseTaskId =
    "task-v1-acceptance-010-diagnose";
  const repairTaskId =
    "task-v1-acceptance-010-repair";
  const verifyTaskId =
    "task-v1-acceptance-010-verify";
  const modelId =
    process.env.KINGS_OLLAMA_MODEL?.trim() ||
    "qwen2.5-coder:0.5b";
  const ollamaBaseUrl =
    (
      process.env.KINGS_OLLAMA_BASE_URL?.trim() ||
      "http://127.0.0.1:11434"
    ).replace(/\/$/, "");

  const root = await createBrokenProject();

  try {
    const now = new Date().toISOString();
    const registry = new WorkforceRegistry();

    const mission: Mission = {
      id: missionId,
      name: "K.I.N.G.S. Local Debug/Repair Acceptance Mission",
      description:
        "Diagnose and repair a real failing repository using governed local intelligence only.",
      status: "active",
      objectives: [
        "Capture a real repository-native test failure.",
        "Use internal-local intelligence to propose the smallest repair.",
        "Authorize and write only the bounded source file.",
        "Rerun build and test before accepting completion.",
      ],
      sourceReferences: [
        "KINGS-V1-MASTER-CURRENT-REFERENCE.md",
      ],
      createdAt: now,
      updatedAt: now,
    };

    const agent: AgentDefinition = {
      id: "agent-v1-acceptance-010-local",
      name: "K.I.N.G.S. Local Debug/Repair Worker",
      role: "engineering-worker",
      description:
        "Runs repository diagnosis, governed local-model repair, and verification.",
      capabilities: [
        "coding",
        "debugging",
        "recovery",
        "verification",
      ],
      toolIds: [],
      status: "available",
    };

    const diagnoseTask: Task = {
      id: diagnoseTaskId,
      missionId,
      name: "Diagnose real repository failure",
      description:
        "Run the repository build/test workflow and preserve the actual failure evidence.",
      requiredCapabilities: ["debugging"],
      requiredToolIds: [],
      status: "ready",
      dependencyIds: [],
      inputReferences: ["package.json", "src/add.cjs", "test.cjs"],
      expectedOutputs: ["failed-engineering-report"],
      createdAt: now,
      updatedAt: now,
    };

    const repairTask: Task = {
      id: repairTaskId,
      missionId,
      name: "Repair verified repository failure",
      description:
        "Use internal-local intelligence to propose and apply a governed repair, then retest.",
      requiredCapabilities: ["coding", "debugging", "recovery"],
      requiredToolIds: [],
      status: "ready",
      dependencyIds: [diagnoseTaskId],
      inputReferences: ["failed-engineering-report", "src/add.cjs"],
      expectedOutputs: ["verified-repair"],
      createdAt: now,
      updatedAt: now,
    };

    const verifyTask: Task = {
      id: verifyTaskId,
      missionId,
      name: "Verify repaired repository",
      description:
        "Require repository-native proof from the successful post-repair test run.",
      requiredCapabilities: ["verification"],
      requiredToolIds: [],
      status: "ready",
      dependencyIds: [repairTaskId],
      inputReferences: ["verified-repair"],
      expectedOutputs: ["local-repair-proof.txt"],
      createdAt: now,
      updatedAt: now,
    };

    registry.registerMission(mission);
    registry.registerAgent(agent);
    registry.registerTask(diagnoseTask);
    registry.registerTask(repairTask);
    registry.registerTask(verifyTask);

    const missionCoordinator =
      new MissionExecutionCoordinator({ registry });

    const firstDispatch =
      missionCoordinator.dispatchNext(missionId);
    assert(
      firstDispatch?.taskId === diagnoseTaskId,
      "Diagnosis must be the first runnable mission task.",
    );

    const readiness =
      await new LocalProjectEngineeringReadinessAuthority().inspect({
        id: missionId,
        projectPath: root,
        requiredOperations: ["build", "test"],
        executionId: "engineering-v1-acceptance-010",
      });
    assert(
      readiness.execution.status === "ready",
      `Fixture repository must be locally executable: ${readiness.blockedReasons.join("; ")}`,
    );

    const runner = new LocalEngineeringExecutionRunner();
    const failedReport = runner.execute({
      readiness,
      authorized: true,
      timeoutMs: 30_000,
    });
    assert(
      failedReport.status === "failed",
      "Acceptance repository must produce a real initial failure.",
    );
    assert(
      failedReport.evidence.some(
        (item) =>
          item.operation === "test" &&
          item.exitCode === 7 &&
          item.stderr.includes("expected 42"),
      ),
      "Real test failure diagnostics must preserve the expected/actual signal.",
    );

    missionCoordinator.completeTask(diagnoseTaskId);
    const secondDispatch =
      missionCoordinator.dispatchNext(missionId);
    assert(
      secondDispatch?.taskId === repairTaskId,
      "Repair must become runnable only after failure evidence is captured.",
    );

    const transport: OllamaHttpTransport = {
      async post(path, body) {
        const response = await fetch(
          `${ollamaBaseUrl}${path}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Ollama HTTP ${response.status}: ${text}`,
          );
        }

        return response.json();
      },
    };

    const ollamaClient =
      new HttpOllamaExecutionClient(transport);
    const localModel =
      new OllamaIntelligenceModel(
        ollamaClient,
        modelId,
        [
          "reasoning",
          "coding",
          "debugging",
          "recovery",
          "verification",
        ],
      );

    const workspace =
      new EngineeringWorkspaceAuthority().create({
        id: "workspace-v1-acceptance-010",
        projectId: missionId,
        rootPath: root,
        allowedPaths: ["src/add.cjs"],
        allowedLanguages: ["javascript"],
        allowedOperations: ["create"],
      });

    const sourceBefore =
      await readFile(join(root, "src", "add.cjs"), "utf8");
    const writer =
      new LocalCodingWriteBridge(
        new EngineeringRepairEditor(
          new ControlledFileEditor({
            allowedReadPaths: [root],
            allowedWritePaths: [root],
            maxFileBytes: 64 * 1024,
          }),
        ),
      );
    const repairCoordinator =
      new LocalModelEngineeringRepairCoordinator(
        localModel,
        new LocalEngineeringRecoveryCycle(writer, runner),
      );

    const repair = await repairCoordinator.execute({
      readiness,
      report: failedReport,
      workspace,
      objective: [
        "Repair src/add.cjs so its exported add(a, b) function returns the numeric sum of a and b.",
        "Preserve the CommonJS exported function API and make no unrelated change.",
      ].join(" "),
      allowedPaths: ["src/add.cjs"],
      contextFiles: [
        {
          path: "src/add.cjs",
          content: sourceBefore,
        },
      ],
      attemptNumber: 1,
      policy: {
        maxRetries: 0,
        allowRepair: true,
      },
      authorized: true,
      timeoutMs: 30_000,
      maxOutputTokens: 512,
    });

    assert(
      repair.modelInvoked,
      "The repair mission must invoke local intelligence after the verified failure.",
    );
    assert(
      repair.modelResult?.success === true &&
      repair.modelResult.response?.model.providerKind === "internal-local",
      "Repair inference must come from the configured internal-local model.",
    );
    assert(
      repair.modelResult.response?.usage.estimatedCost === 0,
      "Local repair inference must report zero external-provider cost.",
    );
    assert(
      repair.proposal?.changes.length === 1 &&
      repair.proposal.changes[0].path === "src/add.cjs",
      "The local model must produce exactly one authorized source-file repair.",
    );
    assert(
      repair.cycle.writeResult?.writes.length === 1,
      "The authorized repair must pass through the governed writer.",
    );
    assert(
      repair.cycle.retestReport?.status === "completed",
      "Repository-native build/test validation must rerun after the repair.",
    );
    assert(
      repair.status === "completed" && repair.verified,
      repair.failureReason ||
        "Local model repair must not complete until the real retest is green.",
    );

    missionCoordinator.completeTask(repairTaskId);
    const thirdDispatch =
      missionCoordinator.dispatchNext(missionId);
    assert(
      thirdDispatch?.taskId === verifyTaskId,
      "Final verification must become runnable only after the governed repair is verified.",
    );

    const proof =
      await readFile(join(root, "local-repair-proof.txt"), "utf8");
    const repairedSource =
      await readFile(join(root, "src", "add.cjs"), "utf8");
    assert(
      proof.trim() === "42",
      "Successful post-repair repository test must create the expected proof artifact.",
    );
    assert(
      repairedSource !== sourceBefore,
      "The verified repair must change the originally broken source file.",
    );

    missionCoordinator.completeTask(verifyTaskId);
    mission.status = "completed";
    mission.updatedAt = new Date().toISOString();

    const finalSnapshot =
      missionCoordinator.snapshot(missionId);
    assert(
      finalSnapshot.completedTaskIds.length === 3 &&
      finalSnapshot.failedTaskIds.length === 0 &&
      finalSnapshot.runningTaskIds.length === 0 &&
      mission.status === "completed",
      "The local debug/repair mission must end with all tasks completed and no failed/running work.",
    );

    console.log(
      "V1-ACCEPTANCE-010 real failure evidence: SUCCESS",
    );
    console.log(
      "V1-ACCEPTANCE-010 local model governed repair: SUCCESS",
    );
    console.log(
      "V1-ACCEPTANCE-010 real build/test retest: SUCCESS",
    );
    console.log(
      "V1-ACCEPTANCE-010 LOCAL DEBUG/REPAIR MISSION: SUCCESS",
    );
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
}

async function createBrokenProject(): Promise<string> {
  const root =
    await mkdtemp(
      join(tmpdir(), "kings-v1-local-debug-repair-"),
    );

  await mkdir(join(root, "src"), {
    recursive: true,
  });
  await writeFile(
    join(root, "src", "add.cjs"),
    [
      "function add(a, b) {",
      "  return a - b;",
      "}",
      "",
      "module.exports = add;",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "build.cjs"),
    [
      "const fs = require('node:fs');",
      "const add = require('./src/add.cjs');",
      "if (typeof add !== 'function') { console.error('add export missing'); process.exit(5); }",
      "fs.writeFileSync('build-proof.txt', 'built\\n');",
      "console.log('LOCAL_DEBUG_REPAIR_BUILD_OK');",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "test.cjs"),
    [
      "const fs = require('node:fs');",
      "const add = require('./src/add.cjs');",
      "const actual = add(20, 22);",
      "if (actual !== 42) { console.error(`expected 42 but received ${actual}`); process.exit(7); }",
      "fs.writeFileSync('local-repair-proof.txt', String(actual) + '\\n');",
      "console.log('LOCAL_DEBUG_REPAIR_TEST_OK');",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "kings-v1-local-debug-repair-fixture",
        version: "1.0.0",
        private: true,
        packageManager: "npm@10.0.0",
        scripts: {
          build: "node build.cjs",
          test: "node test.cjs",
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await writeFile(
    join(root, "package-lock.json"),
    JSON.stringify(
      {
        name: "kings-v1-local-debug-repair-fixture",
        version: "1.0.0",
        lockfileVersion: 3,
        requires: true,
        packages: {
          "": {
            name: "kings-v1-local-debug-repair-fixture",
            version: "1.0.0",
          },
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return root;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
